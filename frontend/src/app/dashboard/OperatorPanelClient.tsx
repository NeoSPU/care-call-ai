"use client";

import { useEffect, useMemo, useState } from "react";

import { AppShell } from "../../components/AppShell";
import { RecipientCallList } from "../../components/RecipientCallList";
import { createBatch } from "../../lib/carecall-api";
import { readStoredRoundSelection, storeRoundSelection } from "../../lib/round-selection";
import { logTechnicalError } from "../../lib/technical-log";
import type { DashboardPayload, PlannedCallDto, RecipientCardDto, ServiceRequestDto } from "../../lib/types";
import { urgentCallbackOpenCount } from "../../lib/urgent-callback-events";
import { SERVICE_SUPPORT_ERROR } from "../../lib/user-messages";

function enrichRequests(data: DashboardPayload): ServiceRequestDto[] {
  const names = new Map(data.recipients.map((recipient) => [recipient.id, recipient.display_name]));
  return data.service_requests.map((request) => ({
    ...request,
    recipient_name: request.recipient_name ?? names.get(request.recipient_id) ?? request.recipient_id,
  }));
}

function attentionItems(recipients: RecipientCardDto[]) {
  return recipients.filter((recipient) => !recipient.automation_eligible);
}

function canAutoCallRecipient(recipient: RecipientCardDto | undefined) {
  return Boolean(recipient?.automation_eligible);
}

function readyCalls(plannedCalls: PlannedCallDto[], recipients: RecipientCardDto[]) {
  const recipientById = new Map(recipients.map((recipient) => [recipient.id, recipient]));
  return plannedCalls.filter((call) => call.ready && canAutoCallRecipient(recipientById.get(call.recipient_id)));
}

function needsByRecipient(serviceRequests: ServiceRequestDto[]) {
  return serviceRequests.reduce<Record<string, string[]>>((acc, request) => {
    const categories = acc[request.recipient_id] ?? [];
    if (!categories.includes(request.category)) {
      categories.push(request.category);
    }
    acc[request.recipient_id] = categories;
    return acc;
  }, {});
}

type OperatorPanelClientProps = {
  data: DashboardPayload;
  operatorName: string;
};

export function OperatorPanelClient({ data, operatorName }: OperatorPanelClientProps) {
  const calls = useMemo(() => readyCalls(data.planned_calls, data.recipients), [data.planned_calls, data.recipients]);
  const initialSelectedRecipientIds = useMemo(() => calls.map((call) => call.recipient_id), [calls]);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>(initialSelectedRecipientIds);
  const [selectionHydrated, setSelectionHydrated] = useState(false);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [preflightError, setPreflightError] = useState("");

  const selectedCalls = calls.filter((call) => selectedRecipientIds.includes(call.recipient_id));
  const attention = attentionItems(data.recipients);
  const serviceRequests = enrichRequests(data);
  const needCategoriesByRecipient = needsByRecipient(serviceRequests);
  const automationReadyCount = selectedCalls.length;

  const metrics = [
    { className: "", hint: "Prepared recipients", label: "On today's list", value: data.summary.recipients },
    { className: "accentReady", hint: "Eligible for CALL-E", label: "Automation queue", value: automationReadyCount },
    { className: "accentReview", hint: "Review before include", label: "Needs attention", value: attention.length },
    { className: "accentUrgent", hint: "No auto-dial", label: "Excluded / manual", value: data.summary.blocked },
    { className: "", hint: "Round not started", label: "Calls completed", value: data.call_status.intake_results.length },
    { className: "", hint: "From prior + drafts", label: "Service requests", value: data.summary.service_requests },
  ];

  useEffect(() => {
    setSelectedRecipientIds(readStoredRoundSelection(initialSelectedRecipientIds) ?? initialSelectedRecipientIds);
    setSelectionHydrated(true);
  }, [initialSelectedRecipientIds]);

  useEffect(() => {
    if (!selectionHydrated) {
      return;
    }
    storeRoundSelection(selectedRecipientIds);
  }, [selectedRecipientIds, selectionHydrated]);

  async function openPreflightForSelection() {
    if (selectedRecipientIds.length === 0) {
      setPreflightError("Select at least one eligible recipient before running preflight.");
      return;
    }

    setPreflightBusy(true);
    setPreflightError("");
    try {
      const response = await createBatch({
        selected_recipient_ids: selectedRecipientIds,
        label: "CareCall selected daily round",
        call_date: "2026-08-01",
      });
      storeRoundSelection(selectedRecipientIds);
      window.location.href = `/dashboard/preflight?batch_id=${encodeURIComponent(response.batch.id)}`;
    } catch (error) {
      logTechnicalError("Failed to create selected preflight batch.", error);
      setPreflightError(SERVICE_SUPPORT_ERROR);
      setPreflightBusy(false);
    }
  }

  return (
    <AppShell
      active="operator"
      operatorName={operatorName}
      urgentCallbackCount={urgentCallbackOpenCount(data.callback_requests ?? [])}
    >
      <div className="content">
        <header className="topbar">
          <div className="topbarTitle">
            <h1><span className="sectionAccent heard">Needs heard</span> - Operator Panel</h1>
            <p>Prepare the current CALL-E auto-call session, review safety gates, and start preflight.</p>
          </div>
          <span className="roundPill">
            <span className="dot" />
            Ready for preflight
          </span>
          <div className="topActions">
            <button
              className={preflightBusy || selectedRecipientIds.length === 0 ? "button mutedButton" : "button secondary"}
              disabled={preflightBusy || selectedRecipientIds.length === 0}
              onClick={openPreflightForSelection}
              type="button"
            >
              Run preflight
            </button>
            <button
              className={preflightBusy || selectedRecipientIds.length === 0 ? "button mutedButton" : "button"}
              disabled={preflightBusy || selectedRecipientIds.length === 0}
              onClick={openPreflightForSelection}
              type="button"
            >
              Review selected round
            </button>
          </div>
        </header>
        {preflightError && <p className="errorText" role="alert">{preflightError}</p>}

        <div className="flowBanner">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
          <div>
            <strong>Automated daily round - not one-by-one dialling.</strong>{" "}
            Coordinators prepare the list, run preflight, and start the eligible CALL-E automation queue.
            Supervised clients need review before inclusion; critical and blocked cases stay out of automation.
          </div>
        </div>

        <section className="roundControl">
          <div className="roundControlTop">
            <div className="roundMain">
              <div className="roundEyebrow">Daily round control</div>
              <h2>North morning check-in - Round RN-0801</h2>
              <p className="roundDesc">
                System validates consent, phone, care profile, suitability, and safety - then CALL-E dials the
                approved automation queue after you start the round.
              </p>
              <div className="roundPipeline">
                <div className="pipeStep done"><span className="pipeN">1</span> List ready</div>
                <span className="pipeJoin" />
                <div className="pipeStep done"><span className="pipeN">2</span> Validated</div>
                <span className="pipeJoin" />
                <div className="pipeStep current"><span className="pipeN">3</span> Preflight</div>
                <span className="pipeJoin" />
                <div className="pipeStep"><span className="pipeN">4</span> Auto-call</div>
                <span className="pipeJoin" />
                <div className="pipeStep"><span className="pipeN">5</span> Summaries & orders</div>
              </div>
            </div>
            <div className="roundSide">
              <div className="validationTitle">System validation</div>
              <div className="valList">
                <div className="valRow ok">Care records loaded <span className="valN">{data.summary.recipients}</span></div>
                <div className="valRow ok">Phone reachable <span className="valN">{data.summary.recipients}</span></div>
                <div className="valRow ok">Care profile complete <span className="valN">{data.summary.recipients}</span></div>
                <div className="valRow warn">Auto-call eligible <span className="valN">{automationReadyCount}</span></div>
                <div className="valRow warn">Needs human attention <span className="valN">{attention.length}</span></div>
                <div className="valRow ok">Excluded from automation <span className="valN">{data.summary.blocked}</span></div>
              </div>
            </div>
          </div>
          <div className="roundActions">
            <button
              className={preflightBusy || selectedRecipientIds.length === 0 ? "button mutedButton" : "button secondary"}
              disabled={preflightBusy || selectedRecipientIds.length === 0}
              onClick={openPreflightForSelection}
              type="button"
            >
              Run preflight
            </button>
            <button
              className={preflightBusy || selectedRecipientIds.length === 0 ? "button mutedButton" : "button"}
              disabled={preflightBusy || selectedRecipientIds.length === 0}
              onClick={openPreflightForSelection}
              type="button"
            >
              Review selected round
            </button>
            <button className="button mutedButton" type="button" disabled>Start from preflight</button>
            <div className="note">
              <strong>Start from preflight</strong> is available after the safety confirmations on the preflight screen.
            </div>
          </div>
        </section>

        <section className="metrics">
          {metrics.map((metric) => (
            <div className={`metric ${metric.className}`} key={metric.label}>
              <span className="metricLabel">{metric.label}</span>
              <strong className="metricValue">{metric.value}</strong>
              <span className="metricHint">{metric.hint}</span>
            </div>
          ))}
        </section>

        <RecipientCallList
          actionDisabled={preflightBusy}
          needCategoriesByRecipient={needCategoriesByRecipient}
          onRunPreflight={openPreflightForSelection}
          onSelectedRecipientIdsChange={setSelectedRecipientIds}
          recipients={data.recipients}
          selectedRecipientIds={selectedRecipientIds}
        />

        <div className="grid">
          <section className="section">
            <div className="sectionHeader">
              <div>
                <h2>Automation Queue</h2>
                <p>Eligible recipients CALL-E will call automatically after preflight start.</p>
              </div>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Route</th>
                  <th>Automation status</th>
                </tr>
              </thead>
              <tbody>
                {selectedCalls.map((call) => (
                  <tr key={call.idempotency_key}>
                    <td>{call.recipient_label}</td>
                    <td>{call.route}</td>
                    <td>
                      <span className="status ready">ready</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {selectedCalls.length === 0 && (
              <div className="emptyState">
                <h3>No recipients selected for this round</h3>
                <p>Select eligible recipients in the call list below, or use Select eligible to rebuild the automation queue.</p>
              </div>
            )}
          </section>

          <section className="section">
            <h2>Needs Human Attention</h2>
            <p>Recipients not marked auto-call eligible are excluded from batch automation.</p>
            <div className="attentionList">
              {attention.map((item) => (
                <article className="attentionItem" key={item.id}>
                  <div>
                    <strong>{item.display_name}</strong>
                    <p>{item.blocked_reasons.length > 0 ? item.blocked_reasons.join(" ") : item.notes}</p>
                  </div>
                  <span className={`status ${item.blocked ? "blocked" : "review"}`}>
                    {item.automation_status === "blocked" || item.automation_status === "manual_only" ? "Manual follow-up" : "Review handling"}
                  </span>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
