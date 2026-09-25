"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { animate, motion, useInView, useReducedMotion } from "motion/react";

export const ease = [0.2, 0.7, 0.2, 1] as const;
export const reveal = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "0px 0px -12% 0px" },
};

export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return <motion.div {...reveal} transition={{ duration: 0.6, ease, delay: delay / 1000 }} className={className}>{children}</motion.div>;
}

/** Keep the final value in server markup and for reduced-motion readers. */
export function CountUp({ to, from = 0, duration = 1.4, prefix = "", suffix = "", decimals = 0 }: { to: number; from?: number; duration?: number; prefix?: string; suffix?: string; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const reduce = useReducedMotion();
  const [value, setValue] = useState(to);
  useEffect(() => {
    if (!inView || reduce) return;
    const controls = animate(from, to, { duration, ease, onUpdate: setValue });
    return () => controls.stop();
  }, [inView, reduce, to, from, duration]);
  const format = (n: number) => prefix + n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
  return <span ref={ref} aria-label={format(to)}><span aria-hidden="true">{format(value)}</span></span>;
}
