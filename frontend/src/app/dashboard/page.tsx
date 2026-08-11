import { getOperationsDashboard } from "../../lib/carecall-api";
import { getCurrentOperatorName } from "../../lib/current-operator";
import { logTechnicalError } from "../../lib/technical-log";
import type { OperationsDashboardPayload } from "../../lib/types";
import { SERVICE_DATA_ERROR } from "../../lib/user-messages";
import { DashboardClient } from "./DashboardClient";

function DashboardError() {
  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="brand">Care Call AI</div>
      </aside>
      <div className="content">
        <section className="section">
          <h1>Coordinator Dashboard</h1>
          <p>{SERVICE_DATA_ERROR}</p>
        </section>
      </div>
    </main>
  );
}

export default async function DashboardPage() {
  let data: OperationsDashboardPayload;
  try {
    [data] = await Promise.all([getOperationsDashboard()]);
  } catch (error) {
    logTechnicalError("Failed to load dashboard data.", error);
    return <DashboardError />;
  }

  return <DashboardClient data={data} operatorName={await getCurrentOperatorName()} />;
}
