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
    "inline-flex items-center justify-center gap-2 text-[14px] font-semibold rounded-md px-5 py-2.5 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap";
  const variants: Record<string, string> = {
    primary: "bg-blue-primary text-white hover:bg-blue-hover",
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
