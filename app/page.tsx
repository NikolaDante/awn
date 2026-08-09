"use client";

import { useEffect, useState } from "react";

const navigation = [
  ["How it works", "#how-it-works"],
  ["Features", "#features"],
  ["Our approach", "#approach"],
] as const;

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, []);

  const closeMenu = () => setMenuOpen(false);

  return (
    <main>
      <nav className="site-nav" aria-label="Main navigation">
        <a className="wordmark" href="#top" aria-label="AWN home">
          <span className="wordmark-mark" aria-hidden="true">a</span>
          <span>awn</span>
        </a>
        <div className="nav-links">
          {navigation.map(([label, href]) => <a key={href} href={href}>{label}</a>)}
        </div>
        <div className="nav-actions">
          <a className="sign-in" href="/auth/sign-in">Sign in</a>
          <a className="button button-small" href="/auth/sign-up">Get started</a>
        </div>
        <button
          className="menu-toggle"
          type="button"
          aria-controls="mobile-menu"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span aria-hidden="true" /><span aria-hidden="true" />
        </button>
        <div className={`menu-panel${menuOpen ? " is-open" : ""}`} id="mobile-menu" hidden={!menuOpen}>
          {navigation.map(([label, href]) => <a key={href} href={href} onClick={closeMenu}>{label}</a>)}
          <a href="/auth/sign-in" onClick={closeMenu}>Sign in</a>
          <a className="menu-cta" href="/auth/sign-up" onClick={closeMenu}>Get started <span aria-hidden="true">↗</span></a>
        </div>
      </nav>

      <section className="hero section-shell" id="top">
        <div className="hero-copy">
          <p className="eyebrow">A calmer way to plan</p>
          <h1>Know where your money is going.<br />Know what to do next.</h1>
          <p className="hero-lede">AWN turns everyday financial activity into one clear monthly plan—so you can spend confidently, prepare for what&apos;s ahead, and save with purpose.</p>
          <div className="hero-actions">
            <a className="button" href="/auth/sign-up">Start with AWN <span aria-hidden="true">↗</span></a>
            <a className="text-link" href="#how-it-works">See how it works <span aria-hidden="true">↓</span></a>
          </div>
        </div>
        <div className="product-stage" aria-label="An example AWN monthly financial overview">
          <div className="orbit orbit-one" aria-hidden="true" />
          <div className="orbit orbit-two" aria-hidden="true" />
          <div className="product-window">
            <div className="window-topline">
              <div className="mini-brand"><span className="wordmark-mark" aria-hidden="true">a</span> awn</div>
              <span>August overview</span>
              <span className="avatar" aria-hidden="true">M</span>
            </div>
            <div className="window-intro">
              <div><span className="tiny-label">Your month, at a glance</span><h2>Good morning, Maya.</h2></div>
              <span className="month-chip">01 — 31 Aug</span>
            </div>
            <div className="note-card note-one"><span className="note-dot" /> Plan updated</div>
            <div className="money-card card-float">
              <div><span className="tiny-label">Money left</span><strong>$1,842.50</strong></div>
              <span className="trend-up">+ $248 this month</span>
            </div>
            <div className="preview-grid">
              <article className="preview-card safe-card"><span className="tiny-label">Safe to spend</span><strong>$624</strong><p>For everyday choices</p><div className="progress"><i /></div></article>
              <article className="preview-card upcoming-card"><span className="tiny-label">Upcoming</span><strong>$318</strong><p>Rent, groceries &amp; bills</p><div className="upcoming-dots"><i /><i /><i /></div></article>
              <article className="preview-card goal-card"><span className="tiny-label">Savings goal</span><strong>Lisbon</strong><p>$1,240 of $2,000</p><div className="goal-line"><i /></div></article>
            </div>
            <div className="note-card note-two">You&apos;re on track <span aria-hidden="true">✦</span></div>
          </div>
        </div>
      </section>

      <section className="month-view section-shell" id="features">
        <div className="section-heading"><p className="eyebrow">The monthly picture</p><h2>One clear view<br />of your month</h2></div>
        <div className="month-detail"><p>AWN brings your spending, upcoming commitments, and intentions together. No scattered balances. No guesswork about what comes next.</p><a className="text-link" href="#how-it-works">Explore the flow <span aria-hidden="true">↗</span></a></div>
        <div className="feature-rail">
          <article><span className="feature-number">01</span><h3>A plan that moves with you</h3><p>See the shape of your month as everyday life unfolds.</p></article>
          <article><span className="feature-number">02</span><h3>Space for what matters</h3><p>Make room for the moments and goals you care about.</p></article>
          <article><span className="feature-number">03</span><h3>A next step you can trust</h3><p>Simple signals help you decide with perspective.</p></article>
        </div>
      </section>

      <section className="how-section" id="how-it-works">
        <div className="section-shell how-wrap"><div className="section-heading"><p className="eyebrow">A simple rhythm</p><h2>Less tracking.<br />More understanding.</h2></div>
          <ol className="steps-list"><li><span>01</span><div><h3>Capture</h3><p>Bring together the activity that shapes your real life.</p></div></li><li><span>02</span><div><h3>Understand</h3><p>See what&apos;s spoken for, what&apos;s flexible, and what&apos;s ahead.</p></div></li><li><span>03</span><div><h3>Act</h3><p>Choose your next move with a plan that stays clear.</p></div></li></ol>
        </div>
      </section>

      <section className="approach section-shell" id="approach">
        <div className="approach-intro"><p className="eyebrow">Designed around people</p><h2>Financial guidance should feel human.</h2><p>AWN is built to make the everyday money decisions feel more manageable—not louder.</p></div>
        <div className="principles"><article><span className="principle-mark">↘</span><h3>Clarity over complexity</h3><p>Useful information, given the space to make sense.</p></article><article><span className="principle-mark">≈</span><h3>Honesty over certainty</h3><p>A grounded view of today, with room for real life.</p></article><article><span className="principle-mark">◌</span><h3>Help before profit</h3><p>Support for better decisions, at the moment it matters.</p></article></div>
      </section>

      <section className="final-cta section-shell" id="get-started"><div><p className="eyebrow">Start with a clearer month</p><h2>Make room for<br />what&apos;s next.</h2></div><a className="button button-light" href="/auth/sign-up">Start with AWN <span aria-hidden="true">↗</span></a></section>
      <footer className="footer section-shell"><a className="wordmark footer-mark" href="#top"><span className="wordmark-mark" aria-hidden="true">a</span><span>awn</span></a><p>Money, with more perspective.</p><div><a href="#how-it-works">How it works</a><a href="#approach">Our approach</a><a href="/auth/sign-up">Get started</a></div></footer>
    </main>
  );
}
