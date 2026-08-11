import { getRecipientDetail } from "../../../../lib/carecall-api";
import { getCurrentOperatorName } from "../../../../lib/current-operator";
import { logTechnicalError } from "../../../../lib/technical-log";
import { SERVICE_DATA_ERROR } from "../../../../lib/user-messages";
import { RecipientDetailClient } from "./RecipientDetailClient";

type RecipientDetailPageProps = {
  params:
    | {
        id: string;
      }
    | Promise<{
        id: string;
      }>;
};

export default async function RecipientDetailPage({ params }: RecipientDetailPageProps) {
  const resolvedParams = await params;

  try {
    const [detail, operatorName] = await Promise.all([
      getRecipientDetail(resolvedParams.id),
      getCurrentOperatorName(),
    ]);
    return <RecipientDetailClient detail={detail} operatorName={operatorName} />;
  } catch (error) {
    logTechnicalError("Failed to load recipient detail.", error);
    return (
      <main className="appShell">
        <aside className="sidebar">
          <div className="brand">Care Call AI</div>
        </aside>
        <div className="content">
          <section className="section">
            <h1>Recipient Detail</h1>
            <p>{SERVICE_DATA_ERROR}</p>
          </section>
        </div>
      </main>
    );
  }
}
