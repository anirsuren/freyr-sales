"use client";

import { usePathname } from "next/navigation";
import { AgentTabs } from "@/components/agent/AgentTabs";

// The chat (/agent) owns the full pane. The other agent pages (To-do, Settings,
// review, impact, a single run) get the normal padded workspace + a tab bar
// back to the chat.
export default function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "";
  if (pathname === "/agent") return <>{children}</>;
  // AppShell already pads non-full-bleed pages; just add the tab bar.
  return (
    <>
      <AgentTabs />
      {children}
    </>
  );
}
