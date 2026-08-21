"use client";

import type { ReactNode } from "react";
import { useState } from "react";

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
  key: AppShellProps["active"] | "requests";
  label: string;
  href: string;
};

const navItems: NavItem[] = [
  {
    badge: null,
    group: "Operations",
    icon: "dashboard",
    key: "dashboard",
    label: "Dashboard",
    caption: "Care seen",
    href: "/dashboard",
  },
  {
    badge: null,
    group: "Operations",
    icon: "play",
    key: "operator",
    label: "Operator Panel",
    caption: "Needs heard",
    href: "/dashboard/operator",
  },
  {
    badge: "28",
    group: "Operations",
    icon: "shield",
    key: "preflight",
    label: "Round preflight",
    href: "/dashboard/preflight",
  },
  {
    badge: null,
    group: "Operations",
    icon: "users",
    key: "recipients",
    label: "Recipients",
    caption: "Recipient cards",
    href: "/dashboard/recipients",
  },
  {
    badge: "4",
    group: "Dispatch",
    icon: "printer",
    key: "orders",
    label: "Orders",
    caption: "Help delivered",
    href: "/dashboard/orders/print",
  },
  {
    badge: "0",
    group: "Dispatch",
    icon: "urgent",
    key: "urgent",
    label: "Urgent Callback",
    href: "/dashboard/urgent-callback",
  },
  {
    badge: null,
    group: "Dispatch",
    icon: "check",
    key: "requests",
    label: "Service requests",
    href: "/dashboard#requests",
  },
];

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
  const [assistantOpen, setAssistantOpen] = useState(false);
  let lastGroup = "";
  const operatorInitials = initialsFor(operatorName);

  return (
    <main className="appShell">
      <div
        aria-hidden="true"
        className={open ? "shellScrim show" : "shellScrim"}
        onClick={() => setOpen(false)}
      />
      <aside className={open ? "sidebar open" : "sidebar"}>
        <a className="brand" href="/dashboard">
          <span className="brandMark" aria-hidden="true">
            <img alt="" height="32" src="/carecall-logo.svg" width="32" />
          </span>
          <span>
            <span className="brandName">Care Call AI</span>
            <span className="brandSub">Coordinator console</span>
          </span>
        </a>
        <nav className="nav" aria-label="CareCall navigation">
          {navItems.map((item) => {
            const showGroup = item.group !== lastGroup;
            lastGroup = item.group;
            const isUrgent = item.key === "urgent";
            return (
              <div className="navGroup" key={item.label}>
                {showGroup && <span className="navLabel">{item.group}</span>}
                <a
                  className={`${active === item.key ? "navItem active" : "navItem"} ${isUrgent ? "urgentNavItem" : ""}`}
                  href={item.href}
                  onClick={() => setOpen(false)}
                >
                  <NavIcon name={item.icon} />
                  <span className="navText">
                    <span className="navTitle">{item.label}</span>
                    {item.caption && <span className="navCaption">{item.caption}</span>}
                  </span>
                  {(item.badge || isUrgent) && (
                    <span className={item.key === "orders" ? "badge readyBadge" : isUrgent ? "badge urgentBadge" : "badge"}>
                      {isUrgent ? urgentCallbackCount : item.badge}
                    </span>
                  )}
                </a>
              </div>
            );
          })}
        </nav>
        <div className="waterMark" aria-hidden="true">
          <img alt="" src="/carecall-logo.svg" />
        </div>
        <div className={active === "preflight" ? "roundHud hiddenOnPreflight" : "roundHud"} aria-label="Start calls">
          <a aria-label="Start calls" className="hudButton" href="/dashboard/preflight">
            <svg className="iconPlay" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </a>
          <div className="roundHudState">Start calls</div>
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
      <button
        aria-expanded={assistantOpen}
        aria-label="Open AI assistant"
        className="aiFab"
        onClick={() => setAssistantOpen((current) => !current)}
        type="button"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3l1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1L6.5 8.5l4.1-1.4L12 3z" />
          <path d="M19 13l.8 2.2L22 16l-2.2.8L19 19l-.8-2.2L16 16l2.2-.8L19 13z" />
          <path d="M5 14l.6 1.6L7 16l-1.4.4L5 18l-.6-1.6L3 16l1.4-.4L5 14z" />
        </svg>
      </button>
      <aside className={assistantOpen ? "aiPanel open" : "aiPanel"} aria-label="Care Call AI assistant">
        <div className="aiHead">
          <div className="aiAv" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1L6.5 8.5l4.1-1.4L12 3z" />
            </svg>
          </div>
          <div>
            <h3>Care Call AI assistant</h3>
            <p>Ready to help with the current round.</p>
          </div>
        </div>
        <div className="aiMsgs">
          <div className="msg in">
            Hi, I can help review the current round, recipient care profiles, and service requests.
          </div>
        </div>
        <div className="aiInput">
          <input aria-label="Ask Care Call AI assistant" placeholder="Ask about this round..." />
          <button aria-label="Send assistant message" className="aiSend" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 2L11 13" />
              <path d="M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        </div>
      </aside>
    </main>
  );
}
