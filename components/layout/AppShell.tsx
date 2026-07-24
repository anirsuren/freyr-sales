"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { ToastProvider } from "@/components/ui/Toast";
import { AgentDock } from "@/components/agent/AgentDock";
import type { DataMode } from "@/lib/dataMode";
import { isOfferingsOnly } from "@/lib/release";
import { useHoverPreference } from "@/lib/hoverPreferences";
import { AutoTruncationTooltip } from "@/components/ui/AutoTruncationTooltip";
import { ProductTourProvider } from "@/components/onboarding/ProductTourProvider";
import { CurrentUserProvider } from "@/components/auth/CurrentUserProvider";
import type { UserIdentity } from "@/lib/userIdentity";

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
  const router = useRouter();
  const offeringsOnly = isOfferingsOnly(dataMode);
  const restrictedPath =
    offeringsOnly &&
    pathname !== "/login" &&
    pathname !== "/settings" &&
    pathname !== "/onboarding" &&
    pathname !== "/offerings" &&
    !pathname.startsWith("/offerings/");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const hoverPreference = useHoverPreference();

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
  useEffect(() => {
    try {
      setAgentHidden(localStorage.getItem(AGENT_HIDDEN_KEY) === "1");
    } catch {}
  }, []);
  function toggleAgent() {
    setAgentHidden(false);
    try {
      localStorage.removeItem(AGENT_HIDDEN_KEY);
    } catch {}
    setAgentOpen((o) => !o);
  }
  function hideAgent() {
    setAgentOpen(false);
    setAgentHidden(true);
    try {
      localStorage.setItem(AGENT_HIDDEN_KEY, "1");
    } catch {}
  }

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
    pathname === "/login" ||
    pathname === "/access-pending" ||
    /^\/customers\/[^/]+\/report$/.test(pathname)
  ) {
    return (
      <CurrentUserProvider user={currentUser}>
        {children}
      </CurrentUserProvider>
    );
  }

  const isSessionDetail =
    /^\/sessions\/[^/]+$/.test(pathname) && !pathname.endsWith("/loading");
  // The agent chat owns the whole pane (ChatGPT-style), like session detail.
  const fullBleed =
    isSessionDetail || pathname === "/recordings" || pathname === "/agent";

  return (
    <CurrentUserProvider user={currentUser}>
      <ToastProvider>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-md focus:bg-blue-primary focus:text-white focus:text-[14px] focus:font-semibold focus:shadow-card"
        >
          Skip to content
        </a>
        <div className="flex min-h-screen bg-white">
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
          <div className="flex-1 min-w-0 flex flex-col h-screen">
            <TopBar
              offeringsOnly={offeringsOnly}
              onMenuClick={() => setMobileNavOpen(true)}
              onAgentToggle={toggleAgent}
              agentActive={agentOpen && !agentHidden}
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
                    in — one place fixes "no animation when I click X" everywhere
                    (Suren, repeatedly). Full-bleed pages animate separately. */}
                <div key={pathname} className="p-8 page-in">{children}</div>
              </main>
            )}
          </div>
        </div>
        {!offeringsOnly && (
          <AgentDock
            open={agentOpen}
            onOpenChange={setAgentOpen}
            hidden={agentHidden}
            onHide={hideAgent}
            pathname={pathname}
          />
        )}
        <ProductTourProvider offeringsOnly={offeringsOnly} />
        <AutoTruncationTooltip />
      </ToastProvider>
    </CurrentUserProvider>
  );
}
