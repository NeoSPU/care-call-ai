import { AppShell } from "../../../components/AppShell";
import { PreflightApprovalGate } from "../../../components/PreflightApprovalGate";
import { getPreflight } from "../../../lib/carecall-api";
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

function NoSelectedBatch({ operatorName }: { operatorName: string }) {
  return (
    <AppShell active="preflight" operatorName={operatorName}>
      <div className="content">
        <header className="topbar preflightTopbar">
          <div>
            <h1>Round preflight</h1>
            <p>No selected call round is ready for preflight.</p>
          </div>
        </header>
        <section className="section">
          <div className="emptyState">
            <h3>No planned calls selected</h3>
            <p>Return to the Operator Panel, select eligible recipients, and run preflight for that exact selection.</p>
            <a className="button" href="/dashboard/operator#call-list">Open Operator Panel</a>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

export default async function PreflightPage({ searchParams }: PreflightPageProps = {}) {
  try {
    const resolvedSearchParams = await searchParams;
    const operatorName = await getCurrentOperatorName();
    const batchId = resolvedSearchParams?.batch_id;
    if (!batchId) {
      return <NoSelectedBatch operatorName={operatorName} />;
    }
    const preflight = await getPreflight(batchId);

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
