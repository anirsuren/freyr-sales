"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { ProductTourOverlay } from "./ProductTourOverlay";
import {
  ONBOARDING_START_EVENT,
  type OnboardingStartDetail,
} from "./productTourEvents";
import type {
  OnboardingAction,
  OnboardingResponse,
  OnboardingState,
} from "@/lib/onboarding";
import { TOUR_VERSION } from "@/lib/onboarding";
import {
  getProductTourSteps,
  type ProductTourStep,
} from "@/lib/productTourCatalog";

export {
  ONBOARDING_START_EVENT,
  requestProductTourStart,
} from "./productTourEvents";

type LoadPhase = "idle" | "loading" | "ready" | "error";
type StartRequest = OnboardingStartDetail & { id: number };

function isOnboardingState(value: unknown): value is OnboardingState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Partial<OnboardingState>;
  return (
    state.version === TOUR_VERSION &&
    ["not_started", "in_progress", "completed", "skipped"].includes(
      String(state.status)
    ) &&
    Number.isInteger(state.currentStep) &&
    Number(state.currentStep) >= 0
  );
}

function isOnboardingResponse(value: unknown): value is OnboardingResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const response = value as Partial<OnboardingResponse>;
  return (
    isOnboardingState(response.state) &&
    ["sales", "editor", "admin"].includes(String(response.role))
  );
}

async function responseError(
  response: Response,
  fallback: string
): Promise<Error> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim()) {
      return new Error(body.error);
    }
  } catch {
    // The fallback remains useful for empty and non-JSON responses.
  }
  return new Error(fallback);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

/**
 * Persisted progress is a canonical catalog index. When a role or release
 * filter removes that exact step, resume at the closest available feature.
 */
export function localTourIndexForCatalogStep(
  steps: readonly ProductTourStep[],
  catalogIndex: number
): number {
  if (steps.length === 0) return 0;
  const exact = steps.findIndex((step) => step.catalogIndex === catalogIndex);
  if (exact >= 0) return exact;

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  steps.forEach((step, index) => {
    const distance = Math.abs(step.catalogIndex - catalogIndex);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });
  return nearestIndex;
}

function routeMatches(route: string, pathname: string): boolean {
  if (typeof window === "undefined") return false;
  const expected = new URL(route, window.location.origin);
  if (expected.pathname !== pathname) return false;
  const current = new URLSearchParams(window.location.search);
  return Array.from(expected.searchParams.entries()).every(
    ([key, value]) => current.get(key) === value
  );
}

function providerEnabled(pathname: string): boolean {
  return (
    pathname !== "/login" &&
    pathname !== "/access-pending" &&
    !/^\/customers\/[^/]+\/report$/.test(pathname)
  );
}

export function ProductTourProvider({
  offeringsOnly,
  autoStart = true,
  children,
}: {
  offeringsOnly: boolean;
  autoStart?: boolean;
  children?: ReactNode;
}) {
  const pathname = usePathname() || "";
  const router = useRouter();
  const enabled = providerEnabled(pathname);
  const [phase, setPhase] = useState<LoadPhase>("idle");
  const [snapshot, setSnapshot] = useState<OnboardingResponse | null>(null);
  const [active, setActive] = useState(false);
  const [localStep, setLocalStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startRequest, setStartRequest] = useState<StartRequest | null>(null);
  const mountedRef = useRef(false);
  const loadInFlightRef = useRef(false);
  const operationInFlightRef = useRef(false);
  const hydratedRef = useRef(false);
  const requestIdRef = useRef(0);

  const steps = useMemo(
    () =>
      getProductTourSteps({
        offeringsOnly,
        role: snapshot?.role,
      }),
    [offeringsOnly, snapshot?.role]
  );

  const navigateTo = useCallback(
    (route: string) => {
      if (!routeMatches(route, pathname)) router.push(route);
    },
    [pathname, router]
  );

  const loadOnboarding = useCallback(async () => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    if (mountedRef.current) setPhase("loading");
    try {
      const response = await fetch("/api/onboarding", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw await responseError(response, "The product tour is unavailable.");
      }
      const body: unknown = await response.json();
      if (!isOnboardingResponse(body)) {
        throw new Error("The product tour returned an invalid response.");
      }
      if (!mountedRef.current) return;
      setSnapshot(body);
      setPhase("ready");
    } catch {
      if (mountedRef.current) setPhase("error");
    } finally {
      loadInFlightRef.current = false;
    }
  }, []);

  const patchOnboarding = useCallback(
    async (action: OnboardingAction): Promise<OnboardingResponse> => {
      const response = await fetch("/api/onboarding", {
        method: "PATCH",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(action),
      });
      if (!response.ok) {
        throw await responseError(
          response,
          "We could not save your tour progress."
        );
      }
      const body: unknown = await response.json();
      if (!isOnboardingResponse(body)) {
        throw new Error("The product tour returned an invalid response.");
      }
      if (mountedRef.current) setSnapshot(body);
      return body;
    },
    []
  );

  const beginTour = useCallback(
    async (restart = false) => {
      if (!snapshot || steps.length === 0 || operationInFlightRef.current) {
        return;
      }

      operationInFlightRef.current = true;
      hydratedRef.current = true;
      const reset =
        restart ||
        snapshot.state.status === "completed" ||
        snapshot.state.status === "skipped";
      const nextLocalStep =
        !reset && snapshot.state.status === "in_progress"
          ? localTourIndexForCatalogStep(
              steps,
              snapshot.state.currentStep
            )
          : 0;
      const nextStep = steps[nextLocalStep];

      setLocalStep(nextLocalStep);
      setActive(true);
      setSaving(true);
      setError(null);
      navigateTo(nextStep.route);

      try {
        if (reset) await patchOnboarding({ action: "reset" });
        await patchOnboarding({
          action: "progress",
          currentStep: nextStep.catalogIndex,
        });
      } catch (cause) {
        if (mountedRef.current) {
          setError(
            cause instanceof Error
              ? cause.message
              : "We could not save your tour progress."
          );
        }
      } finally {
        operationInFlightRef.current = false;
        if (mountedRef.current) setSaving(false);
      }
    },
    [navigateTo, patchOnboarding, snapshot, steps]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (enabled && phase === "idle") void loadOnboarding();
  }, [enabled, loadOnboarding, phase]);

  useEffect(() => {
    const handleStart = (event: Event) => {
      const detail = (event as CustomEvent<OnboardingStartDetail>).detail;
      requestIdRef.current += 1;
      setStartRequest({
        id: requestIdRef.current,
        restart: detail?.restart === true,
      });
      setPhase((current) => (current === "error" ? "idle" : current));
    };
    window.addEventListener(ONBOARDING_START_EVENT, handleStart);
    return () =>
      window.removeEventListener(ONBOARDING_START_EVENT, handleStart);
  }, []);

  // Explicit launch requests take precedence over first-use hydration.
  useEffect(() => {
    if (!startRequest || phase !== "ready" || !snapshot) return;
    const request = startRequest;
    setStartRequest(null);
    void beginTour(request.restart);
  }, [beginTour, phase, snapshot, startRequest]);

  useEffect(() => {
    if (
      hydratedRef.current ||
      phase !== "ready" ||
      !snapshot ||
      steps.length === 0 ||
      startRequest
    ) {
      return;
    }
    hydratedRef.current = true;

    if (snapshot.state.status === "in_progress") {
      const nextLocalStep = localTourIndexForCatalogStep(
        steps,
        snapshot.state.currentStep
      );
      setLocalStep(nextLocalStep);
      setActive(true);
      navigateTo(steps[nextLocalStep].route);
      return;
    }

    const lastAvailableCatalogIndex =
      steps.reduce(
        (highest, step) => Math.max(highest, step.catalogIndex),
        steps[0].catalogIndex
      );
    if (
      !offeringsOnly &&
      snapshot.state.status === "completed" &&
      snapshot.state.currentStep < lastAvailableCatalogIndex
    ) {
      // A user who completed the smaller Offerings release should still see
      // newly available full-workspace features after the release expands.
      hydratedRef.current = false;
      void beginTour(true);
      return;
    }

    if (
      autoStart &&
      snapshot.state.status === "not_started"
    ) {
      hydratedRef.current = false;
      void beginTour(false);
    }
  }, [
    autoStart,
    beginTour,
    navigateTo,
    offeringsOnly,
    pathname,
    phase,
    snapshot,
    startRequest,
    steps,
  ]);

  // Browser navigation cannot strand an active tour on a different route.
  useEffect(() => {
    const step = steps[localStep];
    if (active && step && !routeMatches(step.route, pathname)) {
      navigateTo(step.route);
    }
  }, [active, localStep, navigateTo, pathname, steps]);

  const persistLocalStep = useCallback(
    async (nextLocalStep: number) => {
      if (operationInFlightRef.current || steps.length === 0) return;
      const safeLocalStep = clamp(nextLocalStep, 0, steps.length - 1);
      const step = steps[safeLocalStep];
      operationInFlightRef.current = true;
      setLocalStep(safeLocalStep);
      setSaving(true);
      setError(null);
      navigateTo(step.route);
      try {
        await patchOnboarding({
          action: "progress",
          currentStep: step.catalogIndex,
        });
      } catch (cause) {
        if (mountedRef.current) {
          setError(
            cause instanceof Error
              ? cause.message
              : "We could not save your tour progress."
          );
        }
      } finally {
        operationInFlightRef.current = false;
        if (mountedRef.current) setSaving(false);
      }
    },
    [navigateTo, patchOnboarding, steps]
  );

  const finishTour = useCallback(async () => {
    const step = steps[localStep];
    if (!step || operationInFlightRef.current) return;
    operationInFlightRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await patchOnboarding({
        action: "complete",
        currentStep: step.catalogIndex,
      });
      if (mountedRef.current) setActive(false);
    } catch (cause) {
      if (mountedRef.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : "We could not complete your product tour."
        );
      }
    } finally {
      operationInFlightRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  }, [localStep, patchOnboarding, steps]);

  const skipTour = useCallback(async () => {
    const step = steps[localStep];
    if (!step || operationInFlightRef.current) return;
    operationInFlightRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await patchOnboarding({
        action: "skip",
        currentStep: step.catalogIndex,
      });
      if (mountedRef.current) setActive(false);
    } catch (cause) {
      if (mountedRef.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : "We could not skip your product tour."
        );
      }
    } finally {
      operationInFlightRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  }, [localStep, patchOnboarding, steps]);

  const retry = useCallback(() => {
    void persistLocalStep(localStep);
  }, [localStep, persistLocalStep]);

  const currentStep = steps[localStep];

  return (
    <>
      {children}
      {active && currentStep && (
        <ProductTourOverlay
          step={currentStep}
          currentStep={localStep}
          totalSteps={steps.length}
          saving={saving}
          error={error}
          onBack={() => void persistLocalStep(localStep - 1)}
          onNext={() => {
            if (localStep === steps.length - 1) {
              void finishTour();
            } else {
              void persistLocalStep(localStep + 1);
            }
          }}
          onSkip={() => void skipTour()}
          onRetry={retry}
        />
      )}
    </>
  );
}
