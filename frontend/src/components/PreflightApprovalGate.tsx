"use client";

import { useEffect, useMemo, useState } from "react";

import {
  approvePreflight,
  createBatch,
  getPreflight,
  importRunResult,
  requestLiveExecution,
} from "../lib/carecall-api";
import { storeRoundSelection } from "../lib/round-selection";
import { logTechnicalError } from "../lib/technical-log";
import type { PlannedCallDto, PreflightPayload } from "../lib/types";
import { SERVICE_SUPPORT_ERROR } from "../lib/user-messages";

const CONFIRMATION_LABELS = {
  active_consent: "I verified consent is active for every selected recipient.",
  care_route_match: "Routes and care profiles match every selected recipient.",
  exact_keyset: "I reviewed the planned call list shown on this screen.",
  real_side_effects: "I understand Care Call AI will place real outbound calls.",
} as const;

type ConfirmationKey = keyof typeof CONFIRMATION_LABELS;
type RepeatConfirmationKey = "same_day_repeat_acknowledged";
type ConfirmationState = Record<ConfirmationKey, boolean> & Partial<Record<RepeatConfirmationKey, boolean>>;
type ProgressStatus = "idle" | "submitting" | "waiting" | "imported" | "failed";
type ActiveCallSession = {
  runId: string;
  startedAt: string;
  plannedCount: number;
};

type PreflightApprovalGateProps = {
  operatorName?: string;
  preflight: PreflightPayload;
};

const AUTHORIZATION_PHRASE = "EXECUTE LIVE CALLS";
const POLL_INTERVAL_MS = process.env.NODE_ENV === "test" ? 100 : 8000;
const ACTIVE_SESSION_STORAGE_KEY = "carecall.activeLiveCallSession";

const emptyConfirmations: ConfirmationState = {
  active_consent: false,
  care_route_match: false,
  exact_keyset: false,
  real_side_effects: false,
};

function previewGroups(preflight: PreflightPayload) {
  const ready = preflight.ready_previews ?? [];
  const manual = preflight.manual_previews ?? [];
  const blocked = preflight.blocked_previews ?? [];
  return {
    ready,
    manual,
    blocked,
    all: [...ready, ...manual, ...blocked],
  };
}

function statusClass(preview: PlannedCallDto) {
  if (!preview.ready) {
    return preview.route === "staff" || preview.route === "blocked" ? "blocked" : "review";
  }
  return "ready";
}

function rowLabel(preview: PlannedCallDto) {
  if (preview.ready) {
    return "Included";
  }
  if (preview.route === "staff" || preview.route === "blocked") {
    return "Manual/caregiver/staff";
  }
  return "Review required";
}

function authorizedAnswererText(preview: PlannedCallDto) {
  const answerers = (preview.authorized_contacts ?? []).filter((contact) => contact.can_answer_intake);
  if (answerers.length === 0) {
    return "Named recipient only";
  }
  return `May answer: ${answerers.map((contact) => `${contact.name} (${contact.relationship})`).join(", ")}`;
}

function readinessClass(ready: boolean) {
  return ready ? "ready" : "review";
}

export function PreflightApprovalGate({ operatorName = "carecall-coordinator", preflight }: PreflightApprovalGateProps) {
  const [currentPreflight, setCurrentPreflight] = useState(preflight);
  const [confirmations, setConfirmations] =
    useState<ConfirmationState>(emptyConfirmations);
  const [phrase, setPhrase] = useState("");
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [approvalErrors, setApprovalErrors] = useState<string[]>([]);
  const [result, setResult] = useState<string>("");
  const [liveRunId, setLiveRunId] = useState("");
  const [providerStatus, setProviderStatus] = useState("");
  const [sessionStartedAt, setSessionStartedAt] = useState("");
  const [progressStatus, setProgressStatus] = useState<ProgressStatus>("idle");
  const [importedRequestCount, setImportedRequestCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectionError, setSelectionError] = useState("");

  const groups = useMemo(() => previewGroups(currentPreflight), [currentPreflight]);
  const readyKeys = useMemo(
    () => currentPreflight.ready_keys ?? groups.ready.map((preview) => preview.idempotency_key).filter(Boolean),
    [groups.ready, currentPreflight.ready_keys],
  );
  const allConfirmed = Object.values(confirmations).every(Boolean);
  const exactPhrase = phrase === AUTHORIZATION_PHRASE;
  const maxBatchCompliant = readyKeys.length <= 1;
  const planId = currentPreflight.plan_id ?? "";
  const oneReadyRecipient = readyKeys.length === 1;
  const answererRulesVisible = groups.ready.length > 0;
  const repeatPreviews = groups.ready.filter((preview) => (preview.same_day_call_count ?? 0) > 0);
  const repeatAcknowledgementNeeded = repeatPreviews.some((preview) => preview.operator_repeat_available);
  const repeatLimitReached = repeatPreviews.some((preview) => preview.operator_repeat_limit_reached);
  const repeatAcknowledged = confirmations.same_day_repeat_acknowledged === true;
  const liveReady =
    Boolean(planId) &&
    oneReadyRecipient &&
    allConfirmed &&
    (!repeatAcknowledgementNeeded || repeatAcknowledged) &&
    !repeatLimitReached &&
    exactPhrase &&
    maxBatchCompliant &&
    approvalErrors.length === 0;

  useEffect(() => {
    const restored = restoreActiveCallSession();
    if (!restored) {
      return;
    }
    setLiveRunId(restored.runId);
    setSessionStartedAt(restored.startedAt);
    setProgressStatus("waiting");
    setResult(activeSessionMessage(restored.startedAt));
  }, []);

  useEffect(() => {
    if (!liveRunId || importedRequestCount !== null || progressStatus === "failed" || progressStatus === "imported") {
      return undefined;
    }
    const timer = window.setInterval(() => {
      void importLatestResult(liveRunId, true);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [importedRequestCount, liveRunId, progressStatus]);

  function setConfirmation(key: ConfirmationKey, value: boolean) {
    setApprovalErrors([]);
    setConfirmations((current) => ({ ...current, [key]: value }));
  }

  function setRepeatConfirmation(key: RepeatConfirmationKey, value: boolean) {
    setApprovalErrors([]);
    setConfirmations((current) => ({ ...current, [key]: value }));
  }

  async function removeReadyRecipient(recipientId: string) {
    const remainingIds = groups.ready
      .map((preview) => preview.recipient_id)
      .filter((id) => id !== recipientId);

    if (remainingIds.length === 0) {
      setSelectionError("At least one recipient must remain selected for a backend batch.");
      return;
    }

    setBusy(true);
    resetRunState();
    setSelectionError("");
    setApprovalErrors([]);
    setConfirmations(emptyConfirmations);
    setPhrase("");
    try {
      const batch = await createBatch({
        selected_recipient_ids: remainingIds,
        label: "CareCall preflight adjusted round",
        call_date: currentPreflight.call_date ?? "2026-08-01",
      });
      const updated = await getPreflight(batch.batch.id);
      storeRoundSelection(remainingIds);
      setCurrentPreflight(updated);
      window.history.replaceState(null, "", `/dashboard/preflight?batch_id=${encodeURIComponent(batch.batch.id)}`);
    } catch (error) {
      logTechnicalError("Failed to update preflight selection.", error);
      setSelectionError(SERVICE_SUPPORT_ERROR);
    } finally {
      setBusy(false);
    }
  }

  function resetRunState() {
    setResult("");
    setLiveRunId("");
    setProviderStatus("");
    setSessionStartedAt("");
    setProgressStatus("idle");
    setImportedRequestCount(null);
    clearActiveCallSession();
  }

  async function runLive() {
    if (!planId || !liveReady) {
      return;
    }
    setBusy(true);
    setProgressOpen(true);
    setApprovalOpen(false);
    setProgressStatus("submitting");
    const startedAt = new Date().toISOString();
    setSessionStartedAt(startedAt);
    setResult(activeSessionMessage(startedAt));
    setApprovalErrors([]);
    try {
      const approvalResponse = await approvePreflight({
        plan_id: planId,
        approved_keys: readyKeys,
        operator: operatorName,
        note: "Approved from Start calls action.",
        confirmations,
        authorization_phrase: phrase,
      });
      if (!approvalResponse.approved || !approvalResponse.approval?.id) {
        logTechnicalError("Preflight approval rejected by backend.", approvalResponse.blocked_reasons);
        setApprovalErrors([SERVICE_SUPPORT_ERROR]);
        setResult(SERVICE_SUPPORT_ERROR);
        setProgressStatus("failed");
        return;
      }
      const response = await requestLiveExecution({
        plan_id: planId,
        approval_id: approvalResponse.approval.id,
        approved_keys: readyKeys,
        confirmations,
        authorization_phrase: phrase,
      });
      if (!response.accepted) {
        logTechnicalError("Live execution rejected by backend.", response.blocked_reasons);
        setApprovalErrors([SERVICE_SUPPORT_ERROR]);
        setResult(SERVICE_SUPPORT_ERROR);
        setProgressStatus("failed");
        return;
      }
      const runId = response.records[0]?.id ?? "";
      setLiveRunId(runId);
      setProgressStatus("waiting");
      setResult(`${activeSessionMessage(startedAt)} ${liveAcceptedMessage(response.real_calls_placed)}`);
      if (runId) {
        persistActiveCallSession({
          runId,
          startedAt,
          plannedCount: readyKeys.length,
        });
        void importLatestResult(runId, true);
      }
    } catch (error) {
      logTechnicalError("Live execution request failed.", error);
      setApprovalErrors([SERVICE_SUPPORT_ERROR]);
      setResult(SERVICE_SUPPORT_ERROR);
      setProgressStatus("failed");
    } finally {
      setBusy(false);
    }
  }

  async function importLatestResult(runId = liveRunId, automatic = false) {
    if (!runId) {
      return;
    }
    if (!automatic) {
      setBusy(true);
    }
    try {
      const response = await importRunResult(runId);
      setProviderStatus(response.provider_status);
      if (!response.imported) {
        setProgressStatus("waiting");
        setResult(`CALL-E status: ${response.provider_status}. Waiting for a completed result before creating orders.`);
        return;
      }
      setImportedRequestCount(response.service_requests.length);
      setProgressStatus("imported");
      clearActiveCallSession();
      setResult(
        `CALL-E result imported: ${response.service_requests.length} service request${
          response.service_requests.length === 1 ? "" : "s"
        } created.`,
      );
    } catch (error) {
      logTechnicalError("CALL-E result import failed.", error);
      if (!automatic) {
        setResult(SERVICE_SUPPORT_ERROR);
        setProgressStatus("failed");
      }
    } finally {
      if (!automatic) {
        setBusy(false);
      }
    }
  }

  return (
    <>
      <header className="topbar preflightTopbar">
        <div>
          <a className="textAction" href="/dashboard/operator">Back to Operator panel</a>
          <h1>Round preflight</h1>
          <p>Review the planned calls, remove anyone who should not be called, then start the approved round.</p>
        </div>
      </header>

      <div className="preflightLayout">
        <section className="section preflightTableSection">
          <div className="sectionHeader">
            <div>
              <h2>Planned calls</h2>
              <p>
                {readyKeys.length} included · {groups.manual.length + groups.blocked.length} locked or manual
              </p>
            </div>
          </div>
          <div className="batchMeta operatorBatchMeta">
            <span>Batch <strong>{currentPreflight.batch_id ?? "current"}</strong></span>
            <span>Date <strong>{currentPreflight.call_date ?? "today"}</strong></span>
          </div>
          <div className="tableScroll">
            <table className="table preflightTable">
              <thead>
                <tr>
                  <th>Include</th>
                  <th>Recipient</th>
                  <th>Masked phone</th>
                  <th>Route</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {groups.all.map((preview) => (
                  <tr className={preview.ready ? "" : "excludedRow"} key={preview.recipient_id}>
                    <td>
                      {preview.ready ? (
                        <label className="preflightIncludeControl">
                          <input
                            aria-label={`Include ${preview.recipient_label} in preflight`}
                            checked
                            disabled={busy}
                            onChange={() => void removeReadyRecipient(preview.recipient_id)}
                            type="checkbox"
                          />
                          <span aria-hidden="true" className="checkIndicator on">✓</span>
                        </label>
                      ) : (
                        <span aria-label="Locked out of automated calling" className="checkIndicator locked">
                          -
                        </span>
                      )}
                    </td>
                    <td>
                      <strong>{preview.recipient_label}</strong>
                      <span className="muted mono">{preview.recipient_id}</span>
                      <span className="authorizedAnswerers">{authorizedAnswererText(preview)}</span>
                    </td>
                    <td className="mono">{preview.masked_phone}</td>
                    <td>{preview.route}</td>
                    <td>
                      <span className={`status ${statusClass(preview)}`}>{rowLabel(preview)}</span>
                      {preview.same_day_repeat_warning && (
                        <small className="blockReason repeatWarning">{preview.same_day_repeat_warning}</small>
                      )}
                      {preview.blocked_reasons.map((reason) => (
                        <small className="blockReason" key={reason}>{reason}</small>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selectionError && <p className="errorText" role="alert">{selectionError}</p>}
        </section>

        <aside className="approvalBox roundActionRail" aria-label="Start calls">
          <h2>Start calls</h2>
          <p>Open the approval check, confirm the planned list, and launch the real CALL-E round.</p>
          <div className="gateStats">
            <div>
              <span>Will call</span>
              <strong>{readyKeys.length}</strong>
            </div>
            <div>
              <span>Manual</span>
              <strong>{groups.manual.length + groups.blocked.length}</strong>
            </div>
          </div>
          {!maxBatchCompliant && (
            <p className="errorText">Live mode is limited to one selected recipient for the MVP.</p>
          )}
          <button
            className="button dangerButton startCallsButton"
            disabled={busy || !planId || !oneReadyRecipient || !maxBatchCompliant}
            onClick={() => setApprovalOpen(true)}
            type="button"
          >
            Start calls
          </button>
          {liveRunId && (
            <div className="postCallActions">
              <span className="mono">Run {liveRunId}</span>
              <button className="button secondary" disabled={busy} onClick={() => void importLatestResult()} type="button">
                Check CALL-E result
              </button>
              {importedRequestCount !== null && (
                <a className="textAction" href="/dashboard/orders/print">
                  Open orders
                </a>
              )}
            </div>
          )}
          {result && <p className="resultBox" role="status">{result}</p>}
        </aside>
      </div>

      {approvalOpen && (
        <div className="modalScrim" role="presentation">
          <section aria-modal="true" className="approvalModal approvalBox" role="dialog" aria-labelledby="approval-title">
            <div className="modalHeader">
              <div>
                <h2 id="approval-title">Approval Gate</h2>
                <p>Confirm the planned call round before Care Call AI starts real outbound calls.</p>
              </div>
              <button className="iconButton" onClick={() => setApprovalOpen(false)} type="button" aria-label="Close approval gate">
                ×
              </button>
            </div>
            <div className="demoReadiness" aria-label="Final demo readiness">
              <div className={`readinessRow ${readinessClass(oneReadyRecipient)}`}>
                <span>Selected recipient</span>
                <strong>{oneReadyRecipient ? "Exactly one" : "Adjust to one"}</strong>
              </div>
              <div className={`readinessRow ${readinessClass(answererRulesVisible)}`}>
                <span>Answerer rule</span>
                <strong>{answererRulesVisible ? "Visible" : "Missing"}</strong>
              </div>
              <div className={`readinessRow ${readinessClass(Boolean(planId) && readyKeys.length > 0)}`}>
                <span>Planned calls</span>
                <strong>{planId && readyKeys.length > 0 ? "Ready" : "Pending"}</strong>
              </div>
              <div className={`readinessRow ${readinessClass(liveReady)}`}>
                <span>Start gate</span>
                <strong>{liveReady ? "Ready" : "Locked"}</strong>
              </div>
            </div>
            <div className="checklist">
              {(Object.keys(CONFIRMATION_LABELS) as ConfirmationKey[]).map((key) => (
                <label className={confirmations[key] ? "checkRow on" : "checkRow"} key={key}>
                  <input
                    checked={confirmations[key]}
                    onChange={(event) => setConfirmation(key, event.target.checked)}
                    type="checkbox"
                  />
                  <span>{CONFIRMATION_LABELS[key]}</span>
                </label>
              ))}
              {repeatAcknowledgementNeeded && (
                <label className={repeatAcknowledged ? "checkRow on repeatCheckRow" : "checkRow repeatCheckRow"}>
                  <input
                    checked={repeatAcknowledged}
                    onChange={(event) => setRepeatConfirmation("same_day_repeat_acknowledged", event.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    I understand this is a same-day repeat call and the agent will ask whether to update the previous request or add changes.
                  </span>
                </label>
              )}
            </div>
            {repeatLimitReached && (
              <p className="errorText">
                Operator-initiated same-day repeat calling has reached the daily limit for this recipient.
              </p>
            )}
            <label className="phraseField">
              <span>Authorization phrase</span>
              <input
                aria-label="Authorization phrase"
                onChange={(event) => {
                  setApprovalErrors([]);
                  setPhrase(event.target.value);
                }}
                value={phrase}
              />
              <small>Type <code>{AUTHORIZATION_PHRASE}</code> exactly.</small>
            </label>
            {approvalErrors.map((error) => (
              <p className="errorText" key={error}>{error}</p>
            ))}
            <div className="gateActions horizontalActions">
              <button className="button secondary" onClick={() => setApprovalOpen(false)} type="button">
                Cancel
              </button>
              <button
                className={liveReady ? "button dangerButton" : "button mutedButton"}
                disabled={busy || !liveReady}
                onClick={runLive}
                type="button"
              >
                Start calls now
              </button>
            </div>
          </section>
        </div>
      )}

      {progressOpen && (
        <div className="modalScrim" role="presentation">
          <section aria-modal="true" className="progressModal approvalBox" role="dialog" aria-labelledby="progress-title">
            <div className="modalHeader">
              <div>
                <h2 id="progress-title">Call round progress</h2>
                <p>Care Call AI is tracking the CALL-E result and will create orders when the result is ready.</p>
              </div>
              <button className="iconButton" onClick={() => setProgressOpen(false)} type="button" aria-label="Close call progress">
                ×
              </button>
            </div>
            <div className="progressGrid" aria-label="Call progress summary">
              <div>
                <span>Planned</span>
                <strong>{readyKeys.length}</strong>
              </div>
              <div>
                <span>Submitted</span>
                <strong>{liveRunId ? 1 : progressStatus === "submitting" ? 0 : 0}</strong>
              </div>
              <div>
                <span>Completed</span>
                <strong>{progressStatus === "imported" ? 1 : 0}</strong>
              </div>
              <div>
                <span>Orders</span>
                <strong>{importedRequestCount ?? 0}</strong>
              </div>
            </div>
            <div className={`progressStatus ${progressStatus}`} role="status">
              <strong>{progressTitle(progressStatus)}</strong>
              <span>{result || "Preparing the call round."}</span>
              {progressStatus === "waiting" && sessionStartedAt && (
                <small>
                  Started at {formatSessionTime(sessionStartedAt)}. You can safely close this window and keep working.
                  The dialing session has already started and will continue with the call list approved at launch.
                </small>
              )}
              {providerStatus && <small>Provider status: {providerStatus}</small>}
            </div>
            <div className="gateActions horizontalActions">
              <button className="button secondary" disabled={busy || !liveRunId} onClick={() => void importLatestResult()} type="button">
                Check now
              </button>
              {importedRequestCount !== null && (
                <a className="button" href="/dashboard/orders/print">
                  Open orders
                </a>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function liveAcceptedMessage(realCallsPlaced: number) {
  return `Live execution accepted: ${realCallsPlaced} real call${realCallsPlaced === 1 ? "" : "s"} placed. Waiting for CALL-E to finish the result.`;
}

function activeSessionMessage(startedAt: string) {
  return `The approved call chain started at ${formatSessionTime(startedAt)}. You can safely close the progress window and continue using Care Call AI; this dialing session will continue with the recipient list approved at launch.`;
}

function formatSessionTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function persistActiveCallSession(session: ActiveCallSession) {
  try {
    window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // The UI can still poll during the current page lifetime if storage is unavailable.
  }
}

function restoreActiveCallSession() {
  try {
    const raw = window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<ActiveCallSession>;
    if (!parsed.runId || !parsed.startedAt) {
      return null;
    }
    return {
      runId: parsed.runId,
      startedAt: parsed.startedAt,
      plannedCount: Number(parsed.plannedCount ?? 1),
    } satisfies ActiveCallSession;
  } catch {
    return null;
  }
}

function clearActiveCallSession() {
  try {
    window.localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures; imported server state remains authoritative.
  }
}

function progressTitle(status: ProgressStatus) {
  if (status === "submitting") {
    return "Submitting call";
  }
  if (status === "waiting") {
    return "Waiting for CALL-E result";
  }
  if (status === "imported") {
    return "Needs heard";
  }
  if (status === "failed") {
    return "Action needed";
  }
  return "Ready";
}
