"use client";

import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { moneyInput, normalizeMoneyDraft, parseMoney } from "@/lib/financial-calculations";

type MoneyInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "inputMode"> & {
  value: number;
  onValueChange: (value: number) => void;
};

export function MoneyInput({ value, onValueChange, onBlur, onFocus, ...props }: MoneyInputProps) {
  const [draft, setDraft] = useState(() => moneyInput(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(moneyInput(value));
  }, [value]);

  return <input
    {...props}
    type="text"
    inputMode="decimal"
    value={draft}
    onFocus={(event) => {
      focused.current = true;
      onFocus?.(event);
    }}
    onChange={(event) => {
      const next = normalizeMoneyDraft(event.target.value);
      if (next === null) return;
      setDraft(next);
      onValueChange(parseMoney(next));
    }}
    onBlur={(event) => {
      focused.current = false;
      const parsed = parseMoney(draft);
      setDraft(moneyInput(parsed));
      onValueChange(parsed);
      onBlur?.(event);
    }}
  />;
}
