"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { ToastProvider } from "@/components/ui/Toast";
import { AgentDock } from "@/components/agent/AgentDock";
import type { DataMode } from "@/lib/dataMode";
import { isOfferingsOnly, isReleased, isReleasedPath } from "@/lib/release";
import { useHoverPreference } from "@/lib/hoverPreferences";
import { AutoTruncationTooltip } from "@/components/ui/AutoTruncationTooltip";
import { ProductTourProvider } from "@/components/onboarding/ProductTourProvider";
import {
  CurrentUserProvider,
  MyPhotoProvider,
  TimeZoneProvider,
} from "@/components/auth/CurrentUserProvider";
import {
  userScopedStorageKey,
  type UserIdentity,
} from "@/lib/userIdentity";
import {
  ASK_AGENT_EVENT,
  type AskAgentDetail,
} from "@/lib/agentEvents";
import { FeedbackButton } from "@/components/feedback/FeedbackButton";

const AGENT_HIDDEN_KEY = "freyr.assistant.hidden.v1";

// Wraps every page with the persistent sidebar + top bar, except /login.
// Session-detail pages render full-bleed (3-pane); everything else gets a
// full-width 32px workspace (no narrow centered column).
export function AppShell({
  children,
  dataMode,
  approvalEnabled,
  currentUser,
}: {
  children: React.ReactNode;
  dataMode: DataMode;
  approvalEnabled: boolean;
  currentUser: UserIdentity;
}) {
  const pathname = usePathname() || "";
  const isMaterialPage = /^\/offerings\/[^/]+\/materials\/[^/]+$/.test(pathname);
  /** Any page whose whole job is a form you fill in and save. */
  const isEditingForm =
    pathname.endsWith("/edit") || pathname.endsWith("/new");
  const router = useRouter();
  const offeringsOnly = isOfferingsOnly(dataMode);
  const customersReleased = isReleased("/customers", dataMode);
  // Same allow-list the middleware redirect uses (lib/release.ts). Keeping one
  // copy is what stops a page from rendering its chrome for a frame before the
  // server bounce lands — and it restores /access-pending, which this list used
  // to omit, so an unapproved visitor no longer ping-pongs to /offerings.
  const standalonePublicPath =
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/auth/confirm" ||
    pathname === "/auth/reset-password" ||
    pathname === "/access-pending";
  const restrictedPath = !standalonePublicPath && !isReleasedPath(pathname, dataMode);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const hoverPreference = useHoverPreference();
  const agentHiddenStorageKey = userScopedStorageKey(
    AGENT_HIDDEN_KEY,
    currentUser.id
  );

  // CSS-only tooltips read the same preference as the interactive chart and
  // hover-card components. Keeping it on <html> also lets the off switch hide
  // every hover popup immediately, including server-rendered help text.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--freyr-hover-delay", `${hoverPreference.delayMs}ms`);
    root.dataset.hoverPopups = hoverPreference.enabled ? "on" : "off";
  }, [hoverPreference.delayMs, hoverPreference.enabled]);

  // Always-on assistant dock (Anir, Jul 8). Open state is per-session; "hidden"
  // (bubble dismissed) persists, and the top-bar spark button brings it back.
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentHidden, setAgentHidden] = useState(false);
  const [materialAgentDocked, setMaterialAgentDocked] = useState(false);
  const [loadedAgentHiddenKey, setLoadedAgentHiddenKey] = useState<
    string | null
  >(null);
  useEffect(() => {
    setLoadedAgentHiddenKey(null);
    setAgentOpen(false);
    setAgentHidden(false);
    try {
      setAgentHidden(localStorage.getItem(agentHiddenStorageKey) === "1");
    } catch {}
    setLoadedAgentHiddenKey(agentHiddenStorageKey);
  }, [agentHiddenStorageKey]);
  const agentStateReady = loadedAgentHiddenKey === agentHiddenStorageKey;
  const visibleAgentOpen = agentStateReady && agentOpen;
  const visibleAgentHidden = !agentStateReady || agentHidden;
  function toggleAgent() {
    if (!agentStateReady) return;
    setAgentHidden(false);
    try {
      localStorage.removeItem(agentHiddenStorageKey);
    } catch {}
    setAgentOpen((o) => !o);
  }
  function hideAgent() {
    if (!agentStateReady) return;
    setAgentOpen(false);
    setAgentHidden(true);
    try {
      localStorage.setItem(agentHiddenStorageKey, "1");
    } catch {}
  }

  // An explicit CTA inside the app must always be able to reveal the dock,
  // even if this user previously dismissed its floating bubble.
  useEffect(() => {
    function revealAgent(event: Event) {
      const detail = (event as CustomEvent<AskAgentDetail>).detail;
      // Material viewers publish context with `open: false`: the assistant
      // should know what is on screen when the user opens it later, but a new
      // document tab must never be covered by an unsolicited chat panel.
      if (detail?.open === false) return;
      if (!agentStateReady) return;
      setAgentHidden(false);
      setAgentOpen(true);
      try {
        localStorage.removeItem(agentHiddenStorageKey);
      } catch {}
    }
    window.addEventListener(ASK_AGENT_EVENT, revealAgent);
    return () => window.removeEventListener(ASK_AGENT_EVENT, revealAgent);
  }, [agentHiddenStorageKey, agentStateReady]);

  // close the mobile drawer on route change
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (restrictedPath) router.replace("/offerings");
  }, [restrictedPath, router]);

  useEffect(() => {
    if (
      !approvalEnabled ||
      pathname === "/login" ||
      // The confirmation landing is BUSY signing the visitor in — its access
      // check would 401 (cookies aren't set yet) and this watchdog would yank
      // the browser to /login mid-exchange, stranding a freshly confirmed
      // user at the sign-in form (exactly the loop Anir hit on Jul 27).
      pathname === "/auth/confirm" ||
      pathname === "/auth/reset-password" ||
      pathname === "/access-pending"
    ) {
      return;
    }

    let active = true;
    let refreshing = false;
    const refreshAccess = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const response = await fetch("/api/auth/access", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!active || response.ok) return;

        const next = `${window.location.pathname}${window.location.search}`;
        if (response.status === 401) {
          window.location.assign(`/login?next=${encodeURIComponent(next)}`);
        } else if (response.status === 403) {
          window.location.assign("/access-pending");
        } else {
          window.location.assign("/access-pending?configuration=error");
        }
      } catch {
        // A short network interruption does not extend the current grant. The
        // middleware will continue to fail closed once that grant expires.
      } finally {
        refreshing = false;
      }
    };

    void refreshAccess();
    const interval = window.setInterval(refreshAccess, 10 * 60 * 1000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshAccess();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [approvalEnabled, pathname]);

  if (restrictedPath) return null;

  // login + printable reports render chrome-free
  if (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/auth/confirm" ||
    pathname === "/auth/reset-password" ||
    pathname === "/access-pending" ||
    /^\/customers\/[^/]+\/report$/.test(pathname)
  ) {
    return (
      <CurrentUserProvider user={currentUser} dataMode={dataMode}>
        <MyPhotoProvider>
          <TimeZoneProvider>{children}</TimeZoneProvider>
        </MyPhotoProvider>
      </CurrentUserProvider>
    );
  }

  // A material opened in a new browser tab is a document workspace, not a
  // second copy of the Freyr application. No sidebar, top bar or route back
  // into Offerings. The assistant behaves like it does everywhere else by
  // default (floating popup, zero layout change). Its header offers an explicit
  // right-dock option; only choosing that option allocates a side column.
  if (isMaterialPage) {
    return (
      <CurrentUserProvider user={currentUser} dataMode={dataMode}>
        <MyPhotoProvider>
          <TimeZoneProvider>
            <ToastProvider>
              <div className="flex h-screen min-h-0 overflow-hidden bg-white">
                <main
                  id="main-content"
                  data-tour="page-content"
                  tabIndex={-1}
                  className="min-h-0 min-w-0 flex-1 overflow-hidden"
                >
                  {children}
                </main>
                {materialAgentDocked && (
                  <aside
                    aria-label="Freyr AI"
                    className="h-full w-[min(400px,30vw)] shrink-0 overflow-hidden"
                  >
                    <AgentDock
                      embedded
                      dockable
                      docked
                      onDockChange={setMaterialAgentDocked}
                      open={visibleAgentOpen}
                      onOpenChange={(open) => {
                        setAgentOpen(open);
                        // Closing a docked assistant must release its layout
                        // column too. Otherwise the chat disappears but the
                        // material stays squeezed beside an empty white rail.
                        if (!open) setMaterialAgentDocked(false);
                      }}
                      hidden={false}
                      onHide={hideAgent}
                      pathname={pathname}
                      offeringsOnly={offeringsOnly}
                    />
                  </aside>
                )}
              </div>
              {!materialAgentDocked && (
                <AgentDock
                  dockable
                  docked={false}
                  onDockChange={setMaterialAgentDocked}
                  open={visibleAgentOpen}
                  onOpenChange={setAgentOpen}
                  hidden={false}
                  onHide={hideAgent}
                  pathname={pathname}
                  offeringsOnly={offeringsOnly}
                />
              )}
              <AutoTruncationTooltip />
            </ToastProvider>
          </TimeZoneProvider>
        </MyPhotoProvider>
      </CurrentUserProvider>
    );
  }

  const isSessionDetail =
    /^\/sessions\/[^/]+$/.test(pathname) && !pathname.endsWith("/loading");
  // The agent chat owns the whole pane (ChatGPT-style), like session detail.
  const fullBleed =
    isSessionDetail || pathname === "/recordings" || pathname === "/agent";

  return (
    <CurrentUserProvider user={currentUser} dataMode={dataMode}>
      <MyPhotoProvider>
      <TimeZoneProvider>
      <ToastProvider>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-md focus:bg-blue-primary focus:text-white focus:text-[14px] focus:font-semibold focus:shadow-card"
        >
          Skip to content
        </a>
        <div className="flex h-screen flex-col bg-white">
          {dataMode === "mock" && (
            <div
              role="status"
              aria-label="In progress mode uses fake sample data"
              className="flex min-h-[46px] shrink-0 items-center justify-center gap-2.5 bg-blue-primary px-4 py-2 text-center text-white shadow-[inset_0_-1px_0_rgba(0,0,0,0.14)]"
            >
              <FlaskConical
                size={18}
                strokeWidth={2.3}
                className="shrink-0"
              />
              <p className="text-[13px] leading-snug">
                <span className="font-bold">In progress mode:</span>{" "}
                <span className="font-semibold">
                  all data shown is fake sample data and does not reflect the
                  real workspace.
                </span>
              </p>
            </div>
          )}
          <div className="flex min-h-0 flex-1">
          {/* mobile drawer backdrop */}
          {mobileNavOpen && (
            <div
              className="fixed inset-0 z-[55] bg-black/30 lg:hidden"
              onClick={() => setMobileNavOpen(false)}
            />
          )}
          <Sidebar
            dataMode={dataMode}
            mobileOpen={mobileNavOpen}
            onMobileClose={() => setMobileNavOpen(false)}
          />
          <div className="flex h-full min-w-0 flex-1 flex-col">
            <TopBar
              offeringsOnly={offeringsOnly}
              customersReleased={customersReleased}
              onMenuClick={() => setMobileNavOpen(true)}
              onAgentToggle={toggleAgent}
              agentActive={visibleAgentOpen && !visibleAgentHidden}
              feedbackAction={<FeedbackButton dataMode={dataMode} />}
            />
            {fullBleed ? (
              // key=pathname re-mounts so full-bleed pages (session detail, agent,
              // recordings) also fade in on navigation (Suren: "no animation when
              // I click on a session"). Opacity-only — safe for fixed descendants.
              <main
                key={pathname}
                id="main-content"
                data-tour="page-content"
                tabIndex={-1}
                className="flex-1 min-w-0 overflow-hidden page-in"
              >
                {children}
              </main>
            ) : (
              <main
                id="main-content"
                data-tour="page-content"
                tabIndex={-1}
                className="flex-1 min-w-0 overflow-y-auto"
              >
                {/* key=pathname re-mounts on navigation so every page fades/rises
                    in, one place fixes "no animation when I click X" everywhere
                    (Suren, repeatedly). Full-bleed pages animate separately. */}
                {/* Global bottom safe-area for the floating Freyr AI bubble.
                    It belongs to the one shared page scroller so every normal
                    page and every tab can move its final row fully above the
                    bottom-right control instead of fixing spacing screen by
                    screen. */}
                <div key={pathname} className="p-8 pb-28 page-in">
                  {children}
                </div>
              </main>
            )}
          </div>
          </div>
        </div>
        {/* THE ASSISTANT BUBBLE IS ON IN REAL MODE TOO (Anir, Jul 29: "I want
            an AI chatbot in the bottom right when I click on an offering, in
            addition to the Freyr agent AI page"). It was gated off with every
            unreleased module; the agent itself has shipped, so the gate now
            only tells the dock to keep its answers inside what real mode can
            actually open. */}
        {/* Not on the agent's own page: a floating mini agent on top of the
            full agent is the same thing twice (Anir, Jul 29).

            NOT ON AN EDIT FORM EITHER. A form ends in a Save button in the
            bottom-right corner, which is exactly where the bubble floats — on
            the offering editor it sat directly on top of "Save changes" (Anir,
            Jul 30: "the save changes button is literally getting blocked by
            the AI assistant. Also, we shouldn't even have an AI on this page
            for the edit thing"). And there is nothing for it to answer while
            you are typing your own catalogue in. */}
        {!pathname.startsWith("/agent") && !isEditingForm && (
        <AgentDock
          open={visibleAgentOpen}
          onOpenChange={setAgentOpen}
          hidden={visibleAgentHidden}
          onHide={hideAgent}
          pathname={pathname}
          offeringsOnly={offeringsOnly}
        />
        )}
        <ProductTourProvider
          offeringsOnly={offeringsOnly}
          autoStart={approvalEnabled}
        />
        <AutoTruncationTooltip />
      </ToastProvider>
      </TimeZoneProvider>
      </MyPhotoProvider>
    </CurrentUserProvider>
  );
}
