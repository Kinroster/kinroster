"use client";

import { useEffect, useState } from "react";

// Hydration-safe date renderer.
//
// `new Date(x).toLocaleString()` without an explicit locale uses the
// host's default — Node on Vercel defaults to en-US, browsers use the
// user's system locale. Even a one-character difference between the
// two ("5/24/2026" vs "24/05/2026") trips React error #418 (hydration
// mismatch, text content).
//
// We dodge it by rendering a stable server-side fallback (the ISO
// date slice — e.g. "2026-05-24") and swapping to the localized
// representation in a useEffect after mount. The cost is a single
// re-render of the date string; in exchange, no hydration warnings
// and the user still sees their preferred locale.

type Variant = "datetime" | "date";

export function LocalDate({
  value,
  variant = "datetime",
  /** Optional formatter options forwarded to toLocale*String. */
  options,
  /** Override the server fallback. Defaults to the ISO slice. */
  fallback,
  className,
}: {
  /** ISO 8601 string, Date, or null/undefined (renders nothing). */
  value: string | Date | null | undefined;
  variant?: Variant;
  options?: Intl.DateTimeFormatOptions;
  fallback?: string;
  className?: string;
}) {
  // On the server (and on the very first client render — when
  // hydration is checking equality), formatted = null so we render
  // the stable fallback. useEffect runs ONLY on the client after
  // mount, swapping in the localized string.
  const [formatted, setFormatted] = useState<string | null>(null);

  useEffect(() => {
    if (value == null) return;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return;
    // The "setState inside useEffect" warning is intentional here:
    // localized formatting MUST be deferred until after hydration
    // to avoid React error #418 (server/client text mismatch).
    // Computing it during render would re-introduce the mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFormatted(
      variant === "date"
        ? d.toLocaleDateString(undefined, options)
        : d.toLocaleString(undefined, options)
    );
  }, [value, variant, options]);

  if (value == null) return null;

  const serverFallback = (() => {
    if (fallback != null) return fallback;
    const iso = value instanceof Date ? value.toISOString() : value;
    // YYYY-MM-DD for date variant; YYYY-MM-DDTHH:MM for datetime —
    // locale-neutral, unambiguous, and shorter than the full ISO.
    if (variant === "date") return iso.slice(0, 10);
    return iso.slice(0, 16).replace("T", " ");
  })();

  return (
    <time
      className={className}
      dateTime={
        value instanceof Date ? value.toISOString() : String(value)
      }
      suppressHydrationWarning
    >
      {formatted ?? serverFallback}
    </time>
  );
}
