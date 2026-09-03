import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { DeployStateList } from "./deploy-state-list";

export const tdd = { type: "skill" as const, name: "tdd", version: "v0.5.0" };
export const REPO = "/Users/me/project";

// The confirmation's own control. Fixed text: the skill name left the label
// with #411, because the dialog's title already carries it. Only one dialog is
// ever open, so the label alone identifies the control.
export const CONFIRM = "Remove skill";

// The same control after a failure: the removal was already confirmed once, so
// it offers the attempt again rather than a first one (#415).
export const RETRY = "Confirm removal";

// Opening the confirmation asks the server one read-only question — what would
// this removal destroy — so a test that cares about the removal itself has to
// tell the two calls apart.
export const removeCalls = (fetchMock: { mock: { calls: unknown[][] } }) =>
  fetchMock.mock.calls.filter(([path]) => path === "/api/deploy/remove");

export const preflightCalls = (fetchMock: { mock: { calls: unknown[][] } }) =>
  fetchMock.mock.calls.filter(
    ([path]) => path === "/api/deploy/remove/preflight",
  );

// The answer the server would send for the scope this request named. The
// global arm reports the same verdict for both detected tools; which tool a
// verdict lands on is remove-skill-dialog's own test.
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

// A fetch stub that answers the pre-confirmation check and leaves everything
// else to the caller.
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
            // Shaped by the scope the request named, the way the server shapes
            // it: one aggregate answer per repo, one answer per detected tool
            // on the global scope.
            check: checkFor(warning, init),
            // Paths and token travel as one, exactly as the server sends them:
            // there is no consent for an empty set, so no token either.
            reclaim:
              reclaim.length > 0
                ? { previews: reclaim, token: "a".repeat(64) }
                : null,
            // The proof the removal itself was priced, which the confirmation
            // has to send back or the server refuses it (#458).
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
    <DeployStateList
      primitives={primitives}
      skipped={[]}
      target={target}
      onRemoved={onRemoved}
    />
  );
  const { rerender } = renderWithQuery(list(primitives));
  // The refetch that follows a landed removal, as the card sees it: the row is
  // gone from the server's answer and the list re-renders without it.
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
