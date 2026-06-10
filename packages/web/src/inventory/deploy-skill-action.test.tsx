import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeployStatePanel } from "../deploy-state/deploy-state-panel";
import { DeploySkillAction } from "./deploy-skill-action";

afterEach(() => {
  vi.unstubAllGlobals();
});

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const repos = [{ path: "/projects/alpha" }, { path: "/projects/beta" }];

function renderAction(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

function wrap(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>;
}

describe("DeploySkillAction", () => {
  it("deploys the skill to the chosen repo", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderAction(<DeploySkillAction skillName="tdd" repos={repos} />);

    await userEvent.selectOptions(
      screen.getByLabelText(/deploy tdd to/i),
      "/projects/beta",
    );
    await userEvent.click(screen.getByRole("button", { name: /deploy/i }));

    expect(
      await screen.findByText(/deployed tdd v0\.5\.1/i),
    ).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/deploy");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      type: "skill",
      name: "tdd",
      repoPath: "/projects/beta",
    });
  });

  it("becomes usable when registered repos arrive after the first render", async () => {
    // The registry query resolves after the inventory, so this component first
    // mounts with no repos. When they arrive it must select one, not stay
    // stuck disabled on a frozen empty choice.
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(
      wrap(<DeploySkillAction skillName="tdd" repos={[]} />),
    );
    expect(screen.getByRole("button", { name: /deploy/i })).toBeDisabled();

    rerender(
      wrap(
        <DeploySkillAction
          skillName="tdd"
          repos={[{ path: "/projects/alpha" }]}
        />,
      ),
    );

    expect(screen.getByRole("button", { name: /deploy/i })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: /deploy/i }));
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(init.body as string)).toEqual({
      type: "skill",
      name: "tdd",
      repoPath: "/projects/alpha",
    });
  });

  it("disables the deploy button when no repo is registered", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderAction(<DeploySkillAction skillName="tdd" repos={[]} />);

    expect(screen.getByRole("button", { name: /deploy/i })).toBeDisabled();
  });

  it("shows the server's error message when a deploy is refused", async () => {
    // The server crafts an actionable message per typed error (issue #15);
    // a generic "Deploy failed." would throw that guidance away.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: "local-diverged-from-tag",
              message:
                "Your local skill differs from its latest published tag. Tag and push your change first.",
            }),
            {
              status: 409,
              headers: { "content-type": "application/json" },
            },
          ),
      ),
    );
    renderAction(<DeploySkillAction skillName="tdd" repos={repos} />);

    await userEvent.click(screen.getByRole("button", { name: /deploy/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /tag and push your change/i,
    );
  });

  it("disables the deploy action while a deploy is pending", async () => {
    // Never resolves: the deploy stays pending for the rest of the test.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    renderAction(<DeploySkillAction skillName="tdd" repos={repos} />);

    await userEvent.click(screen.getByRole("button", { name: /deploy/i }));

    expect(
      await screen.findByRole("button", { name: /deploying/i }),
    ).toBeDisabled();
  });

  it("refreshes the deploy-state panel after a successful deploy", async () => {
    // fetch sequence: deploy-state (empty) → deploy → deploy-state (skill at tag).
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/deploy-state")) {
        return fetchMock.mock.calls.filter((c) =>
          String(c[0]).startsWith("/api/deploy-state"),
        ).length <= 1
          ? jsonResponse({ primitives: [], skipped: [] })
          : jsonResponse({
              primitives: [{ type: "skill", name: "tdd", version: "v0.5.1" }],
              skipped: [],
            });
      }
      return jsonResponse({
        deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderAction(
      <>
        <DeploySkillAction
          skillName="tdd"
          repos={[{ path: "/projects/alpha" }]}
        />
        <DeployStatePanel repo="/projects/alpha" />
      </>,
    );

    expect(
      await screen.findByText(/nothing deployed here/i),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /deploy/i }));

    // The panel updates without a reload: the deploy invalidated its query.
    expect(await screen.findByText("v0.5.1")).toBeInTheDocument();
  });
});
