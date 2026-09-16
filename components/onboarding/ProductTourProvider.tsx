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
  localTourIndexForCatalogStep,
} from "@/lib/productTourCatalog";
import {
  addMockModePrefix,
  isMockModePath,
  stripMockModePrefix,
} from "@/lib/modeUrl";

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
    ["admin", "bd_member", "bd_owner", "sol_member", "sales", "editor", "rep", "manager"].includes(String(response.role))
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

function isTerminalState(state: OnboardingState): boolean {
  return state.status === "completed" || state.status === "skipped";
}

function routeMatches(route: string, pathname: string): boolean {
  if (typeof window === "undefined") return false;
  const expected = new URL(route, window.location.origin);
  const currentPath = stripMockModePrefix(pathname);
  if (expected.pathname !== currentPath && !(expected.pathname === "/performance" && currentPath.startsWith("/performance/"))) return false;
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
  const [launching, setLaunching] = useState(false);
  const [localStep, setLocalStep] = useState(0);
  const [pendingStep, setPendingStep] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startRequest, setStartRequest] = useState<StartRequest | null>(null);
  const mountedRef = useRef(false);
  const loadInFlightRef = useRef(false);
  const hydratedRef = useRef(false);
  const requestIdRef = useRef(0);
  const tourSessionRef = useRef(0);
  const loadFailuresRef = useRef(0);

  const steps = useMemo(
    () =>
      getProductTourSteps({
        offeringsOnly,
        role: snapshot?.role,
        allowedRoutes: snapshot?.tourRoutes,
      }),
    [offeringsOnly, snapshot?.role, snapshot?.tourRoutes]
  );

  const navigateTo = useCallback(
    (route: string) => {
      if (routeMatches(route, pathname)) return;
      const destination = new URL(route, window.location.origin);
      const visiblePath = window.location.pathname;
      const nextPath = isMockModePath(visiblePath)
        ? addMockModePrefix(destination.pathname)
        : destination.pathname;
      router.push(`${nextPath}${destination.search}${destination.hash}`);
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
        signal: AbortSignal.timeout(15000),
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
      loadFailuresRef.current = 0;
      setSnapshot(body);
      setPhase("ready");
    } catch {
      if (mountedRef.current) {
        loadFailuresRef.current += 1;
        setPhase("error");
      }
    } finally {
      loadInFlightRef.current = false;
    }
  }, []);

  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const patchOnboarding = useCallback(
    (action: OnboardingAction): Promise<OnboardingResponse> => {
      const session = tourSessionRef.current;
      const save = async (): Promise<OnboardingResponse> => {
        const response = await fetch("/api/onboarding", {
          method: "PATCH",
          signal: AbortSignal.timeout(15000),
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
        if (mountedRef.current && session === tourSessionRef.current) setSnapshot(body);
        return body;
      };
      const pending = saveQueue.current.catch(() => undefined).then(save);
      saveQueue.current = pending;
      return pending;
    },
    []
  );

  const beginTour = useCallback(
    async (restart = false) => {
      if (!snapshot || steps.length === 0) {
        return;
      }

      const session = ++tourSessionRef.current;
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

      setPendingStep(null);
      setLocalStep(nextLocalStep);
      setLaunching(true);
      setActive(true);
      setSaving(true);
      setError(null);
      navigateTo(nextStep.route);

      try {
        // Queue reset and first progress together so rapid Next clicks cannot
        // insert a newer progress save before the initial step save.
        const resetSave = reset ? patchOnboarding({ action: "reset" }) : Promise.resolve();
        const progressSave = patchOnboarding({
          action: "progress",
          currentStep: nextStep.catalogIndex,
        });
        const [, response] = await Promise.all([resetSave, progressSave]);
        // A concurrent tab may have completed or skipped after our reset/read.
        // The API treats that terminal state as authoritative.
        if (mountedRef.current && session === tourSessionRef.current && isTerminalState(response.state)) {
          setActive(false);
        }
      } catch (cause) {
        if (mountedRef.current && session === tourSessionRef.current) {
          setError(
            cause instanceof Error
              ? cause.message
              : "We could not save your tour progress."
          );
        }
      } finally {
          if (mountedRef.current && session === tourSessionRef.current) setSaving(false);
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
    // Durable tour state is an authenticated feature. The unauthenticated
    // local/demo shell must not repeatedly call a protected endpoint and fill
    // the console with expected 401s. Explicit launch requests still attempt
    // to load, which keeps the control useful in authenticated environments.
    if (
      enabled &&
      phase === "idle" &&
      (autoStart || startRequest !== null)
    ) {
      void loadOnboarding();
    }
  }, [autoStart, enabled, loadOnboarding, phase, startRequest]);

  // Immediately after login, the durable access grant and onboarding store can
  // become available a fraction of a second after the app shell mounts. Retry a
  // bounded number of times so that one transient response cannot silently
  // suppress first-use onboarding for the whole session.
  useEffect(() => {
    if (
      !enabled ||
      phase !== "error" ||
      loadFailuresRef.current >= 5
    ) {
      return;
    }
    const delay = Math.min(
      3200,
      400 * 2 ** Math.max(0, loadFailuresRef.current - 1)
    );
    const timeout = window.setTimeout(() => {
      setPhase((current) => (current === "error" ? "idle" : current));
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [enabled, phase]);

  useEffect(() => {
    const handleStart = (event: Event) => {
      const detail = (event as CustomEvent<OnboardingStartDetail>).detail;
      // Discard the previous tour before processing a new launch request.
      setActive(false);
      setPendingStep(null);
      requestIdRef.current += 1;
      loadFailuresRef.current = 0;
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
      setPendingStep(null);
      setLocalStep(nextLocalStep);
      setLaunching(true);
      setActive(true);
      navigateTo(steps[nextLocalStep].route);
      return;
    }

    // Completed tours stay completed. Catalog indexes identify features, not
    // display positions, so comparing the final index to a maximum would
    // restart the reordered tour on the next visit.
    if (autoStart && snapshot.state.status === "not_started") {
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

  const persistLocalStep = useCallback(
    async (nextLocalStep: number) => {
      const session = tourSessionRef.current;
      if (steps.length === 0) return;
      const safeLocalStep = clamp(nextLocalStep, 0, steps.length - 1);
      const step = steps[safeLocalStep];
      setPendingStep(null);
      setLocalStep(safeLocalStep);
      setSaving(true);
      setError(null);
      navigateTo(step.route);
      try {
        const response = await patchOnboarding({
          action: "progress",
          currentStep: step.catalogIndex,
        });
        if (mountedRef.current && session === tourSessionRef.current && isTerminalState(response.state)) {
          setActive(false);
        }
      } catch (cause) {
        if (mountedRef.current && session === tourSessionRef.current) {
          setError(
            cause instanceof Error
              ? cause.message
              : "We could not save your tour progress."
          );
        }
      } finally {
          if (mountedRef.current && session === tourSessionRef.current) setSaving(false);
      }
    },
    [navigateTo, patchOnboarding, steps]
  );

  const finishTour = useCallback(async () => {
    const step = steps[localStep];
    if (!step) return;
    const session = ++tourSessionRef.current;
    setSnapshot(previous => previous ? { ...previous, state: { ...previous.state, status: "completed", currentStep: step.catalogIndex } } : previous);
    setPendingStep(null);
    setActive(false);
    setSaving(true);
    setError(null);
    try {
      await patchOnboarding({
        action: "complete",
        currentStep: step.catalogIndex,
      });
    } catch (cause) {
      if (mountedRef.current && session === tourSessionRef.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : "We could not complete your product tour."
        );
      }
    } finally {
      if (mountedRef.current && session === tourSessionRef.current) setSaving(false);
    }
  }, [localStep, patchOnboarding, steps]);

  const skipTour = useCallback(async () => {
    const step = steps[localStep];
    if (!step) return;
    const session = ++tourSessionRef.current;
    setSnapshot(previous => previous ? { ...previous, state: { ...previous.state, status: "skipped", currentStep: step.catalogIndex } } : previous);
    setPendingStep(null);
    setActive(false);
    setSaving(true);
    setError(null);
    try {
      await patchOnboarding({
        action: "skip",
        currentStep: step.catalogIndex,
      });
    } catch (cause) {
      if (mountedRef.current && session === tourSessionRef.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : "We could not skip your product tour."
        );
      }
    } finally {
      if (mountedRef.current && session === tourSessionRef.current) setSaving(false);
    }
  }, [localStep, patchOnboarding, steps]);

  const retry = useCallback(() => {
    void persistLocalStep(localStep);
  }, [localStep, persistLocalStep]);

  const requestStep = (next: number) => {
    const index = clamp(next, 0, steps.length - 1);
    const destination = steps[index];
    if (!destination) return;
    if (!routeMatches(destination.route, pathname)) {
      // Stay on the current page until the person confirms the highlighted
      // destination. Only confirmation changes the URL or saved progress.
      setPendingStep(index);
    } else {
      void persistLocalStep(index);
    }
  };

  const currentStep = steps[localStep];
  const displayedStep = pendingStep === null ? currentStep : steps[pendingStep];
  const currentRoute = currentStep?.route || null;
  // The URL is the source of truth. Keeping a second, cached "ready route"
  // allowed the transition card to remain open even after the destination had
  // visibly loaded (for example: "Opening Dashboard…" while already on
  // /dashboard). A pathname change already re-renders this provider, so the
  // current route can be checked directly.
  const [, refreshLocation] = useState(0);
  const routeReady = !!currentRoute && routeMatches(currentRoute, pathname);
  useEffect(() => {
    if (launching && routeReady) setLaunching(false);
  }, [launching, routeReady]);
  useEffect(() => {
    if (!active || !currentRoute || routeReady) return;
    // Query-only navigation does not change usePathname. Recheck until the
    // requested Settings tab commits, then stop polling.
    const timer = window.setInterval(() => refreshLocation(value => value + 1), 100);
    return () => window.clearInterval(timer);
  }, [active, currentRoute, routeReady]);

  // Warm adjacent destinations while the current step is being read. Several
  // introductory steps share one route; skip those instead of prefetching nothing.
  // Resolve the URL exactly as navigateTo does, including the mock-mode prefix.
  useEffect(() => {
    if (!active) return;
    const next = steps.slice(localStep + 1).find(step => step.route !== currentRoute);
    const previous = steps.slice(0, localStep).reverse().find(step => step.route !== currentRoute);
    const destinations = new Set([next?.route, previous?.route, pendingStep === null ? undefined : steps[pendingStep]?.route]);
    for (const route of destinations) {
      if (!route) continue;
      const destination = new URL(route, window.location.origin);
      const path = isMockModePath(window.location.pathname)
        ? addMockModePrefix(destination.pathname)
        : destination.pathname;
      try {
        router.prefetch(`${path}${destination.search}${destination.hash}`);
      } catch {
        // A failed prefetch must never block navigation.
      }
    }
  }, [active, currentRoute, localStep, pendingStep, router, steps]);

  return (
    <>
      {children}
      <span
        hidden
        data-testid="product-tour-provider-state"
        data-phase={phase}
        data-state={snapshot?.state.status || "unavailable"}
        data-load-failures={loadFailuresRef.current}
      />
      {startRequest && phase === "error" && !active && (
        <div role="alert" className="fixed bottom-6 right-6 z-[120] max-w-sm rounded-xl border border-red-200 bg-white p-4 shadow-xl">
          <p className="text-sm text-text-primary">The tour could not load. Please try again.</p>
          <button type="button" className="mt-3 font-semibold text-blue-primary" onClick={() => { loadFailuresRef.current = 0; setPhase("idle"); }}>Retry tour</button>
        </div>
      )}
      {active && displayedStep && !startRequest && (!launching || routeReady) && (
        <ProductTourOverlay
          step={displayedStep}
          currentStep={pendingStep ?? localStep}
          totalSteps={steps.length}
          routeReady={routeReady}
          awaitingNavigation={pendingStep !== null}
          saving={saving}
          error={error}
          onBack={() => {
            if (pendingStep !== null) setPendingStep(null);
            else requestStep(localStep - 1);
          }}
          onNext={() => {
            if (pendingStep !== null) {
              void persistLocalStep(pendingStep);
            } else if (!routeReady) {
              navigateTo(currentStep.route);
            } else if (localStep === steps.length - 1) {
              void finishTour();
            } else {
              requestStep(localStep + 1);
            }
          }}
          onSkip={() => void skipTour()}
          onRetry={retry}
        />
      )}
    </>
  );
}
