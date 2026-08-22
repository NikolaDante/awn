import Link from "next/link";

export function PageHeader({ title, eyebrow, children }: Readonly<{ title: string; eyebrow?: string; children?: React.ReactNode }>) {
  return <header className="app-page-header"><div>{eyebrow && <p className="app-eyebrow">{eyebrow}</p>}<h1 tabIndex={-1}>{title}</h1></div>{children && <div className="page-actions">{children}</div>}</header>;
}

export function ComingSoonButton({ children, secondary = false }: Readonly<{ children: React.ReactNode; secondary?: boolean }>) {
  return <button type="button" className={`app-button${secondary ? " app-button-secondary" : ""}`} disabled>{children}<span className="coming-soon">Coming soon</span></button>;
}

export function SectionCard({ title, children, className = "" }: Readonly<{ title?: string; children: React.ReactNode; className?: string }>) {
  return <section className={`section-card ${className}`}>{title && <h2>{title}</h2>}{children}</section>;
}

export function SetupCard({ eyebrow, title, children, href = "/onboarding", action = "Start setup" }: Readonly<{ eyebrow?: string; title: string; children: React.ReactNode; href?: string; action?: string }>) {
  return <section className="setup-card">{eyebrow && <p className="card-eyebrow">{eyebrow}</p>}<h2>{title}</h2><p>{children}</p><Link className="card-link" href={href}>{action}<span aria-hidden="true">↗</span></Link></section>;
}

export function EmptyState({ title, children, href, action }: Readonly<{ title: string; children: React.ReactNode; href?: string; action?: string }>) {
  return <section className="empty-state"><span className="empty-mark" aria-hidden="true">◌</span><h2>{title}</h2><p>{children}</p>{href && action && <Link className="card-link" href={href}>{action}<span aria-hidden="true">↗</span></Link>}</section>;
}

export function PlaceholderValue({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return <div className="placeholder-value"><span>{label}</span><strong>{children}</strong></div>;
}
