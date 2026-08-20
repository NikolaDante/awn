"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/financial-calculations";
import type { Currency } from "@/lib/financial-types";

export function AnimatedMoney({ value, currency, className }: { value: number; currency: Currency; className?: string }) {
  const previous = useRef(value);
  const initial = useRef(true);
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    if (initial.current) { initial.current = false; previous.current = value; return; }
    if (previous.current === value) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { previous.current = value; const frame = requestAnimationFrame(() => setDisplay(value)); return () => cancelAnimationFrame(frame); }
    const from = previous.current;
    const started = performance.now();
    const duration = 520;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else previous.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <span className={className}>{formatMoney(display, currency)}</span>;
}
