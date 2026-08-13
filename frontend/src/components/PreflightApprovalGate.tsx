"use client";

import { useMemo, useState } from "react";

import {
  approvePreflight,
  createBatch,
  getPreflight,
  getRunResults,
  getRunStatus,
  importRunResult,
  requestLiveExecution,
  runDryRunBatch,
} from "../lib/carecall-api";
import { storeRoundSelection } from "../lib/round-selection";
import { logTechnicalError } from "../lib/technical-log";
import type { ApprovalDto, PlannedCallDto, PreflightPayload } from "../lib/types";
import { SERVICE_SUPPORT_ERROR } from "../lib/user-messages";

const CONFIRMATION_LABELS = {
  active_consent: "I verified consent is active for every selected recipient.",
  care_route_match: "Routes and care profiles match every selected recipient.",
  exact_keyset: "Approved keys exactly match the backend ready key set.",
  real_side_effects:
    "I understand live CALL-E places real outbound calls and may spend credits.",
} as const;

type ConfirmationKey = keyof typeof CONFIRMATION_LABELS;
type Mode = "dry_run" | "live";

type PreflightApprovalGateProps = {
  operatorName?: string;
  preflight: PreflightPayload;
};

const AUTHORIZATION_PHRASE = "EXECUTE LIVE CALLS";

const emptyConfirmations: Record<ConfirmationKey, boolean> = {
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
  const [mode, setMode] = useState<Mode>("dry_run");
  const [confirmations, setConfirmations] =
    useState<Record<ConfirmationKey, boolean>>(emptyConfirmations);
  const [phrase, setPhrase] = useState("");
  const [approval, setApproval] = useState<ApprovalDto | null>(null);
  const [approvalErrors, setApprovalErrors] = useState<string[]>([]);
  const [result, setResult] = useState<string>("");
  const [liveRunId, setLiveRunId] = useState("");
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
  const liveReady =
    mode === "live" &&
    Boolean(planId) &&
    oneReadyRecipient &&
    allConfirmed &&
    exactPhrase &&
    maxBatchCompliant &&
    approvalErrors.length === 0;

  function setConfirmation(key: ConfirmationKey, value: boolean) {
    setApproval(null);
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
    setResult("");
    setLiveRunId("");
    setImportedRequestCount(null);
    setSelectionError("");
    setApproval(null);
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

  async function runDryRun() {
    if (!planId) {
      return;
    }
    setBusy(true);
    setResult("");
    setLiveRunId("");
    setImportedRequestCount(null);
    try {
      const response = await runDryRunBatch({
        plan_id: planId,
        approval_id: "dry-run",
        approved_keys: readyKeys,
      });
      if (response.records[0]?.id) {
        await getRunStatus(response.records[0].id);
        await getRunResults(response.records[0].id);
      }
      setResult(`Dry run complete: ${response.real_calls_placed} real calls placed.`);
    } catch (error) {
      logTechnicalError("Dry run request failed.", error);
      setResult(SERVICE_SUPPORT_ERROR);
    } finally {
      setBusy(false);
    }
  }

  async function runLive() {
    if (!planId || !liveReady) {
      return;
    }
    setBusy(true);
    setResult("");
    setApproval(null);
    setApprovalErrors([]);
    try {
      const approvalResponse = await approvePreflight({
        plan_id: planId,
        approved_keys: readyKeys,
        operator: operatorName,
        note: "Approved from preflight start action.",
        confirmations,
        authorization_phrase: phrase,
      });
      if (!approvalResponse.approved || !approvalResponse.approval?.id) {
        logTechnicalError("Preflight approval rejected by backend.", approvalResponse.blocked_reasons);
        setApprovalErrors([SERVICE_SUPPORT_ERROR]);
        setResult(SERVICE_SUPPORT_ERROR);
        return;
      }
      setApproval(approvalResponse.approval);
      const response = await requestLiveExecution({
        plan_id: planId,
        approval_id: approvalResponse.approval.id,
        approved_keys: readyKeys,
        confirmations,
        authorization_phrase: phrase,
      });
      if (!response.accepted) {
        logTechnicalError("Live execution rejected by backend.", response.blocked_reasons);
        setApproval(null);
        setApprovalErrors([SERVICE_SUPPORT_ERROR]);
      }
      const runId = response.records[0]?.id ?? "";
      setLiveRunId(runId);
      setResult(response.accepted ? liveAcceptedMessage(response.real_calls_placed, runId) : SERVICE_SUPPORT_ERROR);
    } catch (error) {
      logTechnicalError("Live execution request failed.", error);
      setApproval(null);
      setApprovalErrors([SERVICE_SUPPORT_ERROR]);
    } finally {
      setBusy(false);
    }
  }

  async function importLatestResult() {
    if (!liveRunId) {
      return;
    }
    setBusy(true);
    setImportedRequestCount(null);
    try {
      const response = await importRunResult(liveRunId);
      if (!response.imported) {
        setResult(`CALL-E run is ${response.provider_status}. No order has been imported yet.`);
        return;
      }
      setImportedRequestCount(response.service_requests.length);
      setResult(
        `CALL-E result imported: ${response.service_requests.length} service request${
          response.service_requests.length === 1 ? "" : "s"
        } created.`,
      );
    } catch (error) {
      logTechnicalError("CALL-E result import failed.", error);
      setResult(SERVICE_SUPPORT_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="warningBand sideEffectBand" role="alert">
        <strong>Approving live CALL-E places real outbound calls to every selected eligible recipient in the batch.</strong>
        <span>Dry run never dials. Blocked, DNC, and excluded rows cannot be selected.</span>
      </section>

      <header className="topbar preflightTopbar">
        <div>
          <a className="textAction" href="/dashboard">Back to Daily round</a>
          <h1>Round preflight / dry run</h1>
          <p>Validate routes, consent, idempotency keys, and backend gates before any side effect.</p>
        </div>
        <div className="modeToggle" role="group" aria-label="Execution mode">
          <button
            aria-pressed={mode === "dry_run"}
            className={mode === "dry_run" ? "active" : ""}
            onClick={() => setMode("dry_run")}
            type="button"
          >
            Dry run
          </button>
          <button
            aria-pressed={mode === "live"}
            className={mode === "live" ? "active live" : "live"}
            onClick={() => setMode("live")}
            type="button"
          >
            Live auto-round
          </button>
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
          <div className="batchMeta">
            <span>Batch <strong>{currentPreflight.batch_id ?? "current"}</strong></span>
            <span>Plan <strong>{planId || "pending"}</strong></span>
            <span>Mode <strong>{mode === "dry_run" ? "DRY_RUN" : "LIVE_SIDE_EFFECT"}</strong></span>
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
                  <th>Idempotency key</th>
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
                      {preview.blocked_reasons.map((reason) => (
                        <small className="blockReason" key={reason}>{reason}</small>
                      ))}
                    </td>
                    <td className="mono">{preview.ready ? preview.idempotency_key : "not issued"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selectionError && <p className="errorText" role="alert">{selectionError}</p>}
        </section>

        <aside className="approvalBox approvalGate">
          <h2>Approval Gate</h2>
          <p>Live execution requires four confirmations, exact backend keyset, and the exact phrase.</p>
          <div className="gateStats">
            <div>
              <span>Will dial</span>
              <strong>{readyKeys.length}</strong>
            </div>
            <div>
              <span>Max live batch</span>
              <strong>1</strong>
            </div>
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
              <span>Backend keyset</span>
              <strong>{planId && readyKeys.length > 0 ? "Issued" : "Pending"}</strong>
            </div>
            <div className={`readinessRow ${readinessClass(liveReady)}`}>
              <span>Live start gate</span>
              <strong>{liveReady ? "Ready" : "Locked"}</strong>
            </div>
          </div>
          <div className="keysetBox">
            <span>Backend ready key set</span>
            {readyKeys.map((key) => (
              <code key={key}>{key}</code>
            ))}
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
          </div>
          <label className="phraseField">
            <span>Authorization phrase</span>
            <input
              aria-label="Authorization phrase"
              onChange={(event) => {
                setApproval(null);
                setApprovalErrors([]);
                setPhrase(event.target.value);
              }}
              value={phrase}
            />
            <small>Type <code>{AUTHORIZATION_PHRASE}</code> exactly.</small>
          </label>
          {!maxBatchCompliant && (
            <p className="errorText">Live mode is limited to one selected recipient for the MVP.</p>
          )}
          {approvalErrors.map((error) => (
            <p className="errorText" key={error}>{error}</p>
          ))}
          <div className="gateActions">
            <button className="button secondary" disabled={busy || !planId} onClick={runDryRun} type="button">
              Run batch dry run (no dials)
            </button>
            <button
              className={liveReady ? "button dangerButton" : "button mutedButton"}
              disabled={busy || !liveReady}
              onClick={runLive}
              type="button"
            >
              Start live CALL-E round
            </button>
          </div>
          {liveRunId && (
            <div className="postCallActions">
              <span className="mono">Run {liveRunId}</span>
              <button className="button secondary" disabled={busy} onClick={importLatestResult} type="button">
                Import latest CALL-E result
              </button>
              {importedRequestCount !== null && (
                <a className="textAction" href="/dashboard/orders/print">
                  Open print orders
                </a>
              )}
            </div>
          )}
          {result && <p className="resultBox" role="status">{result}</p>}
        </aside>
      </div>
    </>
  );
}

function liveAcceptedMessage(realCallsPlaced: number, runId: string) {
  const suffix = runId ? " Import the latest CALL-E result after the call reaches a terminal status." : "";
  return `Live execution accepted: ${realCallsPlaced} real calls placed.${suffix}`;
}
