import { cookies } from "next/headers";

import { LandingHeroStage } from "../components/LandingHeroStage";
import { ThemeToggle } from "../components/ThemeToggle";
import { AUTH_COOKIE_NAME, verifySessionToken } from "../lib/auth-session";

export default async function Home() {
  const cookieStore = await cookies();
  const session = await verifySessionToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);
  const primaryHref = session ? "/dashboard" : "/login";
  const primaryLabel = session ? "Dashboard" : "Login";

  return (
    <main className="landingPage">
      <div className="landingTop">
        <nav className="landingLinks" aria-label="Legal and support links">
          <a href="/privacy">Privacy policy</a>
          <a href="/terms">Terms and conditions</a>
          <a href="/support">Contact support</a>
        </nav>
        <div className="landingThemeControl">
          <ThemeToggle compact />
        </div>
      </div>

      <section className="landingHero" aria-labelledby="landing-title">
        <LandingHeroStage animateOnFirstVisit={!session}>
          <div className="sloganScatter" aria-hidden="true">
            <span className="sloganWord seen">Care seen</span>
            <span className="sloganWord heard">Needs heard</span>
            <span className="sloganWord delivered">Help delivered</span>
          </div>
          <div className="logoStage">
            <div className="logoGlow" aria-hidden="true" />
            <img alt="Care Call AI mark" src="/carecall-logo-mark.svg" />
          </div>
        </LandingHeroStage>

        <h1 className="wordmark" id="landing-title"><span>Care Call AI</span></h1>
        <p className="srOnly">Care seen. Needs heard. Help delivered.</p>
        <p className="landingLead">
          Approved CALL-E check-ins that turn beneficiary conversations into practical support requests.
        </p>

        <div className="ctaRow" aria-label="Primary actions">
          <a className="glassBtn primary" href={primaryHref}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="9" rx="1" />
              <rect x="14" y="3" width="7" height="5" rx="1" />
              <rect x="14" y="12" width="7" height="9" rx="1" />
              <rect x="3" y="16" width="7" height="5" rx="1" />
            </svg>
            {primaryLabel}
          </a>
          <a className="glassBtn secondary" href="/support">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            Support
          </a>
        </div>
      </section>

      <footer className="landingFooter">
        <span>© 2026 Alex Raixon. All rights reserved.</span>
      </footer>
    </main>
  );
}
