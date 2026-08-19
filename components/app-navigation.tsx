"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SignOutButton } from "@/components/auth-forms";
import { AppIcon } from "@/components/app-icons";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/transactions", label: "Transactions", icon: "transactions" },
  { href: "/history", label: "History", icon: "history" },
  { href: "/cards-accounts", label: "Cards & Accounts", icon: "wallet" },
  { href: "/plan", label: "Plan", icon: "plan" },
  { href: "/insights", label: "Insights", icon: "insights" },
] as const;

export function AppNavigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <aside className={`app-sidebar${open ? " is-open" : ""}`} aria-label="Application navigation">
        <Link className="app-wordmark" href="/dashboard" aria-label="AWN dashboard">
          <span className="wordmark-mark" aria-hidden="true">a</span><span>awn</span>
        </Link>
        <nav className="app-nav-list">
          {navigation.map((item) => <AppNavLink key={item.href} href={item.href} label={item.label} icon={item.icon} active={pathname === item.href} close={() => setOpen(false)} />)}
        </nav>
        <div className="app-sidebar-footer">
          <SignOutButton />
        </div>
      </aside>
      <header className="app-mobile-header"><Link className="app-wordmark" href="/dashboard" aria-label="AWN dashboard"><span className="wordmark-mark" aria-hidden="true">a</span><span>awn</span></Link><button className="mobile-menu-button" type="button" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} onClick={() => setOpen((value) => !value)}><AppIcon name={open ? "close" : "menu"} /></button></header>
      {open && <button className="nav-scrim" type="button" aria-label="Close navigation" onClick={() => setOpen(false)} />}
    </>
  );
}

function AppNavLink({ href, label, icon, active, close }: { href: string; label: string; icon: (typeof navigation)[number]["icon"]; active: boolean; close: () => void }) {
  return <Link href={href} className={`app-nav-link${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined} onClick={close}><AppIcon name={icon} /><span>{label}</span></Link>;
}
