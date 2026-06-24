import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";

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
    <html lang="en">
      <head>
        {/* Apply persisted theme before paint to avoid a flash (#85). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{if(localStorage.getItem('freyr.theme')==='dark')document.documentElement.classList.add('dark');}catch(e){}})();",
          }}
        />
      </head>
      <body className="antialiased text-text-primary">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
