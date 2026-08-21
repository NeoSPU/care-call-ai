import { AppShell } from "../../../components/AppShell";
import { PreflightApprovalGate } from "../../../components/PreflightApprovalGate";
import { getDashboardData, getPreflight } from "../../../lib/carecall-api";
import { getCurrentOperatorName } from "../../../lib/current-operator";
import { logTechnicalError } from "../../../lib/technical-log";
import { SERVICE_DATA_ERROR } from "../../../lib/user-messages";

type PreflightPageProps = {
  searchParams?:
    | {
        batch_id?: string;
      }
    | Promise<{
        batch_id?: string;
      }>;
};

function ErrorPreflight() {
  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="brand">Care Call AI</div>
      </aside>
      <div className="content">
        <section className="section">
          <h1>Round preflight</h1>
          <p>{SERVICE_DATA_ERROR}</p>
        </section>
      </div>
    </main>
  );
}

export default async function PreflightPage({ searchParams }: PreflightPageProps = {}) {
  try {
    const resolvedSearchParams = await searchParams;
    const dashboard = await getDashboardData();
    const batchId = resolvedSearchParams?.batch_id ?? dashboard.call_status.preflight_plans[0]?.batch_id ?? "default";
    const preflight = await getPreflight(batchId);

    const operatorName = await getCurrentOperatorName();

    return (
      <AppShell active="preflight" operatorName={operatorName}>
        <div className="content">
          <PreflightApprovalGate operatorName={operatorName} preflight={preflight} />
        </div>
      </AppShell>
    );
  } catch (error) {
    logTechnicalError("Failed to load preflight data.", error);
    return <ErrorPreflight />;
  }
}
