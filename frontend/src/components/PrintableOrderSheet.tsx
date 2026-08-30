"use client";

import { AppShell } from "./AppShell";
import { usePrintableOrders, type ServiceRequestEditorState } from "./usePrintableOrders";
import type { PrintOrderDto, PrintOrdersPayload } from "../lib/types";
import { EMPTY_SERVICE_DATA_HINT } from "../lib/user-messages";

type PrintableOrderSheetProps = {
  operatorName?: string;
  orders: PrintOrdersPayload;
  urgentCallbackCount?: number;
};

export function PrintableOrderSheet({ operatorName, orders, urgentCallbackCount = 0 }: PrintableOrderSheetProps) {
  const orderState = usePrintableOrders({ operatorName, orders });

  const content = (
    <>
      <header className="topbar noPrint">
        <div className="topbarTitle">
          <h1><span className="sectionAccent delivered">Help delivered</span> - Orders</h1>
          <p>Review call-derived service requests, select fulfilment orders, and print practical handoff sheets.</p>
        </div>
        <span className="roundPill">
          <span className="dot" />
          {orderState.filtered.length} results
        </span>
        <div className="topActions">
          <a className="button secondary" href="/dashboard/operator">
            Operator panel
          </a>
          <button className="button" disabled={orderState.filteredPrintable.length === 0} onClick={() => orderState.printCurrentSelection("all visible ready orders")}>
            Print visible ready orders
          </button>
        </div>
      </header>

      <section className="metrics noPrint" aria-label="Help delivered summary">
        <div className="metric accentReady">
          <span className="metricLabel">Ready orders</span>
          <strong className="metricValue">{orderState.printable.length}</strong>
          <span className="metricHint">Printable now</span>
        </div>
        <div className="metric accentReview">
          <span className="metricLabel">Other results</span>
          <strong className="metricValue">{orderState.nonPrintable.length}</strong>
          <span className="metricHint">Shown in table</span>
        </div>
        <div className="metric accentUrgent">
          <span className="metricLabel">Urgent orders</span>
          <strong className="metricValue">{orderState.urgentPrintable.length}</strong>
          <span className="metricHint">Prioritise fulfilment</span>
        </div>
        <div className="metric">
          <span className="metricLabel">Delivery areas</span>
          <strong className="metricValue">{orderState.areas.length}</strong>
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
          Every processed call remains visible in the table. Ready orders can be printed; no-order and review results explain what happened.
        </div>
      </div>

      <div className="printActions">
        <a className="button secondary" href="/dashboard/operator">
          Back
        </a>
        <button className="button" disabled={orderState.filteredPrintable.length === 0} onClick={() => orderState.printCurrentSelection()}>
          Print filtered orders
        </button>
      </div>
      <section className="printFilters" aria-label="Print order filters">
        <label>
          Type
          <select value={orderState.categoryFilter} onChange={(event) => orderState.setCategoryFilter(event.target.value)}>
            <option value="all">All call results</option>
            {orderState.categories.map((category) => (
              <option key={category} value={category}>{categoryLabel(category)}</option>
            ))}
          </select>
        </label>
        <label>
          Recipient
          <select value={orderState.recipientFilter} onChange={(event) => orderState.setRecipientFilter(event.target.value)}>
            <option value="all">All recipients</option>
            {orderState.recipients.map((recipient) => (
              <option key={recipient} value={recipient}>{recipient}</option>
            ))}
          </select>
        </label>
        <label>
          Delivery area
          <select value={orderState.areaFilter} onChange={(event) => orderState.setAreaFilter(event.target.value)}>
            <option value="all">All areas</option>
            {orderState.areas.map((area) => (
              <option key={area} value={area}>{area}</option>
            ))}
          </select>
        </label>
        <label>
          Order date
          <select value={orderState.dateFilter} onChange={(event) => orderState.setDateFilter(event.target.value)}>
            <option value="all">All dates</option>
            {orderState.orderDates.map((date) => (
              <option key={date} value={date}>{formatOrderDateLabel(date)}</option>
            ))}
          </select>
        </label>
        <span>{orderState.filteredPrintable.length} ready for print</span>
      </section>
      {orderState.statusMessage && <p className="resultBox noPrint" role="status">{orderState.statusMessage}</p>}
      {orderState.actionError && <p className="resultBox error noPrint" role="alert">{orderState.actionError}</p>}
      <PrintableHandoffSheets orders={ordersForPrint(orderState.filteredPrintable, orderState.printScope)} />
      {orderState.currentOrders.length === 0 && (
        <section className="orderSheet">
          <h1>No call results yet</h1>
          <p>{EMPTY_SERVICE_DATA_HINT}</p>
        </section>
      )}
      {orderState.currentOrders.length > 0 && orderState.filtered.length === 0 && (
        <section className="orderSheet">
          <h1>No call results match these filters</h1>
          <p>Change the type, recipient, delivery area, or order date filter.</p>
        </section>
      )}
      {orderState.filtered.length > 0 && (
        <section className="ordersTableSection" aria-label="Call results and orders table">
          <table className="table ordersTable">
            <thead>
              <tr>
                <th>Client</th>
                <th>Order date</th>
                <th>Urgency</th>
                <th>Status</th>
                <th>Order number</th>
                <th>Delivery area</th>
                <th>Order result</th>
                <th className="noPrint">Print</th>
              </tr>
            </thead>
            <tbody>
              {orderState.filtered.map((request) => (
                <OrderTableRow
                  editor={orderState.editor}
                  editingRequestId={orderState.editingRequestId}
                  key={request.id}
                  onBeginEdit={orderState.beginEdit}
                  onCancelEdit={orderState.cancelEdit}
                  onEditorChange={orderState.setEditor}
                  onMarkPrintReady={orderState.markPrintReady}
                  onPrint={orderState.printCurrentSelection}
                  onRemove={orderState.removeOrder}
                  onSave={orderState.saveEdit}
                  printScope={orderState.printScope}
                  request={request}
                />
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

type PrintableHandoff = {
  address?: string;
  area?: string;
  careNotes?: string;
  careSummary?: string;
  createdAt?: string;
  groups: Array<{ category: string; items: string[]; notes: string[] }>;
  orderIds: string[];
  priority: string;
  recipientName: string;
  updatedAt?: string;
};

function PrintableHandoffSheets({ orders }: { orders: PrintOrderDto[] }) {
  const sheets = groupPrintableHandoffs(orders);
  const printedAt = new Date().toLocaleString([], {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="printOnly printHandoffStack" aria-label="Printable fulfilment handoff sheets">
      {sheets.map((sheet) => (
        <article className="printHandoffSheet" key={sheet.orderIds.join("|")}>
          <header className="printHandoffHeader">
            <img alt="Care Call AI" src="/carecall-logo.svg" />
            <div>
              <p className="printBrand">Care Call AI</p>
              <h1>Fulfilment Order</h1>
            </div>
          </header>

          <section className="printMetaGrid" aria-label="Order details">
            <div>
              <span>Order number</span>
              <strong>{sheet.orderIds.join(" / ")}</strong>
            </div>
            <div>
              <span>Client</span>
              <strong>{sheet.recipientName}</strong>
            </div>
            <div>
              <span>Order date</span>
              <strong>{formatPrintTimestamp(sheet.createdAt)}</strong>
            </div>
            <div>
              <span>Last updated</span>
              <strong>{formatPrintTimestamp(sheet.updatedAt)}</strong>
            </div>
            <div>
              <span>Printed</span>
              <strong>{printedAt}</strong>
            </div>
            <div>
              <span>Priority</span>
              <strong>{sheet.priority}</strong>
            </div>
            <div>
              <span>Delivery area</span>
              <strong>{sheet.area || "Unassigned"}</strong>
            </div>
            <div>
              <span>Address</span>
              <strong>{sheet.address || "Not recorded"}</strong>
            </div>
          </section>

          {(sheet.careSummary || sheet.careNotes) && (
            <section className="printCareBox">
              <strong>{sheet.careSummary || "Care notes"}</strong>
              {sheet.careNotes && <span>{sheet.careNotes}</span>}
            </section>
          )}

          <section className="printItems" aria-label="Requested items and services">
            {sheet.groups.map((group) => (
              <div className="printItemGroup" key={group.category}>
                <h2>{categoryLabel(group.category)}</h2>
                <ul>
                  {group.items.map((item) => (
                    <li key={item}>
                      <span className="printCheckbox" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                {group.notes.length > 0 && (
                  <p className="printGroupNotes">Notes: {Array.from(new Set(group.notes)).join(" ")}</p>
                )}
              </div>
            ))}
          </section>

          <footer className="printSignoff">
            <div><span />Prepared by</div>
            <div><span />Packed by</div>
            <div><span />Delivered by</div>
          </footer>
        </article>
      ))}
    </div>
  );
}

function ordersForPrint(orders: PrintOrderDto[], printScope: "filtered" | string) {
  return orders.filter((request) => printScope === "filtered" || request.id === printScope);
}

function groupPrintableHandoffs(orders: PrintOrderDto[]): PrintableHandoff[] {
  const byRecipientAndDate = new Map<string, PrintableHandoff>();

  for (const request of orders) {
    const orderDate = orderDateKey(request.created_at) || "undated";
    const key = `${request.recipient_id}:${orderDate}`;
    const handoff = byRecipientAndDate.get(key) ?? {
      address: request.recipient_address,
      area: request.recipient_delivery_area,
      careNotes: request.care_notes,
      careSummary: request.care_summary,
      createdAt: request.created_at,
      groups: [],
      orderIds: [],
      priority: request.priority,
      recipientName: request.recipient_name,
      updatedAt: request.updated_at,
    };

    handoff.orderIds.push(request.id);
    handoff.updatedAt = latestTimestamp(handoff.updatedAt, request.updated_at);
    handoff.priority = handoff.priority === "urgent" || request.priority === "urgent" ? "urgent" : request.priority;

    const category = printCategory(request.category);
    const existingGroup = handoff.groups.find((candidate) => candidate.category === category);
    const group = existingGroup ?? { category, items: [], notes: [] };
    for (const item of request.items) {
      if (!group.items.includes(item)) {
        group.items.push(item);
      }
    }
    if (request.notes) {
      group.notes.push(request.notes);
    }
    if (!existingGroup) {
      handoff.groups.push(group);
    }

    byRecipientAndDate.set(key, handoff);
  }

  return Array.from(byRecipientAndDate.values()).map((handoff) => ({
    ...handoff,
    groups: handoff.groups.sort((left, right) => categorySort(left.category) - categorySort(right.category)),
  }));
}

function categorySort(category: string) {
  if (category === "medicine") {
    return 0;
  }
  if (category === "food") {
    return 1;
  }
  return 2;
}

function latestTimestamp(left?: string, right?: string) {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return new Date(left.replace(" ", "T")).getTime() >= new Date(right.replace(" ", "T")).getTime() ? left : right;
}

function formatPrintTimestamp(value?: string) {
  if (!value) {
    return "Not recorded";
  }
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString([], {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function OrderTableRow({
  editor,
  editingRequestId,
  onBeginEdit,
  onCancelEdit,
  onEditorChange,
  onMarkPrintReady,
  onPrint,
  onRemove,
  onSave,
  printScope,
  request,
}: {
  editor: ServiceRequestEditorState;
  editingRequestId: string;
  onBeginEdit: (request: PrintOrderDto) => void;
  onCancelEdit: () => void;
  onEditorChange: (editor: ServiceRequestEditorState) => void;
  onMarkPrintReady: (request: PrintOrderDto) => void;
  onPrint: (label?: string, scope?: "filtered" | string) => void;
  onRemove: (request: PrintOrderDto) => void;
  onSave: (request: PrintOrderDto, overrides?: Partial<ServiceRequestEditorState>) => void;
  printScope: "filtered" | string;
  request: PrintOrderDto;
}) {
  const isEditing = editingRequestId === request.id;
  return (
    <tr className={rowClassName(request, printScope)} key={request.id}>
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
        {historySummary(request.update_history) && (
          <small className="orderHistory">{historySummary(request.update_history)}</small>
        )}
      </td>
      <td>
        <span className={`status ${priorityClass(request.priority)}`}>
          {request.priority}
        </span>
      </td>
      <td>
        <span className={`status ${request.status === "ready_to_print" ? "ready" : "review"}`}>
          {statusLabel(request)}
        </span>
        {request.human_review_reason && <small>{request.human_review_reason}</small>}
      </td>
      <td className="mono">{request.id}</td>
      <td>{request.recipient_delivery_area || "Unassigned"}</td>
      <td>
        {isEditing ? (
          <div className="orderInlineEditor">
            <label>
              Type
              <select value={editor.category} onChange={(event) => onEditorChange({ ...editor, category: event.target.value })}>
                <option value="groceries">Food / products</option>
                <option value="medication">Medicine</option>
                <option value="cleaning">Cleaning</option>
                <option value="transport">Transport</option>
                <option value="companionship">Companionship</option>
                <option value="repair">Repairs</option>
                <option value="documents">Documents help</option>
                <option value="other">Other / review</option>
              </select>
            </label>
            <label>
              Items
              <textarea
                aria-label={`Items for ${request.id}`}
                value={editor.itemsText}
                onChange={(event) => onEditorChange({ ...editor, itemsText: event.target.value })}
              />
            </label>
            <label>
              Notes
              <textarea
                aria-label={`Notes for ${request.id}`}
                value={editor.notes}
                onChange={(event) => onEditorChange({ ...editor, notes: event.target.value })}
              />
            </label>
            <label>
              Status
              <select
                value={editor.status}
                onChange={(event) => onEditorChange({ ...editor, status: event.target.value as ServiceRequestEditorState["status"] })}
              >
                <option value="ready_to_print">Ready to print</option>
                <option value="review">Keep for review</option>
              </select>
            </label>
            <label>
              Reason
              <input
                aria-label={`Reason for ${request.id}`}
                value={editor.reason}
                onChange={(event) => onEditorChange({ ...editor, reason: event.target.value })}
                placeholder="Correction note"
              />
            </label>
            <div className="orderEditorActions">
              <button className="button compact" type="button" onClick={() => onSave(request)}>
                Save
              </button>
              <button className="button secondary compact" type="button" onClick={onCancelEdit}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="orderNeedsGroup">
            <strong>{categoryLabel(printCategory(request.category))}</strong>
            <span>{deliveryDateText(request)}</span>
            <ul>
              {request.items.length > 0 ? (
                request.items.map((item) => <li key={item}>{item}</li>)
              ) : (
                <li>{emptyItemsLabel(request)}</li>
              )}
            </ul>
            {request.notes && <small>{request.notes}</small>}
          </div>
        )}
      </td>
      <td className="noPrint">
        <div className="orderRowActions">
          {request.status === "ready_to_print" ? (
            <button className="button secondary compact" onClick={() => onPrint(request.id, request.id)} type="button">
              Print order
            </button>
          ) : (
            <button
              className="button compact"
              onClick={() => onMarkPrintReady(request)}
              type="button"
            >
              Mark print-ready
            </button>
          )}
          <button className="button secondary compact" onClick={() => onBeginEdit(request)} type="button">
            Edit
          </button>
          <button className="button dangerTextButton compact" onClick={() => onRemove(request)} type="button">
            Remove
          </button>
        </div>
      </td>
    </tr>
  );
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

function rowClassName(
  request: PrintOrdersPayload["service_requests"][number],
  printScope: "filtered" | string,
) {
  const printable = request.status === "ready_to_print";
  const inScope = printScope === "filtered" || printScope === request.id;
  return [
    printable && inScope ? "printIncluded" : "printExcluded",
    printable ? "rowReady" : "rowHeld",
  ].join(" ");
}

function statusLabel(request: PrintOrdersPayload["service_requests"][number]) {
  if (request.status === "ready_to_print") {
    return "Ready order";
  }
  if (request.items.length === 0 && isNoRequestedItemsOutcome(request)) {
    return "No order";
  }
  return "Review needed";
}

function emptyItemsLabel(request: PrintOrdersPayload["service_requests"][number]) {
  return isNoRequestedItemsOutcome(request) ? "No requested items" : "Held for coordinator review";
}

function isNoRequestedItemsOutcome(request: PrintOrdersPayload["service_requests"][number]) {
  return request.human_review_reason.toLowerCase().includes("no practical support items were requested");
}

function priorityClass(priority: string) {
  if (priority === "urgent") {
    return "blocked";
  }
  if (priority === "review") {
    return "review";
  }
  return "ready";
}

function deliveryDateText(request: PrintOrdersPayload["service_requests"][number]) {
  if (request.priority === "urgent") {
    return "Delivery date: today or coordinator-prioritised";
  }
  return "Delivery date: next planned fulfilment";
}

function orderDateKey(value?: string) {
  if (!value) {
    return "";
  }
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  if (match) {
    return match[0];
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

function formatOrderDateLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString([], {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function historySummary(history?: Array<Record<string, unknown>>) {
  if (!history || history.length === 0) {
    return "";
  }
  const entries = history.slice(-3).map((entry) => {
    const event = typeof entry.event === "string" ? entry.event : "changed";
    const addedItems = Array.isArray(entry.added_items)
      ? entry.added_items.filter((item): item is string => typeof item === "string")
      : [];
    if (addedItems.length > 0) {
      return `${event}: ${addedItems.join(", ")}`;
    }
    return event;
  });
  const prefix = history.length > entries.length ? `History: ... ${entries.join(", ")}` : `History: ${entries.join(", ")}`;
  return prefix;
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
