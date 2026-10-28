import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode, useMemo } from "react";
import { toast } from "sonner";
import { vi } from "vitest";
import { driftViewModel } from "../drift/drift-view-model";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { ToastHost } from "../ui/toast";
import { useTableScreen } from "../ui/use-table-screen";
import { ScreenWritesContext } from "../ui/use-write-action";
import { SelectedSkills } from "./selected-skills";

// Sonner keeps toasts in a module-global store that leaks across tests.
export const clearToasts = () => toast.dismiss();

/** A settled table screen's writes and its toast host, around a flow mounted alone. */
export function ScreenHost({ children }: { children: ReactNode }) {
  const state = useTableScreen({
    name: "Deploy-state",
    reading: false,
    settled: true,
    failure: null,
    readFailed: false,
    onReread: () => {},
    openOnArrival: null,
  });
  const writes = useMemo(
    () => ({ report: state.report, settle: state.settle }),
    [state.report, state.settle],
  );
  return (
    <ScreenWritesContext.Provider value={writes}>
      {children}
      <ToastHost />
    </ScreenWritesContext.Provider>
  );
}

const PENDING_DRIFT = driftViewModel({ data: undefined, isError: false });

export const tdd = { type: "skill" as const, name: "tdd", version: "v0.5.0" };
export const REPO = "/Users/me/project";
export const REPO_NAME = "…/me/project";

export const CONFIRM = "Remove skill";

// Opening the confirmation also fetches the preflight check, so tests filter it out.
export const removeCalls = (fetchMock: { mock: { calls: unknown[][] } }) =>
  fetchMock.mock.calls.filter(([path]) => path === "/api/deploy/remove");

export const preflightCalls = (fetchMock: { mock: { calls: unknown[][] } }) =>
  fetchMock.mock.calls.filter(
    ([path]) => path === "/api/deploy/remove/preflight",
  );

export function checkFor(warning: string | null, init: RequestInit) {
  const { target } = JSON.parse(String(init.body)) as {
    target: { kind: string };
  };
  return target.kind === "repo"
    ? { scope: "repo", warning }
    : {
        scope: "global",
        tools: [
          { tool: "claude", warning },
          { tool: "codex", warning },
        ],
      };
}

export const RECEIPT = "b".repeat(64);

export function stubFetch(
  warning: string | null,
  onRemove: () => Response | Promise<Response> = () =>
    jsonResponse(
      { removed: { type: "skill", name: "tdd", version: "v0.5.0" } },
      200,
    ),
) {
  const fetchMock = vi.fn(async (path: string, init: RequestInit) =>
    path === "/api/deploy/remove/preflight"
      ? jsonResponse(
          {
            check: checkFor(warning, init),
            receipt: RECEIPT,
          },
          200,
        )
      : onRemove(),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function renderRow({
  target = { kind: "repo", repoPath: REPO } as
    | { kind: "repo"; repoPath: string }
    | { kind: "global"; tools: string[] },
  onRemoved = vi.fn(),
  primitives = [tdd],
  name = REPO_NAME,
}: {
  target?:
    | { kind: "repo"; repoPath: string }
    | { kind: "global"; tools: string[] };
  onRemoved?: () => void;
  primitives?: (typeof tdd)[];
  /** The row's name, as the Deploy-state table shows it. */
  name?: string;
} = {}) {
  const list = (primitives: (typeof tdd)[]) => (
    <ScreenHost>
      <SelectedSkills
        row={{
          primitives,
          drift: PENDING_DRIFT,
          target: target.kind === "repo" ? { ...target, name } : target,
          wire: target.kind === "repo" ? target : { kind: "global" },
          name,
          updateName: name,
        }}
        onRemoved={onRemoved}
        headingRef={null}
      />
    </ScreenHost>
  );
  const { rerender } = renderWithQuery(list(primitives));
  const withoutTdd = () => rerender(list([]));
  return { onRemoved, withoutTdd };
}

export async function openRemoveDialog(skill = "tdd") {
  await userEvent.click(
    screen.getByRole("button", { name: `Actions for ${skill}` }),
  );
  await userEvent.click(
    await screen.findByRole("menuitem", { name: "Remove skill" }),
  );
  return screen.findByRole("dialog");
}

export { jsonResponse, screen, userEvent, within };
