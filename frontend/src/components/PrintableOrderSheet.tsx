"use client";

import { useMemo, useState } from "react";

import { AppShell } from "./AppShell";
import type { PrintOrdersPayload } from "../lib/types";
import { EMPTY_SERVICE_DATA_HINT } from "../lib/user-messages";

type PrintableOrderSheetProps = {
  operatorName?: string;
  orders: PrintOrdersPayload;
  urgentCallbackCount?: number;
};

export function PrintableOrderSheet({ operatorName, orders, urgentCallbackCount = 0 }: PrintableOrderSheetProps) {
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [recipientFilter, setRecipientFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [statusMessage, setStatusMessage] = useState("");
  const printable = orders.service_requests.filter(
    (request) => request.status === "ready_to_print",
  );
  const reviewQueue = orders.service_requests.filter((request) => request.status !== "ready_to_print");
  const urgentPrintable = printable.filter((request) => request.priority === "urgent");
  const recipients = useMemo(
    () => Array.from(new Set(printable.map((request) => request.recipient_name))).sort(),
    [printable],
  );
  const areas = useMemo(
    () => Array.from(new Set(printable.map((request) => request.recipient_delivery_area).filter(Boolean))).sort(),
    [printable],
  );
  const filtered = printable.filter((request) => {
    const category = printCategory(request.category);
    return (
      (categoryFilter === "all" || category === categoryFilter) &&
      (recipientFilter === "all" || request.recipient_name === recipientFilter) &&
      (areaFilter === "all" || request.recipient_delivery_area === areaFilter)
    );
  });
  const categories = useMemo(
    () => Array.from(new Set(printable.map((request) => printCategory(request.category)))).sort(),
    [printable],
  );

  function printCurrentSelection(label = "filtered orders") {
    setStatusMessage(`Preparing print view for ${label}.`);
    print();
  }

  const content = (
    <>
      <header className="topbar noPrint">
        <div className="topbarTitle">
          <h1>Help delivered - Orders</h1>
          <p>Review call-derived service requests, select fulfilment orders, and print practical handoff sheets.</p>
        </div>
        <span className="roundPill">
          <span className="dot" />
          {filtered.length} selected
        </span>
        <div className="topActions">
          <a className="button secondary" href="/dashboard/operator">
            Operator panel
          </a>
          <button className="button" onClick={() => printCurrentSelection("all visible orders")}>
            Print visible orders
          </button>
        </div>
      </header>

      <section className="metrics noPrint" aria-label="Help delivered summary">
        <div className="metric accentReady">
          <span className="metricLabel">Ready orders</span>
          <strong className="metricValue">{printable.length}</strong>
          <span className="metricHint">Printable now</span>
        </div>
        <div className="metric accentReview">
          <span className="metricLabel">Review queue</span>
          <strong className="metricValue">{reviewQueue.length}</strong>
          <span className="metricHint">Not printed yet</span>
        </div>
        <div className="metric accentUrgent">
          <span className="metricLabel">Urgent orders</span>
          <strong className="metricValue">{urgentPrintable.length}</strong>
          <span className="metricHint">Prioritise fulfilment</span>
        </div>
        <div className="metric">
          <span className="metricLabel">Delivery areas</span>
          <strong className="metricValue">{areas.length}</strong>
          <span className="metricHint">Routes represented</span>
        </div>
      </section>

      <div className="flowBanner noPrint">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
        <div>
          <strong>Care seen. Needs heard. Help delivered.</strong>{" "}
          Only ready-to-print requests become field handoff sheets. Review items remain visible in the summary but are not printed.
        </div>
      </div>

      <div className="printActions">
        <a className="button secondary" href="/dashboard/operator">
          Back
        </a>
        <button className="button" onClick={() => printCurrentSelection()}>
          Print filtered orders
        </button>
      </div>
      <section className="printFilters" aria-label="Print order filters">
        <label>
          Type
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="all">All ready orders</option>
            {categories.map((category) => (
              <option key={category} value={category}>{categoryLabel(category)}</option>
            ))}
          </select>
        </label>
        <label>
          Recipient
          <select value={recipientFilter} onChange={(event) => setRecipientFilter(event.target.value)}>
            <option value="all">All recipients</option>
            {recipients.map((recipient) => (
              <option key={recipient} value={recipient}>{recipient}</option>
            ))}
          </select>
        </label>
        <label>
          Delivery area
          <select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}>
            <option value="all">All areas</option>
            {areas.map((area) => (
              <option key={area} value={area}>{area}</option>
            ))}
          </select>
        </label>
        <span>{filtered.length} selected for print</span>
      </section>
      {statusMessage && <p className="resultBox noPrint" role="status">{statusMessage}</p>}
      {printable.length === 0 && (
        <section className="orderSheet">
          <h1>No recipients ready for this view</h1>
          <p>{EMPTY_SERVICE_DATA_HINT}</p>
        </section>
      )}
      {printable.length > 0 && filtered.length === 0 && (
        <section className="orderSheet">
          <h1>No orders match these filters</h1>
          <p>Change the type, recipient, or delivery area filter.</p>
        </section>
      )}
      {filtered.length > 0 && (
        <section className="ordersTableSection" aria-label="Printable orders table">
          <table className="table ordersTable">
            <thead>
              <tr>
                <th>Client</th>
                <th>Order date</th>
                <th>Urgency</th>
                <th>Order number</th>
                <th>Delivery area</th>
                <th>Grouped needs</th>
                <th className="noPrint">Print</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((request) => (
                <tr key={request.id}>
                  <td>
                    <strong>{request.recipient_name}</strong>
                    <span className="muted">{request.recipient_masked_phone}</span>
                    <span className="muted">{request.recipient_address}</span>
                  </td>
                  <td>
                    <span>{formatOrderTimestamp(request.created_at)}</span>
                    <small>
                      Updated {formatOrderTimestamp(request.updated_at)} · {request.update_count ?? 0} update
                      {(request.update_count ?? 0) === 1 ? "" : "s"}
                    </small>
                  </td>
                  <td>
                    <span className={`status ${request.priority === "urgent" ? "blocked" : "ready"}`}>
                      {request.priority}
                    </span>
                  </td>
                  <td className="mono">{request.id}</td>
                  <td>{request.recipient_delivery_area || "Unassigned"}</td>
                  <td>
                    <div className="orderNeedsGroup">
                      <strong>{categoryLabel(printCategory(request.category))}</strong>
                      <span>{deliveryDateText(request)}</span>
                      <ul>
                        {request.items.length > 0 ? (
                          request.items.map((item) => <li key={item}>{item}</li>)
                        ) : (
                          <li>Coordinator review</li>
                        )}
                      </ul>
                      {request.notes && <small>{request.notes}</small>}
                    </div>
                  </td>
                  <td className="noPrint">
                    <button className="button secondary" onClick={() => printCurrentSelection(request.id)} type="button">
                      Print order
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );

  if (operatorName) {
    return (
      <AppShell active="orders" operatorName={operatorName} urgentCallbackCount={urgentCallbackCount}>
        <div className="content helpDeliveredPage">
          {content}
        </div>
      </AppShell>
    );
  }

  return <div className="printPage">{content}</div>;
}

function printCategory(category: string) {
  const normalized = category.toLowerCase();
  if (["medicine", "medication", "pharmacy", "prescription"].includes(normalized)) {
    return "medicine";
  }
  if (["food", "groceries", "grocery", "meal", "meals", "products"].includes(normalized)) {
    return "food";
  }
  return "services";
}

function categoryLabel(category: string) {
  if (category === "medicine") {
    return "Medicine";
  }
  if (category === "food") {
    return "Food / products";
  }
  return "Services";
}

function deliveryDateText(request: PrintOrdersPayload["service_requests"][number]) {
  if (request.priority === "urgent") {
    return "Delivery date: today or coordinator-prioritised";
  }
  return "Delivery date: next planned fulfilment";
}

function formatOrderTimestamp(value?: string) {
  if (!value) {
    return "Not recorded";
  }
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString([], {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
