import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { expect, vi } from "vitest";
import { createQueryClient } from "./api/query-client";
import type { HeldCategoryAdd } from "./categories/use-held-category-add";
import type { DeployedView } from "./deploy-state/deployed-view";
import * as controlLabels from "./ui/control-labels";
import { CANCEL, CLOSE } from "./ui/dialog-copy";
import type { NoticeCopy } from "./ui/notice";
import { type Copy, plainText } from "./ui/phrase";
import { ScreenWritesContext } from "./ui/use-write-action";

/** The key the theme choice persists under; index.html reads the same one. */
export const INTERFACE_THEME_STORAGE_KEY = "maestro.interface-theme";

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** The category read of a Harness with none, for a stub that answers every other read. */
export const noCategories = (input: RequestInfo | URL): Response | null =>
  String(input) === "/api/categories"
    ? jsonResponse({ categories: [], assignments: [] })
    : null;

// A fresh client per render with the cockpit's own read rules (#1037).
// Passed as `wrapper` so the provider survives `rerender`. A dialog rendered
// without its table screen reports into nothing; a screen brings its region.
/** A category add that has not run: a dialog rendered alone holds one. */
export const idleCategoryAdd: HeldCategoryAdd = {
  run: async () => null,
  pending: false,
  failed: false,
  reset: () => {},
};

export function renderWithQuery(ui: ReactNode) {
  const queryClient = createQueryClient();
  const rendered = render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <ScreenWritesContext.Provider value={ignoreWrites}>
          {children}
        </ScreenWritesContext.Provider>
      </QueryClientProvider>
    ),
  });
  // The client, so a test can re-read without moving focus to Re-read.
  return { ...rendered, queryClient };
}

const ignoreWrites = { report: () => {}, settle: () => {} };

/** Puts setTimeout on a clock `passTime` moves at once; real time moves it too. */
export function fakeTimeouts() {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout"],
    shouldAdvanceTime: true,
  });
}

/** Moves a faked clock by `ms` without waiting them out. */
export function passTime(ms: number) {
  act(() => vi.advanceTimersByTime(ms));
}

/** Hovers `element` past the 400 ms a hover card or tooltip waits to open. */
export async function hoverOpen(element: Element) {
  const ownClock = !vi.isFakeTimers();
  if (!ownClock && !("clock" in setTimeout)) {
    throw new Error("hoverOpen moves setTimeout; this test fakes Date alone.");
  }
  if (ownClock) fakeTimeouts();
  try {
    await userEvent.hover(element);
    passTime(400);
  } finally {
    if (ownClock) vi.useRealTimers();
  }
}

/** Picks a target in the bulk deploy dialog, which never chooses for the reader. */
export async function chooseDeployTarget(
  dialog: HTMLElement,
  name: string | RegExp,
) {
  await userEvent.click(
    within(dialog).getByRole("combobox", { name: "Target" }),
  );
  await userEvent.click(await screen.findByRole("option", { name }));
}

/** Opens a pane foot's ⋯, where its danger items sit (#1485). */
export async function openFootMenu(pane: HTMLElement, name: string) {
  await userEvent.click(
    within(pane).getByRole("button", { name: `Actions for ${name}` }),
  );
  return within(await screen.findByRole("menu"));
}

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

/**
 * Fails unless a blocked control states `cause` in its tooltip alone: its
 * `aria-description` reads `cause`, and it points at no text on the page.
 */
export function expectTooltipCause(
  control: HTMLElement,
  cause: string | RegExp,
): void {
  if (control.getAttribute("aria-disabled") !== "true") {
    throw new Error("The control is not blocked: no aria-disabled.");
  }
  if (control.hasAttribute("aria-describedby")) {
    throw new Error("The cause is drawn on the page: aria-describedby.");
  }
  if (!control.hasAttribute("aria-description")) {
    throw new Error("The control has no cause: no aria-description.");
  }
  expect(control).toHaveAccessibleDescription(cause);
}

/**
 * Fails unless `element`'s computed accessible description reads `text` as a
 * browser reads it. happy-dom pads a name set apart before its punctuation.
 */
export function expectDescription(element: HTMLElement, text: string): void {
  const asRead = (description: string) =>
    description.replace(/\s+(?=[.,;:!?])/g, "");
  expect(element).toHaveAccessibleDescription({
    $$typeof: Symbol.for("jest.asymmetricMatcher"),
    asymmetricMatch: (description: string) => asRead(description) === text,
    toAsymmetricMatcher: () => JSON.stringify(text),
  });
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
  ...["Deploy-state", "Skills", "Prompts", "Repositories", "Harness"].map(
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

/** Stubs ResizeObserver; every observer hears the width the returned call reports, in px. */
export function stubResizeObserver(): (px: number) => void {
  const callbacks: (() => void)[] = [];
  let width = 0;
  vi.stubGlobal(
    "ResizeObserver",
    class implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        callbacks.push(() =>
          callback(
            // A partial entry: `useWidthRem` reads `contentRect.width` alone.
            [{ contentRect: { width } } as ResizeObserverEntry],
            this,
          ),
        );
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  return (px) => {
    width = px;
    for (const each of callbacks) each();
  };
}

type ReadyView = Extract<DeployedView, { status: "ready" }>;

/** A deploy-state read that answered: nothing skipped, no single release. */
export const readyView = (
  names: string[],
  fields: Partial<Omit<ReadyView, "status" | "names">> = {},
): ReadyView => ({
  status: "ready",
  names,
  skippedCount: 0,
  attentionCount: 0,
  followsRelease: false,
  ...fields,
});
