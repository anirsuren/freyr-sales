import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { getDataMode } from "@/lib/dataMode";
import { isApprovalGateEnabled } from "@/lib/accessControl";
import { getCurrentUser } from "@/lib/currentUser";
import { getRoleInfo } from "@/lib/role";
import { PreviewBanner } from "@/components/layout/PreviewBanner";

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3001"),
  title: {
    default: "Freyr Sales Intelligence",
    template: "%s · Freyr Sales Intelligence",
  },
  description:
    "AI sales intelligence for Freyr Solutions: prospect research, matched services, and ready-to-send pitches for regulatory-affairs sales.",
  // The Freyr "f" mark is the browser-tab icon too, so a pinned tab reads as
  // Freyr at a glance (Anir, Jul 26: "you can put it as the favicon").
  icons: {
    icon: "/icon.png",
    apple: "/apple-touch-icon.png",
  },
};

const ROLE_RANK = { admin: 3, manager: 2, rep: 1 } as const;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const currentUser = await getCurrentUser();
  const roleInfo = await getRoleInfo();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply persisted visual preferences before paint to avoid a flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var r=document.documentElement;if(localStorage.getItem('freyr.theme')==='dark')r.classList.add('dark');var p=JSON.parse(localStorage.getItem('freyr.hover-preference.v1')||'null')||{};var d=Number(p.delayMs);d=Number.isFinite(d)?Math.max(0,Math.min(2000,Math.round(d))):500;r.style.setProperty('--freyr-hover-delay',d+'ms');r.dataset.hoverPopups=p.enabled===false?'off':'on';}catch(e){}})();",
          }}
        />
      </head>
      <body className="antialiased text-text-primary">
        {ROLE_RANK[roleInfo.role] < ROLE_RANK[roleInfo.realRole] && (
          <PreviewBanner role={roleInfo.role} realRole={roleInfo.realRole} />
        )}
        <AppShell
          dataMode={getDataMode()}
          approvalEnabled={isApprovalGateEnabled()}
          currentUser={currentUser}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
