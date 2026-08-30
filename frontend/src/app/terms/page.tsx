import { PublicPageShell } from "../../components/PublicPageShell";

export default function TermsPage() {
  return (
    <PublicPageShell>
        <p className="landingKicker">Terms and conditions</p>
        <h1>CareCall AI Terms and Conditions</h1>
        <p>
          CareCall AI is provided as a care-coordination tool for approved operators,
          demonstration reviewers, and authorized project stakeholders.
        </p>
        <h2>Responsible use</h2>
        <p>
          Operators must use the service only for recipients who have an approved
          outreach basis. Real outbound calls require review of the planned call list
          and explicit approval in the interface.
        </p>
        <h2>Unsupported uses</h2>
        <p>
          The service must not be used for medical diagnosis, dosage advice, emergency
          dispatch, legal or financial advice, or fulfilment of illegal, unsafe,
          exploitative, age-restricted, or region-restricted requests.
        </p>
        <h2>Service outputs</h2>
        <p>
          Call summaries and service requests are coordinator-reviewed operational
          records. They do not guarantee that delivery or support has already been
          completed.
        </p>
        <h2>Availability</h2>
        <p>
          Demonstration environments may be limited, changed, or paused during
          development and hackathon review.
        </p>
    </PublicPageShell>
  );
}
