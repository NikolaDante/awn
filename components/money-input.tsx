"use client";

import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { moneyInput, normalizeMoneyDraft, parseMoney } from "@/lib/financial-calculations";

type MoneyInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "inputMode"> & {
  value: number;
  onValueChange: (value: number) => void;
  allowNegative?: boolean;
};

export function MoneyInput({ value, onValueChange, allowNegative = false, onBlur, onFocus, ...props }: MoneyInputProps) {
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
      const raw = event.target.value;
      const negative = allowNegative && raw.startsWith("-");
      const normalized = normalizeMoneyDraft(negative ? raw.slice(1) : raw);
      if (normalized === null) return;
      const next = negative ? `-${normalized}` : normalized;
      setDraft(next);
      onValueChange(negative ? -parseMoney(normalized) : parseMoney(normalized));
    }}
    onBlur={(event) => {
      focused.current = false;
      const parsed = allowNegative && draft.startsWith("-") ? -parseMoney(draft.slice(1)) : parseMoney(draft);
      setDraft(moneyInput(parsed));
      onValueChange(parsed);
      onBlur?.(event);
    }}
  />;
}
