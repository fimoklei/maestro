import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { createQueryClient } from "./api/query-client";
import type { NoticeCopy } from "./ui/notice";
import { type Copy, plainText } from "./ui/phrase";
import { ScreenReportContext } from "./ui/use-write-action";

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// A fresh client per render with the cockpit's own read rules (#1037).
// Passed as `wrapper` so the provider survives `rerender`. A dialog rendered
// without its table screen reports into nothing; a screen brings its region.
export function renderWithQuery(ui: ReactNode) {
  const queryClient = createQueryClient();
  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <ScreenReportContext.Provider value={ignoreReport}>
          {children}
        </ScreenReportContext.Provider>
      </QueryClientProvider>
    ),
  });
}

const ignoreReport = () => {};

/** A notice as read: every sentence in plain text. */
export function readNotice<T extends NoticeCopy & { items?: readonly Copy[] }>(
  notice: T | null,
) {
  if (notice === null) return null;
  return {
    ...notice,
    message: plainText(notice.message),
    ...(notice.detail === undefined
      ? {}
      : { detail: plainText(notice.detail) }),
    ...(notice.items === undefined
      ? {}
      : { items: notice.items.map(plainText) }),
  };
}

/** Matches the element whose whole text reads `text`, names set apart or not. */
export const sentence = (text: string | RegExp) => {
  const reads = (element: Element) =>
    typeof text === "string"
      ? element.textContent === text
      : text.test(element.textContent ?? "");
  return (_content: string, element: Element | null) =>
    element !== null &&
    reads(element) &&
    [...element.children].every((child) => !reads(child));
};

/** The machine values a sentence sets apart, in reading order. */
export const machineValues = (copy: Copy): string[] =>
  typeof copy === "string"
    ? []
    : copy.parts.flatMap((part) =>
        typeof part !== "string" && part.kind === "machine" ? [part.text] : [],
      );

/** Every element reports these widths; happy-dom lays nothing out. */
export function measureAs(scrollWidth: number, clientWidth: number) {
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(
    scrollWidth,
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(
    clientWidth,
  );
}
