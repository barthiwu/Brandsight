"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "theme";

// The "dark" class on <html> is genuinely external, mutable state (it's
// read/written directly on the DOM, not through React) that this
// component needs to both display and change — the textbook case for
// useSyncExternalStore rather than mirroring it into React state via a
// useEffect + setState on mount (which react-hooks/set-state-in-effect
// flags, and for good reason: it's an extra render pass to synchronize
// something a subscription can do directly).
let listeners: Array<() => void> = [];

function subscribe(callback: () => void) {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((listener) => listener !== callback);
  };
}

function getSnapshot(): boolean {
  return document.documentElement.classList.contains("dark");
}

// Returns null (distinct from true/false) for the server render and for
// React's first client render pass before hydration settles, so this
// component renders nothing rather than guessing an icon that might be
// wrong for a dark-mode user — the actual theme class is already applied
// pre-paint by the blocking script in layout.tsx; this is purely about
// which icon the toggle itself shows.
function getServerSnapshot(): null {
  return null;
}

function setTheme(isDark: boolean) {
  document.documentElement.classList.toggle("dark", isDark);
  try {
    localStorage.setItem(STORAGE_KEY, isDark ? "dark" : "light");
  } catch {
    // Best-effort only — a private-browsing tab or blocked storage just
    // means the choice won't survive a reload, not that toggling fails.
  }
  listeners.forEach((listener) => listener());
}

/**
 * Floating theme toggle, fixed to the bottom-right of every page (rendered
 * once from the root layout — see layout.tsx). Shows a black crescent moon
 * in light mode ("switch to dark") and an amber sun in dark mode ("switch
 * back to light").
 */
export function ThemeToggle() {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (isDark === null) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(!isDark)}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-(--color-border) bg-(--color-surface) shadow-lg transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-blue)"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function MoonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#000000"
        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 1020.354 15.354z"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="5" fill="#f59e0b" />
      <g stroke="#f59e0b" strokeWidth="2" strokeLinecap="round">
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </g>
    </svg>
  );
}
