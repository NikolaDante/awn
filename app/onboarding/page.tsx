import Link from "next/link";

const steps = ["Set your currency and monthly income", "Add accounts and cards", "Create a monthly budget", "Add a savings goal", "Review your starting plan"];

export default function OnboardingPage() {
  return <main className="onboarding-page"><header className="onboarding-header"><Link className="app-wordmark onboarding-brand" href="/" aria-label="Return to AWN homepage"><span className="wordmark-mark" aria-hidden="true">a</span><span>awn</span></Link><Link className="onboarding-back" href="/">Back to homepage</Link></header><section className="onboarding-card"><p className="app-eyebrow">Your starting plan</p><h1>Build your picture, one calm step at a time.</h1><p className="onboarding-intro">Setup is not active yet. This preview shows the path AWN will use to help you begin with clarity.</p><ol className="onboarding-steps">{steps.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span><p>{step}</p></li>)}</ol><div className="onboarding-actions"><Link className="app-button app-button-light" href="/dashboard">Preview dashboard <span aria-hidden="true">↗</span></Link><Link className="onboarding-back" href="/">Return home</Link></div></section></main>;
}
