"use client";

import { useRouter } from "next/navigation";
import { Button } from "./Button";

// A primary/secondary button that navigates — lets server components render a
// real <button> element (rather than a styled <a>) for navigation actions.
export function RouteButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const router = useRouter();
  return (
    <Button variant={variant} onClick={() => router.push(href)}>
      {children}
    </Button>
  );
}
