import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, sentence } from "../test-utils";
import {
  findRow,
  openPane,
  renderDeployState,
  stubServer,
} from "./deploy-state-test-helpers";
import { clearToasts } from "./remove-skill-row-test-helpers";

// A failed retry of an unfinished operation, on Deploy-state (#1363).

afterEach(() => {
  vi.unstubAllGlobals();
  clearToasts();
});

const REPO = "/Users/me/project";
const LABEL = "…/me/project";

type Kind = "deploy" | "remove" | "update";

// The server answers each retry from `answers`, in order; a 200 clears the
// pending operation, as the server does once disk agrees. A pending promise
// holds the retry.
function stubRetries(
  kind: Kind,
  answers: (() => Response | Promise<Response>)[],
) {
  let pending = true;
  const sent: unknown[] = [];
  stubServer(() => ({
    repos: [REPO],
    repo: {
      [REPO]: {
        primitives: [{ type: "skill", name: "tdd", version: "v0.3.2" }],
        skipped: [],
        ...(pending
          ? {
              pendingOperation: {
                kind,
                release: "v0.3.4",
                desired: ["tdd"],
              },
            }
          : {}),
      },
    },
    other: (url, init) => {
      if (url !== "/api/deploy/retry") throw new Error(`unexpected ${url}`);
      sent.push(JSON.parse(String(init?.body)));
      const answer = answers[sent.length - 1];
      if (answer === undefined) throw new Error("no answer left");
      return Promise.resolve(answer()).then((response) => {
        if (response.status === 200) pending = false;
        return response;
      });
    },
  }));
  return sent;
}

const failed = (error: string) => () =>
  jsonResponse({ error, message: "irrelevant" }, 502);
const completed = () =>
  jsonResponse({
    completed: { kind: "deploy", release: "v0.3.4", desired: ["tdd"] },
  });

const announced = () =>
  screen
    .getAllByRole("status")
    .find((region) => region.classList.contains("sr-only"));

describe("Deploy-state — a successful retry", () => {
  it.each([
    ["deploy", "Retry deploy", "Deployed"],
    ["remove", "Retry removal", "Removed"],
    ["update", "Retry update", "Updated"],
  ] as const)(
    "announces a retried %s from the pane with its target",
    async (kind, control, done) => {
      stubRetries(kind, [completed]);
      renderDeployState();

      const pane = await openPane(LABEL);
      await userEvent.click(
        within(pane).getByRole("button", { name: control }),
      );

      await waitFor(() =>
        expect(announced()).toHaveTextContent(`${done} ${LABEL}.`),
      );
    },
  );

  it("announces a retry from the row's menu with its target", async () => {
    stubRetries("remove", [completed]);
    renderDeployState();

    await userEvent.click(
      within(await findRow(LABEL)).getByRole("button", {
        name: `Actions for ${LABEL}`,
      }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Retry removal" }),
    );

    await waitFor(() =>
      expect(announced()).toHaveTextContent(`Removed ${LABEL}.`),
    );
  });

  // From the row's menu, the pane closed while the retry runs.
  async function retryUpdateFromMenu(filter: string | null) {
    let land = () => {};
    const held = new Promise<void>((resolve) => {
      land = resolve;
    });
    stubRetries("update", [() => held.then(completed)]);
    renderDeployState();
    await findRow(LABEL);
    if (filter !== null) {
      await userEvent.click(screen.getByRole("button", { name: /^Filter/ }));
      await userEvent.click(
        await screen.findByRole("menuitemcheckbox", { name: filter }),
      );
      await userEvent.keyboard("{Escape}");
    }
    await userEvent.click(
      within(await findRow(LABEL)).getByRole("button", {
        name: `Actions for ${LABEL}`,
      }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Retry update" }),
    );
    await userEvent.keyboard("{Escape}");
    expect(
      screen.queryByRole("complementary", { name: `${LABEL} detail` }),
    ).toBeNull();
    land();
  }

  it("says a retried update in a toast once a Filter hides its row", async () => {
    await retryUpdateFromMenu("Update incomplete");

    expect(
      await screen.findByText(sentence(`Updated ${LABEL}.`)),
    ).toBeInTheDocument();
    expect(announced()).not.toHaveTextContent(`Updated ${LABEL}.`);
  });

  it("says a retried update in the region beside its row, no toast", async () => {
    await retryUpdateFromMenu(null);

    await waitFor(() =>
      expect(announced()).toHaveTextContent(`Updated ${LABEL}.`),
    );
    expect(await findRow(LABEL)).toBeInTheDocument();
    expect(screen.getAllByText(sentence(`Updated ${LABEL}.`))).toHaveLength(1);
  });
});

describe("Deploy-state pane — a running retry", () => {
  it("keeps focus on the pressed Retry deploy, spinning under its busy label", async () => {
    stubRetries("deploy", [() => new Promise<Response>(() => {})]);
    renderDeployState();

    const pane = await openPane(LABEL);
    await userEvent.click(
      within(pane).getByRole("button", { name: "Retry deploy" }),
    );

    const pressed = await within(pane).findByRole("button", {
      name: "Deploying…",
    });
    expect(pressed).toHaveFocus();
    expect(pressed).toHaveAttribute("aria-disabled", "true");
    expect(pressed).toHaveAttribute("aria-busy", "true");
    expect(pressed).not.toBeDisabled();
  });
});

describe("Deploy-state pane — a failed retry", () => {
  it("states a failed retry in the target's pane, in place of the unfinished notice", async () => {
    stubRetries("deploy", [failed("retry-incomplete")]);
    renderDeployState();

    const pane = await openPane(LABEL);
    await userEvent.click(
      within(pane).getByRole("button", { name: "Retry deploy" }),
    );

    const notice = await within(pane).findByRole("alert");
    expect(
      within(notice).getByText("Deploy still incomplete"),
    ).toBeInTheDocument();
    expect(
      within(notice).getByText(
        sentence(
          "Part of the selection is not on disk. Select Retry deploy to deploy release v0.3.4 again.",
        ),
      ),
    ).toBeInTheDocument();
    expect(within(pane).queryByText("Deploy incomplete")).toBeNull();
    expect(
      within(pane).getAllByRole("button", { name: "Retry deploy" }),
    ).toHaveLength(1);
  });

  it("announces the failure through its notice alone", async () => {
    stubRetries("deploy", [failed("retry-failed")]);
    renderDeployState();

    const pane = await openPane(LABEL);
    await userEvent.click(
      within(pane).getByRole("button", { name: "Retry deploy" }),
    );

    await within(pane).findByRole("alert");
    expect(screen.getAllByText("Deploy outcome unknown")).toHaveLength(1);
    const regions = screen
      .getAllByRole("status")
      .filter((region) => !pane.contains(region));
    for (const region of regions) {
      expect(region).not.toHaveTextContent(/Deploying…|outcome unknown/);
    }
  });

  it("retries again from the notice, and a later successful retry clears it", async () => {
    const sent = stubRetries("deploy", [failed("retry-failed"), completed]);
    renderDeployState();

    const pane = await openPane(LABEL);
    await userEvent.click(
      within(pane).getByRole("button", { name: "Retry deploy" }),
    );
    const notice = await within(pane).findByRole("alert");
    await userEvent.click(
      within(notice).getByRole("button", { name: "Retry deploy" }),
    );

    await waitFor(() => expect(within(pane).queryByRole("alert")).toBeNull());
    expect(within(pane).queryByText("Deploy incomplete")).toBeNull();
    expect(sent).toEqual([
      { target: { kind: "repo", repoPath: REPO } },
      { target: { kind: "repo", repoPath: REPO } },
    ]);
  });

  it("states a failed retry from the row's menu in the target's pane", async () => {
    stubRetries("deploy", [failed("retry-failed")]);
    renderDeployState();

    await userEvent.click(
      within(await findRow(LABEL)).getByRole("button", {
        name: `Actions for ${LABEL}`,
      }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Retry deploy" }),
    );

    const pane = await screen.findByRole("complementary", {
      name: `${LABEL} detail`,
    });
    const notice = await within(pane).findByRole("alert");
    expect(
      within(notice).getByText("Deploy outcome unknown"),
    ).toBeInTheDocument();
  });

  it.each([
    ["remove", "Retry removal", "Removal outcome unknown"],
    ["update", "Retry update", "Update outcome unknown"],
  ] as const)(
    "states a failed retry of an unfinished %s",
    async (kind, control, label) => {
      stubRetries(kind, [failed("retry-failed")]);
      renderDeployState();

      const pane = await openPane(LABEL);
      await userEvent.click(
        within(pane).getByRole("button", { name: control }),
      );

      const notice = await within(pane).findByRole("alert");
      expect(within(notice).getByText(label)).toBeInTheDocument();
      expect(
        within(notice).getByRole("button", { name: control }),
      ).toBeInTheDocument();
    },
  );
});
