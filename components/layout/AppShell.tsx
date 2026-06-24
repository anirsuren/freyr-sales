"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { ToastProvider } from "@/components/ui/Toast";

// Wraps every page with the persistent sidebar + top bar, except /login.
// Session-detail pages render full-bleed (3-pane); everything else gets a
// full-width 32px workspace (no narrow centered column).
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
          <TopBar onMenuClick={() => setMobileNavOpen(true)} />
          {fullBleed ? (
            <main
              id="main-content"
              tabIndex={-1}
              className="flex-1 min-w-0 overflow-hidden"
            >
              {children}
            </main>
          ) : (
            <main
              id="main-content"
              tabIndex={-1}
              className="flex-1 min-w-0 overflow-y-auto"
            >
              <div className="p-8">{children}</div>
            </main>
          )}
        </div>
      </div>
    </ToastProvider>
  );
}
