"use client";

import type { MouseEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { createBatch, getCallbackRequests } from "../lib/carecall-api";
import { readStoredRoundSelectionIds, storeRoundSelection } from "../lib/round-selection";
import {
  readUrgentCallbackCountEvent,
  urgentCallbackOpenCount,
  URGENT_CALLBACK_COUNT_EVENT,
} from "../lib/urgent-callback-events";
import { AssistantWidget } from "./AssistantWidget";
import { ThemeToggle } from "./ThemeToggle";

type AppShellProps = {
  active: "dashboard" | "operator" | "preflight" | "orders" | "recipients" | "urgent";
  children: ReactNode;
  operatorName?: string;
  urgentCallbackCount?: number;
};

type NavItem = {
  badge: string | null;
  caption?: string;
  group: string;
  icon: string;
  key: AppShellProps["active"];
  label: string;
  href: string;
};

const navItems: NavItem[] = [
  {
    badge: null,
    group: "Care seen",
    icon: "dashboard",
    key: "dashboard",
    label: "Dashboard",
    caption: "Care seen",
    href: "/dashboard",
  },
  {
    badge: null,
    group: "Needs heard",
    icon: "play",
    key: "operator",
    label: "Operator Panel",
    caption: "Needs heard",
    href: "/dashboard/operator",
  },
  {
    badge: null,
    group: "Needs heard",
    icon: "shield",
    key: "preflight",
    label: "Round preflight",
    href: "/dashboard/preflight",
  },
  {
    badge: null,
    group: "Needs heard",
    icon: "users",
    key: "recipients",
    label: "Recipients",
    caption: "Recipient cards",
    href: "/dashboard/recipients",
  },
  {
    badge: null,
    group: "Help delivered",
    icon: "printer",
    key: "orders",
    label: "Orders",
    caption: "Help delivered",
    href: "/dashboard/orders/print",
  },
  {
    badge: "0",
    group: "Help delivered",
    icon: "urgent",
    key: "urgent",
    label: "Urgent Callback",
    href: "/dashboard/urgent-callback",
  },
];

const navGroups = navItems.reduce<Array<{ group: string; items: NavItem[] }>>((groups, item) => {
  const existing = groups.find((candidate) => candidate.group === item.group);
  if (existing) {
    existing.items.push(item);
  } else {
    groups.push({ group: item.group, items: [item] });
  }
  return groups;
}, []);

function navGroupTone(group: string) {
  if (group === "Care seen") {
    return "seen";
  }
  if (group === "Needs heard") {
    return "heard";
  }
  return "delivered";
}

function NavIcon({ name }: { name: string }) {
  if (name === "dashboard") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </svg>
    );
  }
  if (name === "shield") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    );
  }
  if (name === "users") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }
  if (name === "play") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M8 5v14l11-7z" />
      </svg>
    );
  }
  if (name === "urgent") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.62a2 2 0 0 1-.45 2.11L8 9.72a16 16 0 0 0 6.28 6.28l1.27-1.27a2 2 0 0 1 2.11-.45c.84.29 1.72.5 2.62.62A2 2 0 0 1 22 16.92z" />
      </svg>
    );
  }
  if (name === "printer") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 6 2 18 2 18 9" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function initialsFor(name: string) {
  const parts = name
    .split(/[\s._-]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return "OP";
  }
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function AppShell({
  active,
  children,
  operatorName = "carecall-coordinator",
  urgentCallbackCount = 0,
}: AppShellProps) {
  const [open, setOpen] = useState(false);
  const [liveUrgentCallbackCount, setLiveUrgentCallbackCount] = useState(urgentCallbackCount);
  const [preflightNavBusy, setPreflightNavBusy] = useState(false);
  const [preflightNavMessage, setPreflightNavMessage] = useState("");
  const operatorInitials = initialsFor(operatorName);

  useEffect(() => {
    let cancelled = false;

    async function refreshUrgentCallbackCount() {
      try {
        const payload = await getCallbackRequests();
        if (!cancelled) {
          setLiveUrgentCallbackCount(urgentCallbackOpenCount(payload.callback_requests));
        }
      } catch {
        // Keep the last known badge count. Full API errors are shown on the target page.
      }
    }

    const handleUrgentCallbackCount = (event: Event) => {
      const count = readUrgentCallbackCountEvent(event);
      if (count !== null) {
        setLiveUrgentCallbackCount(count);
      }
    };

    const refreshOnVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshUrgentCallbackCount();
      }
    };

    const interval = window.setInterval(refreshUrgentCallbackCount, 15_000);
    window.addEventListener("focus", refreshUrgentCallbackCount);
    window.addEventListener(URGENT_CALLBACK_COUNT_EVENT, handleUrgentCallbackCount);
    document.addEventListener("visibilitychange", refreshOnVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshUrgentCallbackCount);
      window.removeEventListener(URGENT_CALLBACK_COUNT_EVENT, handleUrgentCallbackCount);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
    };
  }, []);

  async function openPreflightFromStoredSelection(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (preflightNavBusy) {
      return;
    }

    const selectedRecipientIds = readStoredRoundSelectionIds();
    if (selectedRecipientIds.length === 0) {
      window.location.href = "/dashboard/operator#call-list";
      return;
    }

    setPreflightNavBusy(true);
    setPreflightNavMessage("");
    try {
      const response = await createBatch({
        selected_recipient_ids: selectedRecipientIds,
        label: "CareCall selected daily round",
        call_date: "2026-08-01",
      });
      storeRoundSelection(selectedRecipientIds);
      window.location.href = `/dashboard/preflight?batch_id=${encodeURIComponent(response.batch.id)}`;
    } catch {
      setPreflightNavMessage("The service could not prepare this call round. Please open Operator Panel and try again.");
      setPreflightNavBusy(false);
    }
  }

  return (
    <main className="appShell">
      <div
        aria-hidden="true"
        className={open ? "shellScrim show" : "shellScrim"}
        onClick={() => setOpen(false)}
      />
      <aside className={open ? "sidebar open" : "sidebar"}>
        <a className="brand" href="/">
          <span className="brandMark" aria-hidden="true">
            <img alt="" height="32" src="/carecall-logo.svg" width="32" />
          </span>
          <span>
            <span className="brandName">Care Call AI</span>
            <span className="brandSub">Coordinator console</span>
          </span>
        </a>
        <nav className="nav" aria-label="CareCall navigation">
          {navGroups.map((group) => (
            <div className={`navGroup ${navGroupTone(group.group)}`} key={group.group}>
              <span className="navLabel">{group.group}</span>
              {group.items.map((item) => {
                const isUrgent = item.key === "urgent";
                return (
                  <a
                    className={`${active === item.key ? "navItem active" : "navItem"} ${isUrgent ? "urgentNavItem" : ""}`}
                    href={item.href}
                    key={item.href}
                    onClick={item.key === "preflight" ? openPreflightFromStoredSelection : () => setOpen(false)}
                  >
                    <NavIcon name={item.icon} />
                    <span className="navText">
                      <span className="navTitle">{preflightNavBusy && item.key === "preflight" ? "Preparing..." : item.label}</span>
                      {item.caption && <span className="navCaption">{item.caption}</span>}
                    </span>
                    {(item.badge || isUrgent) && (
                      <span className={item.key === "orders" ? "badge readyBadge" : isUrgent ? "badge urgentBadge" : "badge"}>
                        {isUrgent ? liveUrgentCallbackCount : item.badge}
                      </span>
                    )}
                  </a>
                );
              })}
            </div>
          ))}
        </nav>
        {preflightNavMessage ? <p className="sidebarNotice" role="alert">{preflightNavMessage}</p> : null}
        <div className="waterMark" aria-hidden="true">
          <img alt="" src="/carecall-logo.svg" />
        </div>
        <div className="sidebarFoot">
          <div className="userChip">
            <span className="avatar">{operatorInitials}</span>
            <span>
              <strong>{operatorName}</strong>
              <small>Signed-in operator</small>
            </span>
          </div>
          <form action="/api/auth/logout" method="post">
            <button className="signout logoutButton" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="mainColumn">
        <div className="appTopControls" aria-label="Page theme controls">
          <ThemeToggle compact />
        </div>
        <div className="mobileBar">
          <button
            aria-label="Open navigation"
            className="button secondary menuButton"
            onClick={() => setOpen(true)}
            type="button"
          >
            Menu
          </button>
          <img alt="" height="28" src="/carecall-logo.svg" width="28" />
          <span className="brandName">Care Call AI</span>
        </div>
        {children}
        <footer className="appFooter">
          <span>© 2026 Alex Raixon. All rights reserved.</span>
        </footer>
      </div>
      <AssistantWidget />
    </main>
  );
}
