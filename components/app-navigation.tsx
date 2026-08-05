"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { href: "/dashboard", label: "Dashboard", mark: "◒" },
  { href: "/transactions", label: "Transactions", mark: "↗" },
  { href: "/accounts", label: "Accounts & Cards", mark: "◌" },
  { href: "/plan", label: "Plan", mark: "✦" },
];

export function AppNavigation() {
  const pathname = usePathname();

  return (
    <>
      <aside className="app-sidebar" aria-label="Application navigation">
        <Link className="app-wordmark" href="/dashboard" aria-label="AWN dashboard">
          <span className="wordmark-mark" aria-hidden="true">a</span><span>awn</span>
        </Link>
        <nav className="app-nav-list">
          {navigation.map((item) => <AppNavLink key={item.href} {...item} active={pathname === item.href} />)}
        </nav>
        <div className="app-sidebar-footer">
          <button type="button" className="sidebar-placeholder" disabled>Help <span>Coming soon</span></button>
          <button type="button" className="sidebar-placeholder" disabled>Settings <span>Coming soon</span></button>
        </div>
      </aside>
      <nav className="app-bottom-nav" aria-label="Application navigation">
        {navigation.map((item) => <AppNavLink key={item.href} {...item} active={pathname === item.href} />)}
      </nav>
    </>
  );
}

function AppNavLink({ href, label, mark, active }: { href: string; label: string; mark: string; active: boolean }) {
  return <Link href={href} className={`app-nav-link${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined}><span aria-hidden="true">{mark}</span><span>{label}</span></Link>;
}
