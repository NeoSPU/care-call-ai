import type { ReactNode } from "react";

import { ThemeToggle } from "./ThemeToggle";

type PublicPageShellProps = {
  children: ReactNode;
  panelClassName?: string;
};

export function PublicPageShell({ children, panelClassName = "" }: PublicPageShellProps) {
  return (
    <main className="publicPage">
      <header className="publicTopbar" aria-label="Public page controls">
        <a className="publicBackButton" href="/">
          Back to start
        </a>
        <ThemeToggle compact />
      </header>
      <section className={`publicPanel ${panelClassName}`.trim()}>{children}</section>
    </main>
  );
}
