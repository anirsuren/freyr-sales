"use client";

import { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  loading?: boolean;
}

export function Button({
  variant = "primary",
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 text-[14px] font-semibold rounded-md px-5 py-2.5 transition-[transform,background-color,opacity,border-color,box-shadow] duration-150 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary/35 focus-visible:ring-offset-1 focus-visible:ring-offset-white";
  const variants: Record<string, string> = {
    // Primary CTA carries a subtle blue-tinted shadow that lifts on hover — a
    // premium depth cue on the app's most-clicked element.
    primary:
      "bg-blue-primary text-white hover:bg-blue-hover shadow-[0_1px_2px_rgba(0,113,227,0.20)] hover:shadow-[0_4px_12px_rgba(0,113,227,0.26)] disabled:shadow-none",
    secondary:
      "bg-white border border-border text-text-primary hover:bg-surface",
    ghost: "bg-transparent text-blue-primary hover:bg-blue-light",
    destructive: "bg-error text-white hover:opacity-90",
  };
  return (
    <button
      className={cn(base, variants[variant], className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? "Working…" : children}
    </button>
  );
}
