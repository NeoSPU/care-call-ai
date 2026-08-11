import type { ServiceRequestDto } from "../lib/types";
import { EMPTY_SERVICE_DATA_HINT } from "../lib/user-messages";

const lanes = [
  { key: "review", title: "Human Review" },
  { key: "pending", title: "Pending Dispatch" },
  { key: "ready_to_print", title: "Ready To Print" },
] as const;

type ServiceRequestBoardProps = {
  serviceRequests: ServiceRequestDto[];
};

export function ServiceRequestBoard({ serviceRequests }: ServiceRequestBoardProps) {
  return (
    <section className="section">
      <div className="sectionHeader">
        <div>
          <h2>Service Requests</h2>
          <p>Call-derived requests ready for coordinator action.</p>
        </div>
        <a className="button" href="/dashboard/orders/print">
          Print Orders
        </a>
      </div>
      {serviceRequests.length === 0 && (
        <div className="emptyState">
          <h3>No recipients ready for this view</h3>
          <p>{EMPTY_SERVICE_DATA_HINT}</p>
        </div>
      )}
      <div className="requestBoard">
        {lanes.map((lane) => (
          <div className="lane" key={lane.key}>
            <h3>{lane.title}</h3>
            {serviceRequests.filter((request) => request.status === lane.key).length === 0 && (
              <p className="muted">No service requests in this lane</p>
            )}
            {serviceRequests
              .filter((request) => request.status === lane.key)
              .map((request) => (
                <article className="requestCard" key={request.id}>
                  <div className="requestTop">
                    <strong>{request.recipient_name ?? request.recipient_id}</strong>
                    <span className={`priority ${request.priority}`}>
                      {request.priority}
                    </span>
                  </div>
                  <div className="requestMeta">
                    {request.category} · {request.queue} · SLA {request.sla_hours}h
                  </div>
                  {request.items.length > 0 && (
                    <ul>
                      {request.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                  <p>{request.notes}</p>
                  {request.human_review_reason && <p>{request.human_review_reason}</p>}
                </article>
              ))}
          </div>
        ))}
      </div>
    </section>
  );
}
