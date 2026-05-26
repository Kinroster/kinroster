import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { LocalDate } from "@/components/ui/local-date";

describe("LocalDate (server render — the hydration-safety contract)", () => {
  function getInner(html: string): string {
    const match = html.match(/>([^<]*)<\/time>/);
    return match ? match[1] : "";
  }

  it("renders the locale-neutral ISO-slice fallback during SSR", () => {
    const html = renderToString(
      <LocalDate value="2026-05-24T12:34:56.000Z" />
    );
    // The server payload MUST be locale-neutral — that's the whole
    // point. We expect the YYYY-MM-DD HH:MM slice, not anything that
    // would vary by locale.
    expect(getInner(html)).toBe("2026-05-24 12:34");
    expect(html.toLowerCase()).toContain(
      'datetime="2026-05-24t12:34:56.000z"'
    );
  });

  it("respects the date variant during SSR (YYYY-MM-DD only)", () => {
    const html = renderToString(
      <LocalDate value="2026-05-24T12:34:56.000Z" variant="date" />
    );
    expect(getInner(html)).toBe("2026-05-24");
  });

  it("uses a custom fallback during SSR when provided", () => {
    const html = renderToString(
      <LocalDate value="2026-05-24T12:34:56.000Z" fallback="—" />
    );
    expect(getInner(html)).toBe("—");
  });

  it("renders nothing on SSR when value is null", () => {
    const html = renderToString(<LocalDate value={null} />);
    expect(html).toBe("");
  });

  it("renders nothing on SSR when value is undefined", () => {
    const html = renderToString(<LocalDate value={undefined} />);
    expect(html).toBe("");
  });
});

describe("LocalDate (client render — post-mount locale formatting)", () => {
  it("swaps to a locale-formatted string after mount", async () => {
    render(<LocalDate value="2026-05-24T12:34:56.000Z" />);
    await waitFor(() => {
      const time = screen.getByText(/2026/);
      // Post-mount text differs from the ISO-slice fallback —
      // proves the useEffect ran. The exact format depends on the
      // jsdom default locale, so we don't assert characters.
      expect(time.textContent).not.toBe("2026-05-24 12:34");
    });
  });

  it("renders nothing on the client when value is null", () => {
    const { container } = render(<LocalDate value={null} />);
    expect(container.querySelector("time")).toBeNull();
  });
});
