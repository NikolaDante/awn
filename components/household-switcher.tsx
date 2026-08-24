"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useFinancialProfile } from "@/components/financial-provider";

export function HouseholdSwitcher({ mobile = false, afterSelect }: { mobile?: boolean; afterSelect?: () => void }) {
  const { activeHouseholdId, householdName, memberCount, households, switching, switchHousehold } = useFinancialProfile();
  const [expanded, setExpanded] = useState(false); const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!expanded || mobile) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setExpanded(false); };
    window.addEventListener("pointerdown", close); return () => window.removeEventListener("pointerdown", close);
  }, [expanded, mobile]);
  if (!activeHouseholdId || !householdName) return null;
  const kind = memberCount > 1 ? "Shared" : "Personal";
  const select = async (id: string) => { if (await switchHousehold(id)) { setExpanded(false); afterSelect?.(); } };
  return <div ref={root} className={`household-switcher${mobile ? " is-mobile" : ""}`}>
    <button className="household-switcher-trigger" type="button" aria-label={`Current Household: ${householdName}, ${kind}. Choose Household`} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
      <span><small>{mobile ? "Current Household" : "Household"}</small><strong>{householdName}</strong><em>{kind}</em></span><b aria-hidden="true">⌄</b>
    </button>
    {expanded && <div className="household-switcher-menu" role="menu" aria-label="Your Households">
      {households.map((household) => <button key={household.id} type="button" role="menuitemradio" aria-checked={household.id === activeHouseholdId} disabled={switching} onClick={() => select(household.id)}><span aria-hidden="true">{household.id === activeHouseholdId ? "✓" : ""}</span><span><strong>{household.name}</strong><small>{household.memberCount > 1 ? "Shared" : "Personal"}</small></span></button>)}
      <Link href="/settings" role="menuitem" onClick={() => { setExpanded(false); afterSelect?.(); }}>Manage household</Link>
    </div>}
  </div>;
}
