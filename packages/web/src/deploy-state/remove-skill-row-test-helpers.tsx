import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { ToastHost } from "../ui/toast";
import { SelectedSkills } from "./selected-skills";

// Sonner keeps toasts in a module-global store that leaks across tests.
export const clearToasts = () => toast.dismiss();

export const tdd = { type: "skill" as const, name: "tdd", version: "v0.5.0" };
export const REPO = "/Users/me/project";
export const REPO_NAME = "…/me/project";

export const CONFIRM = "Remove skill";

export const RETRY = "Confirm removal";

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
  reclaim: { tool: string; path: string }[] = [],
) {
  const fetchMock = vi.fn(async (path: string, init: RequestInit) =>
    path === "/api/deploy/remove/preflight"
      ? jsonResponse(
          {
            check: checkFor(warning, init),
            reclaim:
              reclaim.length > 0
                ? { previews: reclaim, token: "a".repeat(64) }
                : null,
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
}: {
  target?:
    | { kind: "repo"; repoPath: string }
    | { kind: "global"; tools: string[] };
  onRemoved?: () => void;
  primitives?: (typeof tdd)[];
} = {}) {
  const list = (primitives: (typeof tdd)[]) => (
    <>
      <SelectedSkills
        primitives={primitives}
        target={target}
        targetName={REPO_NAME}
        onRemoved={onRemoved}
      />
      <ToastHost />
    </>
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
