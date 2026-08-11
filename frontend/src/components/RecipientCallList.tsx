"use client";

import { useMemo, useState } from "react";

import type { RecipientCardDto, SafetyCategory } from "../lib/types";
import { EMPTY_SERVICE_DATA_HINT } from "../lib/user-messages";

const safetyRank: Record<SafetyCategory | "blocked", number> = {
  critical: 0,
  blocked: 1,
  special_handling: 2,
  non_critical: 3,
};

const safetyLabels: Record<SafetyCategory | "blocked", string> = {
  critical: "Critical",
  blocked: "Blocked",
  special_handling: "Special handling",
  non_critical: "Non-critical",
};

type RecipientCallListProps = {
  actionDisabled?: boolean;
  needCategoriesByRecipient?: Record<string, string[]>;
  onRunPreflight?: () => void;
  onSelectedRecipientIdsChange?: (ids: string[]) => void;
  recipients: RecipientCardDto[];
  selectedRecipientIds?: string[];
};

function displaySafety(recipient: RecipientCardDto): SafetyCategory | "blocked" {
  return recipient.blocked ? "blocked" : recipient.safety_category;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function canAutoCall(recipient: RecipientCardDto) {
  return recipient.automation_eligible;
}

function eligibilityLabel(recipient: RecipientCardDto) {
  if (recipient.automation_status === "blocked") {
    return "Blocked";
  }
  if (recipient.automation_status === "manual_only") {
    return "Manual only";
  }
  if (recipient.automation_status === "operator_review" || recipient.automation_status === "operator_only") {
    return "Operator-only";
  }
  return "Auto-call";
}

function humanize(value: string | undefined) {
  if (!value) {
    return "-";
  }
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function needLabel(category: string) {
  const normalized = category.toLowerCase();
  if (["food", "groceries", "grocery", "meal", "meals"].includes(normalized)) {
    return "Food";
  }
  if (["medicine", "medication", "pharmacy", "prescription"].includes(normalized)) {
    return "Medicine";
  }
  if (["care", "companionship", "welfare", "check_in", "check-in"].includes(normalized)) {
    return "Care";
  }
  if (["services", "service", "transport", "cleaning", "repair", "documents", "medical_visit"].includes(normalized)) {
    return "Services";
  }
  return humanize(category);
}

function safetyClass(safety: SafetyCategory | "blocked") {
  if (safety === "non_critical") {
    return "safety safetyNoncritical";
  }
  if (safety === "special_handling") {
    return "safety safetySpecial";
  }
  if (safety === "critical") {
    return "safety safetyCritical";
  }
  return "safety safetyBlocked";
}

function rowClass(recipient: RecipientCardDto) {
  const safety = displaySafety(recipient);
  if (safety === "critical") {
    return "rowCritical rowExcluded";
  }
  if (safety === "special_handling") {
    return "rowSpecial rowExcluded";
  }
  if (safety === "blocked") {
    return "rowBlocked rowExcluded";
  }
  return "rowNoncritical";
}

function sortRecipients(items: RecipientCardDto[], sortMode: "criticality" | "name" | "area") {
  return [...items].sort((left, right) => {
    if (sortMode === "criticality") {
      const safety = safetyRank[displaySafety(left)] - safetyRank[displaySafety(right)];
      if (safety !== 0) {
        return safety;
      }
    }
    if (sortMode === "area") {
      const area = left.delivery_area.localeCompare(right.delivery_area);
      if (area !== 0) {
        return area;
      }
    }
    return left.display_name.localeCompare(right.display_name);
  });
}

export function RecipientCallList({
  actionDisabled = false,
  needCategoriesByRecipient = {},
  onRunPreflight,
  onSelectedRecipientIdsChange,
  recipients,
  selectedRecipientIds = [],
}: RecipientCallListProps) {
  const [sortMode, setSortMode] = useState<"criticality" | "name" | "area">("criticality");
  const [groupByArea, setGroupByArea] = useState(true);

  const sortedRecipients = useMemo(() => sortRecipients(recipients, sortMode), [recipients, sortMode]);
  const groups = useMemo(() => {
    if (!groupByArea) {
      return [{ title: "All delivery areas", recipients: sortedRecipients }];
    }

    return sortedRecipients.reduce<Array<{ title: string; recipients: RecipientCardDto[] }>>((acc, recipient) => {
      const group = acc.find((item) => item.title === recipient.delivery_area);
      if (group) {
        group.recipients.push(recipient);
      } else {
        acc.push({ title: recipient.delivery_area, recipients: [recipient] });
      }
      return acc;
    }, []);
  }, [groupByArea, sortedRecipients]);

  const selectedIds = useMemo(
    () =>
      recipients
        .filter((recipient) => selectedRecipientIds.includes(recipient.id) && canAutoCall(recipient))
        .map((recipient) => recipient.id),
    [recipients, selectedRecipientIds],
  );
  const selectedCount = selectedIds.length;
  const eligibleCount = recipients.filter(canAutoCall).length;
  const visibleEligibleIds = sortedRecipients.filter(canAutoCall).map((recipient) => recipient.id);
  const allVisibleEligibleSelected =
    visibleEligibleIds.length > 0 && visibleEligibleIds.every((id) => selectedIds.includes(id));

  const setVisibleEligible = (checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...selectedIds, ...visibleEligibleIds]))
      : selectedIds.filter((id) => !visibleEligibleIds.includes(id));
    onSelectedRecipientIdsChange?.(next);
  };

  const toggleRecipient = (recipientId: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...selectedIds, recipientId]))
      : selectedIds.filter((id) => id !== recipientId);
    onSelectedRecipientIdsChange?.(next);
  };

  return (
    <section className="section recipientListSection" id="call-list">
      <div className="sectionHead">
        <h2>Recipient call list</h2>
        <span className="count">{recipients.length} on list</span>
        {onRunPreflight ? (
          <button
            className={actionDisabled || selectedIds.length === 0 ? "button buttonSmall mutedButton" : "button buttonSmall secondary"}
            disabled={actionDisabled || selectedIds.length === 0}
            onClick={onRunPreflight}
            type="button"
          >
            Run preflight on selection
          </button>
        ) : (
          <a className="button buttonSmall secondary" href="/dashboard/preflight">Run preflight on selection</a>
        )}
      </div>
      <p className="sectionSub">Operator-managed list for this round. Tick non-critical recipients to include in the automated CALL-E batch. Critical, blocked, and special handling stay under human control unless you explicitly review them.</p>
      <div className="callListToolbar" aria-label="Recipient list controls">
        <span className="tbLabel">Sort</span>
        <label>
          <span className="srOnly">Sort beneficiary call list</span>
            <select
              aria-label="Sort beneficiary call list"
              onChange={(event) => setSortMode(event.target.value as "criticality" | "name" | "area")}
              value={sortMode}
            >
              <option value="criticality">By criticality</option>
              <option value="area">By delivery area</option>
              <option value="name">By name</option>
            </select>
        </label>
        <span className="tbSep" />
        <span className="tbLabel">Group</span>
        <label className="toggleControl compact">
            <input
              checked={groupByArea}
              onChange={(event) => setGroupByArea(event.target.checked)}
              type="checkbox"
            />
            Group by delivery area
        </label>
        <span className="tbSep" />
        <span className="tbLabel">Show</span>
        <div className="filters">
          <button className="chip active" type="button">All</button>
          <button className="chip" type="button">Critical</button>
          <button className="chip" type="button">Special</button>
          <button className="chip" type="button">Blocked</button>
          <button className="chip" type="button">Non-critical</button>
        </div>
        <label className="toggleControl compact">
            <input
              aria-label="Select all eligible for auto-call"
              checked={allVisibleEligibleSelected}
              disabled={eligibleCount === 0}
              onChange={(event) => setVisibleEligible(event.target.checked)}
              type="checkbox"
            />
            Select eligible
        </label>
        <div className="tbCount">Auto-call selected: <strong>{selectedCount}</strong> / {eligibleCount}</div>
      </div>

      {recipients.length === 0 && (
        <div className="emptyState">
          <h3>No recipients ready for this view</h3>
          <p>{EMPTY_SERVICE_DATA_HINT}</p>
        </div>
      )}

      {groups.map((group) => (
        <div className="recipientGroup" key={group.title}>
          <h3 className="groupHeader">{group.title} <span>{group.recipients.length}</span></h3>
          <div className="tableScroll">
            <table className="table recipientTable">
              <thead>
                <tr>
                  <th>Call</th>
                  <th>Name</th>
                  <th>Safety</th>
                  <th>Condition</th>
                  <th>Needs</th>
                  <th>Address</th>
                  <th>Phone</th>
                  <th>Card</th>
                </tr>
              </thead>
              <tbody>
                {group.recipients.map((recipient) => {
                  const disabled = !canAutoCall(recipient);
                  const safety = displaySafety(recipient);
                  const needCategories =
                    recipient.need_categories && recipient.need_categories.length > 0
                      ? recipient.need_categories
                      : needCategoriesByRecipient[recipient.id] ?? ["No active order"];
                  return (
                    <tr className={rowClass(recipient)} key={recipient.id}>
                      <td className="tdCheck">
                        <input
                          className="autoCheck"
                          aria-label={`Include ${recipient.display_name} in auto-call`}
                          checked={selectedIds.includes(recipient.id)}
                          disabled={disabled}
                          onChange={(event) => toggleRecipient(recipient.id, event.target.checked)}
                          type="checkbox"
                        />
                        <span className="autoOffLabel">
                          {eligibilityLabel(recipient)}
                        </span>
                      </td>
                      <td>
                        <div className="person">
                          <span className="personAv">{initials(recipient.display_name)}</span>
                          <span>
                            <strong className="personName">{recipient.display_name}</strong>
                            <span className="personId">{recipient.id}</span>
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={safetyClass(safety)}>
                          {safetyLabels[safety]}
                        </span>
                      </td>
                      <td className="condCell">{humanize(recipient.condition)} <span className="sev">- {humanize(recipient.severity)}</span></td>
                      <td>
                        <div className="needPills">
                          {needCategories.map((category) => (
                            <span className="needPill" key={category}>
                              {needLabel(category)}
                            </span>
                          ))}
                        </div>
                        {recipient.blocked_reasons.length > 0 && (
                          <p className="muted">{recipient.blocked_reasons.join(" ")}</p>
                        )}
                      </td>
                      <td className="addrCell">
                        <span className="area">{recipient.delivery_area}</span>
                        <span className="street">{recipient.address}</span>
                      </td>
                      <td className="mono">{recipient.masked_phone}</td>
                      <td>
                        <a className="linkOpen" href={`/dashboard/recipients/${recipient.id}`}>
                          Open card
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}
