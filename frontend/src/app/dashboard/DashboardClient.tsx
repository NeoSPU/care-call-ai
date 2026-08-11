"use client";

import { AppShell } from "../../components/AppShell";
import type { OperationsDashboardPayload } from "../../lib/types";

type DashboardClientProps = {
  data: OperationsDashboardPayload;
  operatorName: string;
};

function label(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function entries(record: Record<string, number>) {
  return Object.entries(record).sort((left, right) => right[1] - left[1]);
}

export function DashboardClient({ data, operatorName }: DashboardClientProps) {
  const metrics = [
    { className: "", hint: "All active cards", label: "Registered", value: data.summary.registered_recipients },
    { className: "accentReady", hint: "Eligible for CALL-E", label: "Ready auto-call", value: data.summary.ready_for_auto_call },
    { className: "accentReview", hint: "Needs human control", label: "Operator control", value: data.summary.operator_control_required },
    { className: "accentUrgent", hint: "Not auto-call safe", label: "Not allowed", value: data.summary.not_allowed_for_auto_call },
    { className: "", hint: "Ready to print", label: "Orders ready", value: data.summary.orders_ready },
    { className: "accentUrgent", hint: "Awaiting review", label: "Urgent callbacks", value: data.summary.urgent_callbacks },
  ];

  return (
    <AppShell active="dashboard" operatorName={operatorName} urgentCallbackCount={data.summary.urgent_callbacks}>
      <div className="content">
        <header className="topbar">
          <div className="topbarTitle">
            <h1>Care seen - Dashboard</h1>
            <p>Operational visibility across recipients, safety state, care demand, and urgent callback pressure.</p>
          </div>
          <span className="roundPill">
            <span className="dot" />
            Today / organization
          </span>
          <div className="topActions">
            <a className="button secondary" href="/dashboard/operator">Open operator panel</a>
            <a className="button" href="/dashboard/orders/print">View orders</a>
          </div>
        </header>

        <section className="metrics" aria-label="Care seen metrics">
          {metrics.map((metric) => (
            <div className={`metric ${metric.className}`} key={metric.label}>
              <span className="metricLabel">{metric.label}</span>
              <strong className="metricValue">{metric.value}</strong>
              <span className="metricHint">{metric.hint}</span>
            </div>
          ))}
        </section>

        <div className="flowBanner">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
          <div>
            <strong>Care seen. Needs heard. Help delivered.</strong>{" "}
            This dashboard is only the visibility layer. Use Operator Panel to prepare calls, and Help delivered to review and print orders.
          </div>
        </div>

        <div className="grid">
          <section className="section">
            <div className="sectionHeader">
              <div>
                <h2>Safety Categories</h2>
                <p>One source of truth for auto-call eligibility and operator routing.</p>
              </div>
            </div>
            <div className="qualityGateGrid">
              {entries(data.by_safety_category).map(([key, value]) => (
                <div className="qualityGate" key={key}>
                  <span className="qualityGateState">{value}</span>
                  <strong>{label(key)}</strong>
                  <span>Recipient cards</span>
                </div>
              ))}
            </div>
          </section>

          <section className="section">
            <div className="sectionHeader">
              <div>
                <h2>Condition Mix</h2>
                <p>Supports condition-aware scripts and routing decisions.</p>
              </div>
            </div>
            <div className="qualityGateGrid">
              {entries(data.by_condition).map(([key, value]) => (
                <div className="qualityGate" key={key}>
                  <span className="qualityGateState">{value}</span>
                  <strong>{label(key)}</strong>
                  <span>Care profiles</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="grid">
          <section className="section">
            <h2>Session Statistics</h2>
            <div className="valList">
              <div className="valRow ok">Calls planned <span className="valN">{data.session.calls_planned}</span></div>
              <div className="valRow ok">Calls completed <span className="valN">{data.session.calls_completed}</span></div>
              <div className="valRow ok">Needs captured <span className="valN">{data.session.needs_captured}</span></div>
              <div className="valRow ok">Orders generated <span className="valN">{data.session.orders_generated}</span></div>
              <div className="valRow warn">Human reviews <span className="valN">{data.session.human_reviews}</span></div>
            </div>
          </section>

          <section className="section">
            <h2>Alerts</h2>
            <div className="valList">
              <div className="valRow warn">Urgent callbacks <span className="valN">{data.alerts.urgent_callbacks}</span></div>
              <div className="valRow warn">Eligible not selected <span className="valN">{data.alerts.eligible_not_selected}</span></div>
              <div className="valRow warn">Stale approvals <span className="valN">{data.alerts.stale_approvals}</span></div>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
