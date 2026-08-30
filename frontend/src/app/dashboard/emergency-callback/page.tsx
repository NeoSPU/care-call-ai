import { AppShell } from "../../../components/AppShell";
import { UrgentCallbackClient } from "../urgent-callback/UrgentCallbackClient";
import { getCallbackRequests } from "../../../lib/carecall-api";
import { getCurrentOperatorName } from "../../../lib/current-operator";
import { logTechnicalError } from "../../../lib/technical-log";
import type { CallbackRequestsPayload } from "../../../lib/types";
import { urgentCallbackOpenCount } from "../../../lib/urgent-callback-events";
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
  const urgentCount = urgentCallbackOpenCount(data.callback_requests);

  return (
    <AppShell active="urgent" operatorName={operatorName} urgentCallbackCount={urgentCount}>
      <div className="content">
        <header className="topbar">
          <div className="topbarTitle">
            <h1>Urgent Callback</h1>
            <p>Incoming support callback requests. This queue is urgent, but it is not an emergency medical service.</p>
          </div>
          <span className="roundPill">
            <span className="dot" />
            {urgentCount} open
          </span>
        </header>

        <UrgentCallbackClient data={data} operatorName={operatorName} />
      </div>
    </AppShell>
  );
}
