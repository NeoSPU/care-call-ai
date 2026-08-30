import { AppShell } from "../../../components/AppShell";
import { getDashboardData } from "../../../lib/carecall-api";
import { getCurrentOperatorName } from "../../../lib/current-operator";
import { logTechnicalError } from "../../../lib/technical-log";
import type { DashboardPayload } from "../../../lib/types";
import { SERVICE_DATA_ERROR } from "../../../lib/user-messages";
import { urgentCallbackOpenCount } from "../../../lib/urgent-callback-events";

function humanize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function RecipientsError() {
  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="brand">Care Call AI</div>
      </aside>
      <div className="content">
        <section className="section">
          <h1>Recipients</h1>
          <p>{SERVICE_DATA_ERROR}</p>
        </section>
      </div>
    </main>
  );
}

export default async function RecipientsPage() {
  let data: DashboardPayload;
  try {
    data = await getDashboardData();
  } catch (error) {
    logTechnicalError("Failed to load recipients.", error);
    return <RecipientsError />;
  }

  const operatorName = await getCurrentOperatorName();
  const urgentCount = urgentCallbackOpenCount(data.callback_requests ?? []);

  return (
    <AppShell active="recipients" operatorName={operatorName} urgentCallbackCount={urgentCount}>
      <div className="content">
        <header className="topbar">
          <div className="topbarTitle">
            <h1>Recipients</h1>
            <p>Client cards are managed separately from auto-call session preparation.</p>
          </div>
          <div className="topActions">
            <button className="button mutedButton" disabled type="button">Add recipient</button>
          </div>
        </header>

        <section className="section">
          <div className="sectionHeader">
            <div>
              <h2>Recipient cards</h2>
              <p>Open a card to edit phone, address, safety, condition profile, trusted answerers, and notes.</p>
            </div>
            <span className="count">{data.recipients.length} registered</span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Safety</th>
                <th>Condition</th>
                <th>Needs</th>
                <th>Area</th>
                <th>Phone</th>
                <th>Card</th>
              </tr>
            </thead>
            <tbody>
              {data.recipients.map((recipient) => (
                <tr key={recipient.id}>
                  <td><strong>{recipient.display_name}</strong></td>
                  <td>{humanize(recipient.safety_category)}</td>
                  <td>{humanize(recipient.condition ?? "general")} · {humanize(recipient.severity ?? "mild")}</td>
                  <td>{(recipient.need_categories ?? []).map(humanize).join(", ") || "No current requests"}</td>
                  <td>{recipient.delivery_area}</td>
                  <td>{recipient.masked_phone}</td>
                  <td><a className="button buttonSmall secondary" href={`/dashboard/recipients/${encodeURIComponent(recipient.id)}`}>Open</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </AppShell>
  );
}
