"use client";

import type { ComponentProps, ReactNode } from "react";
import { Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { requestProductTourStart } from "./productTourEvents";

type TourLauncherProps = Omit<
  ComponentProps<typeof Button>,
  "children" | "onClick"
> & {
  restart?: boolean;
  children?: ReactNode;
};

/** Reusable launcher for help menus, empty states, and onboarding surfaces. */
export function TourLauncher({
  restart = false,
  children,
  ...buttonProps
}: TourLauncherProps) {
  return (
    <Button
      type="button"
      data-testid="product-tour-launcher"
      data-tour="product-tour-launcher"
      onClick={() => requestProductTourStart({ restart })}
      {...buttonProps}
    >
      {restart ? <RotateCcw size={16} /> : <Play size={16} />}
      {children ?? (restart ? "Restart product tour" : "Start product tour")}
    </Button>
  );
}
