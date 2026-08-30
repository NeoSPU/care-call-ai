"use client";

import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark";

const STORAGE_KEY = "carecall:theme";

function readInitialTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "dark" || stored === "light") {
    return stored;
  }

  return "light";
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    const initialTheme = readInitialTheme();
    setTheme(initialTheme);
    applyTheme(initialTheme);
  }, []);

  function selectTheme(nextTheme: ThemeMode) {
    setTheme(nextTheme);
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
  }

  return (
    <div
      aria-label="Theme selection"
      className={compact ? "themeToggle compactThemeToggle" : "themeToggle"}
      role="group"
    >
      <button
        aria-label="Switch to dark theme"
        aria-pressed={theme === "dark"}
        className={theme === "dark" ? "active" : ""}
        onClick={() => selectTheme("dark")}
        type="button"
      >
        Dark
      </button>
      <button
        aria-label="Switch to light theme"
        aria-pressed={theme === "light"}
        className={theme === "light" ? "active" : ""}
        onClick={() => selectTheme("light")}
        type="button"
      >
        Light
      </button>
    </div>
  );
}
