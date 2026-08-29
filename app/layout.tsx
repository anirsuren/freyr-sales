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

const ROLE_RANK = { admin: 3, bd_owner: 2, bd_member: 1, sol_member: 1 } as const;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const realUser = await getCurrentUser();
  const roleInfo = await getRoleInfo();
  /**
   * THE CHROME FOLLOWS THE ROLE YOU ARE ACTING AS, not the one you own.
   *
   * `getCurrentUser()` reports the role from the signed grant; `getRoleInfo()`
   * applies the "view as" preview on top. Pages already gate on the second,
   * but the shell was handed the first, so previewing as Rep left the whole
   * sidebar at admin: Customers, Reports, Performance, Market Intel and Admin
   * all still listed, every one of them manager-or-admin only. Clicking Admin
   * as a BD Member landed on "Admin tools are open to workspace admins" — a nav
   * item that opens onto a wall (found Aug 14 walking the flows).
   *
   * Nothing changes for a real user: without a preview the two roles are
   * equal and this is the same object. It only stops the preview from lying,
   * and it grants nobody anything, because the server still gates on
   * getRole() either way.
   */
  const currentUser =
    roleInfo.role === realUser.role
      ? realUser
      : { ...realUser, role: roleInfo.role };

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
