import { AppShell } from "../../../components/AppShell";
import { UrgentCallbackClient } from "../urgent-callback/UrgentCallbackClient";
import { getCallbackRequests } from "../../../lib/carecall-api";
import { getCurrentOperatorName } from "../../../lib/current-operator";
import { logTechnicalError } from "../../../lib/technical-log";
import type { CallbackRequestsPayload } from "../../../lib/types";
import { SERVICE_DATA_ERROR } from "../../../lib/user-messages";

function UrgentCallbackError() {
  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="brand">Care Call AI</div>
      </aside>
      <div className="content">
        <section className="section">
          <h1>Urgent Callback</h1>
          <p>{SERVICE_DATA_ERROR}</p>
        </section>
      </div>
    </main>
  );
}

export default async function UrgentCallbackPage() {
  let data: CallbackRequestsPayload;
  try {
    data = await getCallbackRequests();
  } catch (error) {
    logTechnicalError("Failed to load urgent callback requests.", error);
    return <UrgentCallbackError />;
  }

  const operatorName = await getCurrentOperatorName();

  return (
    <AppShell active="urgent" operatorName={operatorName} urgentCallbackCount={data.summary.new}>
      <div className="content">
        <header className="topbar">
          <div className="topbarTitle">
            <h1>Urgent Callback</h1>
            <p>Incoming support callback requests. This queue is urgent, but it is not an emergency medical service.</p>
          </div>
          <span className="roundPill">
            <span className="dot" />
            {data.summary.new} new
          </span>
        </header>

        <section className="metrics" aria-label="Urgent callback metrics">
          <div className="metric accentUrgent">
            <span className="metricLabel">New requests</span>
            <strong className="metricValue">{data.summary.new}</strong>
            <span className="metricHint">Awaiting review</span>
          </div>
          <div className="metric accentReview">
            <span className="metricLabel">In review</span>
            <strong className="metricValue">{data.summary.in_review}</strong>
            <span className="metricHint">Operator queue</span>
          </div>
          <div className="metric accentReady">
            <span className="metricLabel">Callback approved</span>
            <strong className="metricValue">{data.summary.callback_approved}</strong>
            <span className="metricHint">Ready for preflight</span>
          </div>
          <div className="metric">
            <span className="metricLabel">Resolved</span>
            <strong className="metricValue">{data.summary.resolved}</strong>
            <span className="metricHint">Closed requests</span>
          </div>
        </section>

        <UrgentCallbackClient data={data} operatorName={operatorName} />
      </div>
    </AppShell>
  );
}
