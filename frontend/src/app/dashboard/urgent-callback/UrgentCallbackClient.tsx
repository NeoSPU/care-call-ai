"use client";

import { useMemo, useState, useTransition } from "react";

import { updateCallbackRequest } from "../../../lib/carecall-api";
import type { CallbackRequestDto, CallbackRequestsPayload } from "../../../lib/types";

type UrgentCallbackClientProps = {
  data: CallbackRequestsPayload;
  operatorName: string;
};

type QueueFilter = "all" | "new" | "operator_review" | "callback_approved";

function sourceLabel(source: string) {
  return source.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status: string) {
  if (status === "new") {
    return "status urgent";
  }
  if (status === "callback_approved") {
    return "status ready";
  }
  if (status === "resolved") {
    return "status ok";
  }
  return "status review";
}

function matchingStatus(request: CallbackRequestDto, filter: QueueFilter) {
  if (filter === "all") {
    return request.status !== "resolved";
  }
  return request.status === filter;
}

export function UrgentCallbackClient({ data, operatorName }: UrgentCallbackClientProps) {
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [requests, setRequests] = useState(data.callback_requests);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const visibleRequests = useMemo(
    () => requests.filter((request) => matchingStatus(request, filter)),
    [filter, requests],
  );

  const openCount = requests.filter((request) => request.status !== "resolved").length;

  function updateLocalRequest(callbackId: string, patch: Partial<CallbackRequestDto>) {
    setRequests((current) =>
      current.map((request) => (request.id === callbackId ? { ...request, ...patch } : request)),
    );
  }

  function changeStatus(callbackId: string, status: string, resolutionNote = "") {
    setMessage("");
    startTransition(async () => {
      const previousRequests = requests;
      try {
        updateLocalRequest(callbackId, { status, resolution_note: resolutionNote, operator: operatorName });
        const payload = await updateCallbackRequest(callbackId, {
          status,
          operator: operatorName,
          resolution_note: resolutionNote,
        });
        const updated = payload.callback_requests[0];
        if (updated) {
          updateLocalRequest(callbackId, updated);
        }
      } catch {
        setRequests(previousRequests);
        setMessage("The service could not complete this action. Please contact support if the problem continues.");
      }
    });
  }

  return (
    <>
      <div className="flowBanner calm">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.62a2 2 0 0 1-.45 2.11L8 9.72a16 16 0 0 0 6.28 6.28l1.27-1.27a2 2 0 0 1 2.11-.45c.84.29 1.72.5 2.62.62A2 2 0 0 1 22 16.92z" />
        </svg>
        <div>
          <strong>Urgent does not mean emergency medical response.</strong>{" "}
          Use this queue when a recipient has asked for a prompt return call. If anyone is in immediate danger, follow the organisation's emergency protocol first.
        </div>
      </div>

      <section className="section">
        <div className="sectionHeader">
          <div>
            <h2>Urgent callback requests</h2>
            <p>Siri, SMS, operator-created, and future app requests route here before real CALL-E callbacks.</p>
          </div>
          <span className="count">{openCount} open</span>
        </div>
        <div className="filters queueFilters" aria-label="Urgent callback filters">
          {[
            ["all", "All"],
            ["new", "New"],
            ["operator_review", "In review"],
            ["callback_approved", "Approved"],
          ].map(([key, label]) => (
            <button
              className={filter === key ? "chip active" : "chip"}
              key={key}
              onClick={() => setFilter(key as QueueFilter)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        {message && <p className="formError">{message}</p>}
        <div className="tableScroll">
          <table className="table">
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Source</th>
                <th>Safety</th>
                <th>Condition</th>
                <th>Status</th>
                <th>Request</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRequests.map((request) => (
                <tr key={request.id}>
                  <td>
                    <strong>{request.recipient_name}</strong>
                    <div className="muted">{request.masked_phone} · {request.delivery_area}</div>
                  </td>
                  <td><span className="tag">{sourceLabel(request.source)}</span></td>
                  <td>{sourceLabel(request.safety_category)}</td>
                  <td>{sourceLabel(request.condition)}</td>
                  <td><span className={statusClass(request.status)}>{sourceLabel(request.status)}</span></td>
                  <td>{request.request_text}</td>
                  <td>
                    <div className="rowActions">
                      <button
                        className="button compact secondary"
                        disabled={isPending}
                        onClick={() => changeStatus(request.id, "operator_review")}
                        type="button"
                      >
                        Review
                      </button>
                      <button
                        className="button compact"
                        disabled={isPending || request.blocked}
                        onClick={() => changeStatus(request.id, "callback_approved")}
                        type="button"
                      >
                        Approve
                      </button>
                      <button
                        className="button compact secondary"
                        disabled={isPending}
                        onClick={() => changeStatus(request.id, "operator_review", "Operator call required.")}
                        type="button"
                      >
                        Operator call
                      </button>
                      <button
                        className="button compact secondary"
                        disabled={isPending}
                        onClick={() => changeStatus(request.id, "resolved", "Dismissed as duplicate.")}
                        type="button"
                      >
                        Dismiss
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visibleRequests.length === 0 && (
          <div className="emptyState">
            <h3>No urgent callbacks</h3>
            <p>Incoming Siri Shortcut or operator-created callback requests will appear here.</p>
          </div>
        )}
      </section>
    </>
  );
}
