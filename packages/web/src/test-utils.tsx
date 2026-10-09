import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { createQueryClient } from "./api/query-client";
import * as controlLabels from "./ui/control-labels";
import { CANCEL, CLOSE } from "./ui/dialog-copy";
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
  const rendered = render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <ScreenReportContext.Provider value={ignoreReport}>
          {children}
        </ScreenReportContext.Provider>
      </QueryClientProvider>
    ),
  });
  // The client, so a test can re-read without moving focus to Re-read.
  return { ...rendered, queryClient };
}

const ignoreReport = () => {};

/** The element a query found, or a failed test where it found none. */
export function htmlElement(element: Element | null | undefined): HTMLElement {
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Expected an HTML element, found ${String(element)}.`);
  }
  return element;
}

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

const NAMED_CONTROLS = [
  ...Object.values(controlLabels).flatMap((label) =>
    typeof label === "string" ? [label] : [],
  ),
  CANCEL,
  CLOSE,
  ...["Deploy-state", "Inventory", "Repositories", "Harness"].map(
    controlLabels.rereadLabel,
  ),
];

/** The shared control labels a sentence names without `select` before them. */
export const unselectedControls = (copy: Copy): string[] => {
  const text = plainText(copy);
  return NAMED_CONTROLS.filter((label) =>
    new RegExp(
      `(?<![Ss]elect )(?<![\\w-])${label.replace(/[\\^$.*+?()[\]{}|-]/g, "\\$&")}(?![\\w-])`,
    ).test(text),
  );
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
