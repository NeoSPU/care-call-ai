import { SupportForm } from "./SupportForm";

export default function SupportPage() {
  return (
    <main className="publicPage supportPage">
      <section className="supportPanel" aria-labelledby="support-title">
        <a className="textAction" href="/">Back to Care Call AI</a>
        <div className="loginBrand supportBrand">
          <img alt="" height="40" src="/carecall-logo.svg" width="40" />
          <span>
            <span className="brandName">Care Call AI</span>
            <span className="brandSub">Support</span>
          </span>
        </div>
        <h1 id="support-title">Support</h1>
        <p>
          Send a short message about demo access, corrections, or questions. Do not include secrets, payment details, or
          unnecessary sensitive health information.
        </p>
        <SupportForm />
      </section>
      <footer className="publicFooter">© 2026 Alex Raixon. All rights reserved.</footer>
    </main>
  );
}
