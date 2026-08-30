"use client";

import type { CSSProperties } from "react";

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

function total(record: Record<string, number>) {
  return Object.values(record).reduce((sum, value) => sum + value, 0);
}

function percentage(value: number, denominator: number) {
  if (denominator <= 0) {
    return 0;
  }
  return Math.round((value / denominator) * 100);
}

function DashboardRing({ ready, totalRecipients }: { ready: number; totalRecipients: number }) {
  const readyPercent = percentage(ready, totalRecipients);
  return (
    <div
      aria-label={`Readiness ring: ${ready} of ${totalRecipients} recipients ready for auto-call`}
      className="dashboardRing"
      role="img"
      style={{ "--ring-value": `${readyPercent}%` } as CSSProperties}
    >
      <span>{readyPercent}%</span>
      <small>Ready</small>
    </div>
  );
}

function DistributionBar({ label: barLabel, values }: { label: string; values: Record<string, number> }) {
  const denominator = total(values);
  return (
    <div className="distributionBarBlock">
      <div className="miniChartHead">
        <h3>{barLabel}</h3>
        <span>{denominator} total</span>
      </div>
      <div aria-label={`${barLabel} distribution`} className="distributionBar" role="img">
        {entries(values).map(([key, value], index) => (
          <span
            className={`distributionSegment segment${index % 5}`}
            key={key}
            style={{ width: `${Math.max(percentage(value, denominator), value > 0 ? 5 : 0)}%` }}
            title={`${label(key)}: ${value}`}
          />
        ))}
      </div>
      <div className="chartLegend">
        {entries(values).map(([key, value], index) => (
          <span key={key}>
            <i className={`legendDot segment${index % 5}`} />
            {label(key)} {value}
          </span>
        ))}
      </div>
    </div>
  );
}

function HorizontalBars({ label: chartLabel, values }: { label: string; values: Record<string, number> }) {
  const denominator = Math.max(...Object.values(values), 1);
  return (
    <div aria-label={`${chartLabel} bar chart`} className="horizontalBars" role="img">
      {entries(values).map(([key, value], index) => (
        <div className="horizontalBarRow" key={key}>
          <span>{label(key)}</span>
          <div className="horizontalTrack">
            <i
              className={`horizontalFill segment${index % 5}`}
              style={{ width: `${Math.max(percentage(value, denominator), value > 0 ? 8 : 0)}%` }}
            />
          </div>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
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
            <h1><span className="sectionAccent seen">Care seen</span> - Dashboard</h1>
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

        <section className="section visualDashboard" aria-label="Care seen visual overview">
          <div className="sectionHeader">
            <div>
              <h2>At-a-glance Operations</h2>
              <p>Visual summary for readiness, safety distribution, care context, and current service demand.</p>
            </div>
          </div>
          <div className="visualDashboardGrid">
            <div className="visualPanel readinessPanel">
              <DashboardRing
                ready={data.summary.ready_for_auto_call}
                totalRecipients={data.summary.registered_recipients}
              />
              <div>
                <h3>Auto-call readiness</h3>
                <p>
                  {data.summary.ready_for_auto_call} ready, {data.summary.operator_control_required} need operator
                  control, {data.summary.not_allowed_for_auto_call} not allowed today.
                </p>
              </div>
            </div>
            <div className="visualPanel">
              <DistributionBar label="Safety categories" values={data.by_safety_category} />
            </div>
            <div className="visualPanel">
              <h3>Condition mix</h3>
              <HorizontalBars label="Condition mix" values={data.by_condition} />
            </div>
            <div className="visualPanel">
              <h3>Service demand</h3>
              <HorizontalBars label="Service demand" values={data.by_need_category} />
            </div>
          </div>
        </section>

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
