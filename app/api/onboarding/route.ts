import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  type AccessGrant,
  verifyAccessGrant,
} from "@/lib/accessControl";
import {
  OnboardingValidationError,
  parseOnboardingAction,
} from "@/lib/onboarding";
import {
  getOnboardingState,
  type OnboardingAccessContext,
  OnboardingStoreError,
  updateOnboardingState,
} from "@/lib/onboardingStore";
import { authenticatedRequestPrincipal } from "@/lib/requestPrincipal";

export const dynamic = "force-dynamic";

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
  const authorization = await authorizedContext(request);
  if ("response" in authorization) return authorization.response;

  try {
    return json(await getOnboardingState(authorization.access));
  } catch (error) {
    return storeFailure(error);
  }
}

export async function PATCH(request: NextRequest) {
  const authorization = await authorizedContext(request);
  if ("response" in authorization) return authorization.response;

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

  try {
    return json(
      await updateOnboardingState(authorization.access, action)
    );
  } catch (error) {
    return storeFailure(error);
  }
}
