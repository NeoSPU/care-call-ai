import { getDashboardData } from "../../../lib/carecall-api";
import { getCurrentOperatorName } from "../../../lib/current-operator";
import { logTechnicalError } from "../../../lib/technical-log";
import type { DashboardPayload } from "../../../lib/types";
import { SERVICE_DATA_ERROR } from "../../../lib/user-messages";
import { OperatorPanelClient } from "../OperatorPanelClient";

function OperatorPanelError() {
  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="brand">Care Call AI</div>
      </aside>
      <div className="content">
        <section className="section">
          <h1>Needs heard - Operator Panel</h1>
          <p>{SERVICE_DATA_ERROR}</p>
        </section>
      </div>
    </main>
  );
}

export default async function OperatorPanelPage() {
  let data: DashboardPayload;
  try {
    [data] = await Promise.all([getDashboardData()]);
  } catch (error) {
    logTechnicalError("Failed to load operator panel data.", error);
    return <OperatorPanelError />;
  }

  return <OperatorPanelClient data={data} operatorName={await getCurrentOperatorName()} />;
}
