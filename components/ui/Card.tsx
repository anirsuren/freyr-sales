import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "bg-white border border-border-light rounded-xl p-6 shadow-card",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
