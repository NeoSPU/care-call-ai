export default function TermsPage() {
  return (
    <main className="publicPage legalPage">
      <article className="legalDocument" aria-labelledby="terms-title">
        <a className="textAction" href="/">Back to Care Call AI</a>
        <p className="entryEyebrow">Care Call AI</p>
        <h1 id="terms-title">Terms and conditions</h1>
        <p className="legalUpdated">Last updated: 21 August 2026</p>
        <p className="legalNotice">
          These terms describe the Care Call AI hackathon demo. They are not final production terms. Production use will
          require a full legal review, operational policies, and organization-specific agreements.
        </p>

        <section>
          <h2>Demo purpose</h2>
          <p>
            Care Call AI is a hackathon demo for supervised care-intake calling. It is not an emergency service,
            medical-device system, clinical decision tool, or replacement for professional care staff.
          </p>
        </section>

        <section>
          <h2>Authorized use</h2>
          <p>
            Operators must only call recipients who have consented to be contacted and whose phone number has been
            verified. Do not use the demo for unsolicited calls, harassment, or any unlawful purpose.
          </p>
        </section>

        <section>
          <h2>Human oversight</h2>
          <p>
            Coordinators remain responsible for reviewing planned calls, excluding unsuitable recipients, checking call
            outcomes, and confirming service requests before real-world fulfilment.
          </p>
        </section>

        <section>
          <h2>Availability</h2>
          <p>
            The demo may be interrupted, rate limited, or changed during testing. Real CALL-E calls may consume provider
            credits and should be performed only through the application approval flow.
          </p>
        </section>

        <section>
          <h2>Support</h2>
          <p>
            Use the support form for questions, corrections, or demo access issues. Do not include secrets, payment
            details, or unnecessary sensitive health information in support messages.
          </p>
        </section>
      </article>
      <footer className="publicFooter">© 2026 Alex Raixon. All rights reserved.</footer>
    </main>
  );
}
