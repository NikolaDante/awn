"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SignOutButton } from "@/components/auth-forms";
import { AppIcon, type IconName } from "@/components/app-icons";

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
  const menuButton = useRef<HTMLButtonElement>(null);
  const focusPageAfterRoute = useRef(false);

  useEffect(() => {
    if (!focusPageAfterRoute.current) return;
    focusPageAfterRoute.current = false;
    requestAnimationFrame(() => document.querySelector<HTMLElement>(".app-page-header h1")?.focus({ preventScroll: true }));
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      requestAnimationFrame(() => menuButton.current?.focus({ preventScroll: true }));
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open]);

  const closeForRoute = (keyboard: boolean) => { focusPageAfterRoute.current = keyboard; setOpen(false); };

  return (
    <>
      <aside id="app-navigation-drawer" className={`app-sidebar${open ? " is-open" : ""}`} aria-label="Application navigation">
        <Link className="app-wordmark" href="/dashboard" aria-label="AWN dashboard">
          <span className="wordmark-mark" aria-hidden="true">a</span><span>awn</span>
        </Link>
        <nav className="app-nav-list">
          {navigation.map((item) => <AppNavLink key={item.href} href={item.href} label={item.label} icon={item.icon} active={pathname === item.href} close={closeForRoute} />)}
        </nav>
        <div className="app-sidebar-footer">
          <nav aria-label="Settings navigation"><AppNavLink href="/settings" label="Settings" icon="settings" active={pathname === "/settings"} close={closeForRoute} /></nav>
          <SignOutButton />
        </div>
      </aside>
      <header className="app-mobile-header"><Link className="app-wordmark" href="/dashboard" aria-label="AWN dashboard"><span className="wordmark-mark" aria-hidden="true">a</span><span>awn</span></Link><button ref={menuButton} className="mobile-menu-button" type="button" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="app-navigation-drawer" onClick={() => setOpen((value) => !value)}><AppIcon name={open ? "close" : "menu"} /></button></header>
      {open && <button className="nav-scrim" type="button" aria-label="Close navigation" onClick={() => setOpen(false)} />}
    </>
  );
}

function AppNavLink({ href, label, icon, active, close }: { href: string; label: string; icon: IconName; active: boolean; close: (keyboard: boolean) => void }) {
  return <Link href={href} className={`app-nav-link${active ? " is-active" : ""}`} aria-label={label} aria-current={active ? "page" : undefined} onClick={(event) => close(event.detail === 0)}><AppIcon name={icon} /><span>{label}</span></Link>;
}
