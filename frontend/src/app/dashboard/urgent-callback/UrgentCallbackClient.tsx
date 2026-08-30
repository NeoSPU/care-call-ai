"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { createBatch, getCallbackRequests, importRunResult, updateCallbackRequest } from "../../../lib/carecall-api";
import { storeRoundSelection } from "../../../lib/round-selection";
import type { CallbackRequestDto, CallbackRequestsPayload } from "../../../lib/types";
import { notifyUrgentCallbackCount, urgentCallbackOpenCount } from "../../../lib/urgent-callback-events";

type UrgentCallbackClientProps = {
  data: CallbackRequestsPayload;
  operatorName: string;
};

type QueueFilter = "all" | "new" | "operator_review" | "callback_approved";

function sourceLabel(source: string) {
  return source.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status: string) {
  if (status === "new" || status === "auto_callback_requested") {
    return "status urgent";
  }
  if (isApprovedStatus(status) || status === "auto_callback_started") {
    return "status ready";
  }
  if (status === "resolved") {
    return "status ok";
  }
  if (status === "auto_callback_completed") {
    return "status ok";
  }
  if (status === "callback_limit_reached" || status === "auto_callback_failed") {
    return "status blocked";
  }
  if (status === "auto_callback_no_contact") {
    return "status review";
  }
  return "status review";
}

function matchingStatus(request: CallbackRequestDto, filter: QueueFilter) {
  const status = callbackDisplayStatus(request);
  if (filter === "all") {
    return status !== "resolved";
  }
  if (filter === "callback_approved") {
    return isApprovedStatus(status) || status === "auto_callback_started";
  }
  if (filter === "new") {
    return status === "new" || status === "auto_callback_requested";
  }
  if (filter === "operator_review") {
    return ["operator_review", "callback_limit_reached", "auto_callback_failed"].includes(status);
  }
  return status === filter;
}

function isApprovedStatus(status: string) {
  return status === "approved_callback" || status === "callback_approved";
}

function terminalCallbackStatus(status: string) {
  return ["resolved", "auto_callback_completed", "auto_callback_no_contact"].includes(status);
}

function callbackDisplayStatus(request: CallbackRequestDto) {
  if (request.auto_run_id && !terminalCallbackStatus(request.status)) {
    return request.auto_call_status || "auto_callback_started";
  }
  return request.status;
}

function callbackSummary(requests: CallbackRequestDto[]): CallbackRequestsPayload["summary"] {
  return {
    new: requests.filter((request) => ["new", "auto_callback_requested"].includes(callbackDisplayStatus(request))).length,
    in_review: requests.filter((request) =>
      ["operator_review", "callback_limit_reached", "auto_callback_failed"].includes(callbackDisplayStatus(request)),
    ).length,
    callback_approved: requests.filter((request) => {
      const status = callbackDisplayStatus(request);
      return isApprovedStatus(status) || status === "auto_callback_started";
    }).length,
    resolved: requests.filter((request) => terminalCallbackStatus(callbackDisplayStatus(request))).length,
  };
}

function activeAutoRunIds(requests: CallbackRequestDto[]) {
  return requests
    .filter((request) => request.auto_run_id && !terminalCallbackStatus(callbackDisplayStatus(request)))
    .map((request) => request.auto_run_id as string);
}

function compactTime(value?: string) {
  if (!value) {
    return "";
  }
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function UrgentCallbackClient({ data, operatorName }: UrgentCallbackClientProps) {
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [requests, setRequests] = useState(data.callback_requests);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const summary = useMemo(() => callbackSummary(requests), [requests]);
  const visibleRequests = useMemo(
    () => requests.filter((request) => matchingStatus(request, filter)),
    [filter, requests],
  );

  const openCount = urgentCallbackOpenCount(requests);

  useEffect(() => {
    let cancelled = false;

    async function refreshQueue() {
      try {
        const payload = await getCallbackRequests();
        if (!cancelled) {
          setRequests(payload.callback_requests);
          notifyUrgentCallbackCount(urgentCallbackOpenCount(payload.callback_requests));
        }
        const runIds = activeAutoRunIds(payload.callback_requests);
        if (runIds.length > 0) {
          const imports = await Promise.allSettled(runIds.map((runId) => importRunResult(runId)));
          if (!cancelled && imports.some((result) => result.status === "fulfilled" && result.value.imported)) {
            const refreshed = await getCallbackRequests();
            if (!cancelled) {
              setRequests(refreshed.callback_requests);
              notifyUrgentCallbackCount(urgentCallbackOpenCount(refreshed.callback_requests));
            }
          }
        }
      } catch {
        // Keep the current queue visible; operator-facing errors appear on explicit actions.
      }
    }

    const refreshOnVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshQueue();
      }
    };

    const interval = window.setInterval(refreshQueue, 10_000);
    window.addEventListener("focus", refreshQueue);
    document.addEventListener("visibilitychange", refreshOnVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshQueue);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
    };
  }, []);

  function updateLocalRequest(callbackId: string, patch: Partial<CallbackRequestDto>) {
    setRequests((current) => {
      const next = current.map((request) => (request.id === callbackId ? { ...request, ...patch } : request));
      notifyUrgentCallbackCount(urgentCallbackOpenCount(next));
      return next;
    });
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
        notifyUrgentCallbackCount(urgentCallbackOpenCount(previousRequests));
        setMessage("The service could not complete this action. Please contact support if the problem continues.");
      }
    });
  }

  function prepareCallbackCall(request: CallbackRequestDto) {
    setMessage("");
    startTransition(async () => {
      try {
        const payload = await createBatch({
          selected_recipient_ids: [request.recipient_id],
          label: `Urgent callback for ${request.recipient_name}`,
          call_date: new Date().toISOString().slice(0, 10),
        });
        storeRoundSelection([request.recipient_id]);
        window.location.href = `/dashboard/preflight?batch_id=${encodeURIComponent(payload.batch.id)}`;
      } catch {
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

      <section className="metrics" aria-label="Urgent callback metrics">
        <div className="metric accentUrgent">
          <span className="metricLabel">New requests</span>
          <strong className="metricValue">{summary.new}</strong>
          <span className="metricHint">Awaiting review</span>
        </div>
        <div className="metric accentReview">
          <span className="metricLabel">In review</span>
          <strong className="metricValue">{summary.in_review}</strong>
          <span className="metricHint">Operator queue</span>
        </div>
        <div className="metric accentReady">
          <span className="metricLabel">Callback approved</span>
          <strong className="metricValue">{summary.callback_approved}</strong>
          <span className="metricHint">Ready for preflight</span>
        </div>
        <div className="metric">
          <span className="metricLabel">Resolved</span>
          <strong className="metricValue">{summary.resolved}</strong>
          <span className="metricHint">Closed requests</span>
        </div>
      </section>

      <section className="section">
        <div className="sectionHeader">
          <div>
            <h2>Urgent callback requests</h2>
            <p>Siri requests start an automatic CALL-E callback when the recipient is eligible and within the daily limit.</p>
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
              {visibleRequests.map((request) => {
                const displayStatus = callbackDisplayStatus(request);
                const autoCallbackActive = Boolean(request.auto_run_id && !terminalCallbackStatus(displayStatus));
                return (
                  <tr key={request.id}>
                    <td>
                      <strong>{request.recipient_name}</strong>
                      <div className="muted">{request.masked_phone} · {request.delivery_area}</div>
                      <div className="muted">Requested {compactTime(request.requested_at ?? request.created_at)}</div>
                      {(request.same_day_callback_count ?? 0) > 0 && (
                        <div className="callbackRepeatMeta">
                          <span className={request.callback_repeat_review_required ? "status blocked" : "status review"}>
                            {request.same_day_callback_count} callback{request.same_day_callback_count === 1 ? "" : "s"} today
                          </span>
                          {request.callback_repeat_warning && <small>{request.callback_repeat_warning}</small>}
                        </div>
                      )}
                    </td>
                    <td><span className="tag">{sourceLabel(request.source)}</span></td>
                    <td>{sourceLabel(request.safety_category)}</td>
                    <td>{sourceLabel(request.condition)}</td>
                    <td>
                      <span className={statusClass(displayStatus)}>{sourceLabel(displayStatus)}</span>
                      {request.auto_run_id && <div className="muted">Run {request.auto_run_id}</div>}
                      {request.call_started_at && <div className="muted">Call started {compactTime(request.call_started_at)}</div>}
                      {request.call_completed_at && <div className="muted">Call completed {compactTime(request.call_completed_at)}</div>}
                      {request.auto_call_error && <div className="muted">{request.auto_call_error}</div>}
                    </td>
                    <td>{request.request_text}</td>
                    <td>
                      {terminalCallbackStatus(displayStatus) ? (
                      <div className="rowActions">
                        <button
                          className="button compact secondary"
                          disabled={isPending}
                          onClick={() => changeStatus(request.id, "resolved", "Cleared from callback queue after terminal automatic callback.")}
                          type="button"
                        >
                          Clear from queue
                        </button>
                      </div>
                    ) : autoCallbackActive ? (
                      <div className="rowActions">
                        <span className="status ready">Automatic call started</span>
                      </div>
                    ) : (
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
                        {isApprovedStatus(request.status) && (
                          <button
                            className="button compact"
                            disabled={isPending || request.blocked}
                            onClick={() => prepareCallbackCall(request)}
                            type="button"
                          >
                            Prepare call
                          </button>
                        )}
                      </div>
                    )}
                    </td>
                  </tr>
                );
              })}
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
