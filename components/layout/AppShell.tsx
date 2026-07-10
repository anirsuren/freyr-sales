"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { ToastProvider } from "@/components/ui/Toast";
import { AgentDock } from "@/components/agent/AgentDock";

const AGENT_HIDDEN_KEY = "freyr.assistant.hidden.v1";

// Wraps every page with the persistent sidebar + top bar, except /login.
// Session-detail pages render full-bleed (3-pane); everything else gets a
// full-width 32px workspace (no narrow centered column).
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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

  // login + printable reports render chrome-free
  if (pathname === "/login" || /^\/customers\/[^/]+\/report$/.test(pathname)) {
    return <>{children}</>;
  }

  const isSessionDetail =
    /^\/sessions\/[^/]+$/.test(pathname) && !pathname.endsWith("/loading");
  // The agent chat owns the whole pane (ChatGPT-style), like session detail.
  const fullBleed =
    isSessionDetail || pathname === "/recordings" || pathname === "/agent";

  return (
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
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />
        <div className="flex-1 min-w-0 flex flex-col h-screen">
          <TopBar
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
              tabIndex={-1}
              className="flex-1 min-w-0 overflow-hidden page-in"
            >
              {children}
            </main>
          ) : (
            <main
              id="main-content"
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
      <AgentDock
        open={agentOpen}
        onOpenChange={setAgentOpen}
        hidden={agentHidden}
        onHide={hideAgent}
        pathname={pathname}
      />
    </ToastProvider>
  );
}
