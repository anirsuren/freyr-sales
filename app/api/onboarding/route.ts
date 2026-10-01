import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  type AccessGrant,
  verifyAccessGrant,
} from "@/lib/accessControl";
import {
  notStartedOnboardingState,
  OnboardingValidationError,
  parseOnboardingAction,
  type OnboardingAction,
  type OnboardingState,
} from "@/lib/onboarding";
import {
  getOnboardingState,
  type OnboardingAccessContext,
  OnboardingStoreError,
  updateOnboardingState,
} from "@/lib/onboardingStore";
import { authenticatedRequestPrincipal } from "@/lib/requestPrincipal";

import { getRole } from "@/lib/role";
import { viewerAccessMap } from "@/lib/viewerAccess";
import { canAccessModuleWith } from "@/lib/moduleAccess";
import { PRODUCT_TOUR_STEPS } from "@/lib/productTourCatalog";
import type { OnboardingResponse } from "@/lib/onboarding";

async function withTourAccess(response: OnboardingResponse) {
  const [role, access] = await Promise.all([getRole(), viewerAccessMap()]);
  const routes = [...new Set(PRODUCT_TOUR_STEPS.map((step) => step.route))];
  return { ...response, role, tourRoutes: routes.filter((route) => canAccessModuleWith(route, role, access)) };
}

export const dynamic = "force-dynamic";

/**
 * LOCAL DEVELOPMENT ONLY. A server started without AUTH_MODE has no signed-in
 * person and no access grant, so the tour answered 401 and could not be tried
 * at all on a local persona. There it keeps the state in this process's
 * memory, one tour per local persona, and never touches the database. Any
 * deployment sets AUTH_MODE, so this branch cannot run there.
 */
function localTourEnabled(): boolean {
  return !process.env.AUTH_MODE && process.env.NODE_ENV !== "production";
}

const localTours: Map<string, OnboardingState> = ((
  globalThis as { __freyrLocalTours?: Map<string, OnboardingState> }
).__freyrLocalTours ??= new Map());

function localTourKey(): string {
  return process.env.FREYR_LOCAL_IDENTITY_EMAIL?.trim().toLowerCase() || "local";
}

/** The same rules as the database store: finished or skipped stays that way until a reset. */
function nextLocalTour(current: OnboardingState, action: OnboardingAction): OnboardingState {
  if (action.action === "reset") return notStartedOnboardingState();
  if (current.status === "completed" || current.status === "skipped") return current;
  const now = new Date().toISOString();
  const status =
    action.action === "complete" ? "completed" : action.action === "skip" ? "skipped" : "in_progress";
  return {
    version: current.version,
    status,
    currentStep: action.currentStep ?? current.currentStep,
    ...(status === "completed" ? { completedAt: now } : {}),
    ...(status === "skipped" ? { skippedAt: now } : {}),
  };
}

async function localTourResponse(state: OnboardingState) {
  return withTourAccess({ state, role: (await getRole()) as OnboardingResponse["role"] });
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function authorizedContext(
  request: NextRequest
): Promise<
  | { access: OnboardingAccessContext }
  | { response: NextResponse }
> {
  const principal = await authenticatedRequestPrincipal(request);
  if (!principal) {
    return {
      response: json({ error: "Authentication required." }, 401),
    };
  }

  const grant: AccessGrant | null = await verifyAccessGrant(
    request.cookies.get(ACCESS_COOKIE)?.value
  );
  if (!grant || grant.sub !== principal.id) {
    return {
      response: json({ error: "Current workspace access is required." }, 403),
    };
  }

  return {
    access: {
      subject: principal.id,
      workspaceId: grant.workspaceId,
      userId: grant.userId,
      role: grant.role,
    },
  };
}

function storeFailure(error: unknown) {
  if (error instanceof OnboardingStoreError) {
    return json({ error: error.message }, error.status);
  }
  return json({ error: "Onboarding is unavailable." }, 503);
}

export async function GET(request: NextRequest) {
  if (localTourEnabled() && !(await authenticatedRequestPrincipal(request))) {
    return json(await localTourResponse(localTours.get(localTourKey()) ?? notStartedOnboardingState()));
  }
  const authorization = await authorizedContext(request);
  if ("response" in authorization) return authorization.response;

  try {
    return json(await withTourAccess(await getOnboardingState(authorization.access)));
  } catch (error) {
    return storeFailure(error);
  }
}

export async function PATCH(request: NextRequest) {
  const local = localTourEnabled() && !(await authenticatedRequestPrincipal(request));
  const authorization = local ? null : await authorizedContext(request);
  if (authorization && "response" in authorization) return authorization.response;

  let action;
  try {
    action = parseOnboardingAction(await request.json());
  } catch (error) {
    return json(
      {
        error:
          error instanceof OnboardingValidationError
            ? error.message
            : "Enter a valid onboarding action.",
      },
      400
    );
  }

  if (!authorization) {
    const key = localTourKey();
    const next = nextLocalTour(localTours.get(key) ?? notStartedOnboardingState(), action);
    localTours.set(key, next);
    return json(await localTourResponse(next));
  }

  try {
    return json(
      await withTourAccess(await updateOnboardingState(authorization.access, action))
    );
  } catch (error) {
    return storeFailure(error);
  }
}
