import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { getDataMode } from "@/lib/dataMode";

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3001"),
  title: {
    default: "Freyr Sales Intelligence",
    template: "%s · Freyr Sales Intelligence",
  },
  description:
    "AI sales intelligence for Freyr Solutions — prospect research, matched services, and ready-to-send pitches for regulatory-affairs sales.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
        <AppShell dataMode={getDataMode()}>{children}</AppShell>
      </body>
    </html>
  );
}
