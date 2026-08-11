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
          <button className="button" onClick={() => print()}>
            Print selected
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
        <button className="button" onClick={() => print()}>
          Print sheet
        </button>
      </div>
      <section className="printFilters" aria-label="Print order filters">
        <label>
          Type
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="all">All ready orders</option>
            <option value="medicine">Medicine</option>
            <option value="food">Food / products</option>
            <option value="services">Services</option>
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
      {filtered.map((request) => {
        return (
          <section className="orderSheet" key={request.id}>
            <header>
              <div>
                <h1>CareCall Service Order</h1>
                <p>Order {request.id} · Priority {request.priority}</p>
              </div>
              <div className="orderDate">2026-08-01</div>
            </header>

            <div className="orderGrid">
              <div>
                <h2>Recipient</h2>
                <p>{request.recipient_name}</p>
                <p>{request.recipient_delivery_area}</p>
                <p>{request.recipient_masked_phone}</p>
              </div>
              <div>
                <h2>Care Notes</h2>
                <p>{request.care_summary}</p>
                <p>{request.care_notes}</p>
              </div>
            </div>

            <div className="orderBlock">
              <h2>Items / Services</h2>
              <ul>
                {request.items.map((item) => (
                  <li key={item}>
                    <span className="checkbox" /> {item}
                  </li>
                ))}
              </ul>
              <p>{request.notes}</p>
            </div>

            <footer className="completion">
              <span>Assigned to: ____________________</span>
              <span>Time: ____________________</span>
              <span>Completed: Yes / Partial / Not home</span>
              <span>Signature: ____________________</span>
            </footer>
          </section>
        );
      })}
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
