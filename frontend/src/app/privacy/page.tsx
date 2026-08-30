import { PublicPageShell } from "../../components/PublicPageShell";

export default function PrivacyPage() {
  return (
    <PublicPageShell>
        <p className="landingKicker">Privacy policy</p>
        <h1>CareCall AI Privacy Policy</h1>
        <p>
          CareCall AI supports care coordinators by helping manage approved outreach,
          practical support requests, and service handoff records.
        </p>
        <h2>What data the service handles</h2>
        <p>
          The service may process operator login details, recipient contact and care
          coordination information, trusted answerer details, call summaries, service
          requests, and operational audit records.
        </p>
        <h2>How data is used</h2>
        <p>
          Data is used to prepare consent-aware call sessions, route recipients to the
          correct human or automated handling path, summarize practical needs, and
          support coordinator review and fulfilment.
        </p>
        <h2>Safety boundaries</h2>
        <p>
          CareCall AI is not a medical, legal, financial, or emergency triage service.
          Emergencies should be escalated to local emergency services or an appropriate
          human support team.
        </p>
        <h2>Contact</h2>
        <p>
          For privacy questions, use the support page and include only information
          needed to route the request.
        </p>
    </PublicPageShell>
  );
}
