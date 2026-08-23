"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SignOutButton } from "@/components/auth-forms";
import { AppIcon, type IconName } from "@/components/app-icons";
import { BankSmsImportDialog } from "@/components/bank-sms-import";
import { ModalDialog } from "@/components/modal-dialog";
import { TransactionForm } from "@/components/transactions-ui";
import { containModalFocus } from "@/components/use-modal-dialog";

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
  const [action, setAction] = useState<"chooser" | "transaction" | "sms" | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const lastMenuButton = useRef<HTMLButtonElement | null>(null);
  const drawer = useRef<HTMLElement>(null);
  const mobileMenu = useRef<HTMLElement>(null);
  const focusPageAfterRoute = useRef(false);

  useEffect(() => {
    if (!focusPageAfterRoute.current) return;
    focusPageAfterRoute.current = false;
    requestAnimationFrame(() => document.querySelector<HTMLElement>(".app-page-header h1")?.focus({ preventScroll: true }));
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      const phoneMenu = window.matchMedia("(max-width: 640px)").matches ? mobileMenu.current : null;
      (phoneMenu ?? drawer.current)?.querySelector<HTMLElement>(".app-nav-link")?.focus({ preventScroll: true });
    });
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Tab" && mobileMenu.current && window.matchMedia("(max-width: 640px)").matches) {
        containModalFocus(event, mobileMenu.current, document.activeElement);
        return;
      }
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      requestAnimationFrame(() => lastMenuButton.current?.focus({ preventScroll: true }));
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open]);

  const closeForRoute = (keyboard: boolean) => { focusPageAfterRoute.current = keyboard; setOpen(false); };
  const toggleMenu = (button: HTMLButtonElement) => { lastMenuButton.current = button; setOpen((value) => !value); };
  const dismissMenu = () => { setOpen(false); requestAnimationFrame(() => lastMenuButton.current?.focus({ preventScroll: true })); };
  const closeAction = () => { setAction(null); requestAnimationFrame(() => addButton.current?.focus({ preventScroll: true })); };

  return (
    <>
      <aside ref={drawer} id="app-navigation-drawer" className={`app-sidebar${open ? " is-open" : ""}`} aria-label="Application navigation">
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
      <header className="app-mobile-header"><Link className="app-wordmark" href="/dashboard" aria-label="AWN dashboard"><span className="wordmark-mark" aria-hidden="true">a</span><span>awn</span></Link><button className="mobile-menu-button" type="button" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="app-navigation-drawer" onClick={(event) => toggleMenu(event.currentTarget)}><AppIcon name={open ? "close" : "menu"} /></button></header>
      <div className="app-mobile-action-bar" aria-label="Quick actions">
        <button ref={addButton} className="mobile-action-primary" type="button" onClick={() => setAction("chooser")}><AppIcon name="plus" /><span>Add</span></button>
        <button className={`mobile-action-secondary${open ? " is-active" : ""}`} type="button" aria-label={open ? "Close navigation menu" : "Open navigation menu"} aria-expanded={open} aria-controls="app-mobile-navigation-card" onClick={(event) => toggleMenu(event.currentTarget)}><AppIcon name="menu" /><span>Menu</span></button>
      </div>
      {open && <button className="nav-scrim" type="button" aria-label="Close navigation" onClick={dismissMenu} />}
      {open && <section ref={mobileMenu} id="app-mobile-navigation-card" className="mobile-navigation-card" role="dialog" aria-modal="true" aria-label="Application navigation" tabIndex={-1}>
        <nav className="mobile-navigation-list">
          {navigation.map((item) => <AppNavLink key={item.href} href={item.href} label={item.label} icon={item.icon} active={pathname === item.href} close={closeForRoute} />)}
          <AppNavLink href="/settings" label="Settings" icon="settings" active={pathname === "/settings"} close={closeForRoute} />
        </nav>
      </section>}
      {action === "chooser" && <MobileAddChooser close={closeAction} choose={setAction} />}
      {action === "transaction" && <TransactionForm close={closeAction} />}
      {action === "sms" && <BankSmsImportDialog close={closeAction} />}
    </>
  );
}

function MobileAddChooser({ close, choose }: { close: () => void; choose: (action: "transaction" | "sms") => void }) {
  return <ModalDialog title="What would you like to add?" eyebrow="Quick add" close={close} className="mobile-add-sheet" closeLabel="Close quick add">
    <div className="mobile-add-options">
      <button type="button" onClick={() => choose("transaction")} data-modal-initial-focus><span className="mobile-add-option-icon"><AppIcon name="plus" /></span><span><strong>Add transaction</strong><small>Income, expense or transfer</small></span><AppIcon name="arrow" /></button>
      <button type="button" onClick={() => choose("sms")}><span className="mobile-add-option-icon"><AppIcon name="transactions" /></span><span><strong>Import bank SMS</strong><small>Paste bank transaction messages</small></span><AppIcon name="arrow" /></button>
    </div>
  </ModalDialog>;
}

function AppNavLink({ href, label, icon, active, close }: { href: string; label: string; icon: IconName; active: boolean; close: (keyboard: boolean) => void }) {
  return <Link href={href} className={`app-nav-link${active ? " is-active" : ""}`} aria-label={label} aria-current={active ? "page" : undefined} onClick={(event) => close(event.detail === 0)}><AppIcon name={icon} /><span>{label}</span></Link>;
}
