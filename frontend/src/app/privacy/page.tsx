export default function PrivacyPage() {
  return (
    <main className="publicPage legalPage">
      <article className="legalDocument" aria-labelledby="privacy-title">
        <a className="textAction" href="/">Back to Care Call AI</a>
        <p className="entryEyebrow">Care Call AI</p>
        <h1 id="privacy-title">Privacy policy</h1>
        <p className="legalUpdated">Last updated: 21 August 2026</p>
        <p className="legalNotice">
          This policy describes the Care Call AI hackathon demo. It is not final production legal documentation.
          Production use will require a full UK/GDPR-oriented privacy review before handling real service data at scale.
        </p>

        <section>
          <h2>What this demo does</h2>
          <p>
            Care Call AI helps authorized coordinators prepare condition-aware CALL-E phone check-ins and turn call
            outcomes into practical care requests such as groceries, medicines, household help, and support services.
          </p>
        </section>

        <section>
          <h2>Information processed</h2>
          <p>
            The demo may process recipient names, phone numbers, care-routing notes, delivery areas, authorized
            answerers, operator approvals, call status, call summaries, and generated service-request details. Public
            demo data should remain fictional unless an approved participant has explicitly consented to a real test call.
          </p>
        </section>

        <section>
          <h2>Phone calls and CALL-E</h2>
          <p>
            Real outbound calls are placed only after the operator confirms the planned recipient list and enters the
            required authorization phrase. CALL-E is used to place and process the hackathon demo call flow.
          </p>
        </section>

        <section>
          <h2>Data protection choices</h2>
          <p>
            The application masks phone numbers in ordinary dashboard views, keeps backend credentials server-side, and
            uses operator approval gates before live calling. Do not enter sensitive medical documents into this demo.
          </p>
        </section>

        <section>
          <h2>Support contact</h2>
          <p>
            Use the support form to ask about this demo or request removal of test information. Support messages are
            validated server-side before they are accepted.
          </p>
        </section>
      </article>
      <footer className="publicFooter">© 2026 Alex Raixon. All rights reserved.</footer>
    </main>
  );
}
