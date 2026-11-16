// The categories pull request over HTTP, over an in-memory disk, Harness and
// GitHub.
import type {
  CategoriesProposalPreview,
  HarnessReviewRead,
  ReviewRequest,
} from "@maestro/core";
import { InMemoryHarnessGit } from "../../packages/core/src/harness/harness-git.fake";
import { InMemoryFileSystem } from "../../packages/core/src/registry/file-system.fake";
import { inMemoryApp } from "./in-memory-app";
import { proposeCategories } from "./propose-categories";
import { stubReview } from "./stub-review";

const HARNESS = "/harness";
export const FILE = ".maestro/categories.yml";
export const BRANCH = "maestro/list.categories";
export const PULL = "https://github.com/fimoklei/agent-harness/pull";

type Ref = { type: "skill" | "prompt"; name: string };

export const request = (over: Partial<ReviewRequest> = {}): ReviewRequest => ({
  number: 46,
  url: `${PULL}/46`,
  state: "open",
  draft: false,
  decision: null,
  reviewers: [],
  headOwner: "fimoklei",
  headRepo: "agent-harness",
  headBranch: BRANCH,
  headCommit: "c46",
  baseBranch: "main",
  author: "fimoklei",
  title: "Set Harness categories",
  ...over,
});

export const answered = (requests: ReviewRequest[]): HarnessReviewRead => ({
  outcome: "read",
  requests,
  complete: true,
  limit: 100,
});

export const skill = (name: string): Ref => ({ type: "skill", name });
export const prompt = (name: string): Ref => ({ type: "prompt", name });

export const world = () => {
  const env: NodeJS.ProcessEnv = {
    HOME: "/home",
    MAESTRO_HOME: "/maestro-home",
    MAESTRO_INVENTORY_PATH: HARNESS,
  };
  const fs = new InMemoryFileSystem({ directories: { [HARNESS]: HARNESS } });
  const harness = new InMemoryHarnessGit();
  const review = stubReview();
  const app = inMemoryApp({ env, fs, git: { harness }, gh: review });
  // The default branch and the latest release hold these skills; `files`
  // lands in the default-branch tip only.
  const tipHolds = (
    skills: string[],
    {
      prompts = [],
      files = {},
    }: { prompts?: string[]; files?: Record<string, string> } = {},
  ) => {
    harness.commit(
      "tip",
      Object.fromEntries(skills.map((name) => [name, `# ${name}\n`])),
      {
        prompts: Object.fromEntries(
          prompts.map((name) => [name, `# ${name}\n`]),
        ),
        files,
      },
    );
    harness.tip = "tip";
    harness.head = "tip";
    harness.tags = [{ name: "v1.0.0", commit: "tip" }];
  };
  const post = (path: string, body: unknown) =>
    app.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const own = async (
    names: string[],
    assignments: (Ref & { category: string })[] = [],
  ) => {
    for (const name of names) await post("/api/categories", { name });
    for (const { category, ...item } of assignments) {
      await post("/api/categories/assign", { items: [item], category });
    }
  };
  // Imported into the Working harness on disk, not on the default branch.
  const draft = async ({ type, name }: Ref) => {
    const dir = `${HARNESS}/${type === "skill" ? ".apm/skills" : ".maestro/prompts"}`;
    await fs.ensureDir(dir);
    if (type === "skill") await fs.ensureDir(`${dir}/${name}`);
    else await fs.writeFile(`${dir}/${name}.md`, `# ${name}\n`);
  };
  const row = async () => {
    const res = await app.request("/api/categories/proposal");
    return { status: res.status, body: await res.json() };
  };
  const preview = async () => {
    const res = await app.request("/api/categories/proposal/preview");
    return { status: res.status, body: await res.json() };
  };
  // As the dialog confirms: the preview it read, or the one it showed earlier.
  const submit = async (previewed?: CategoriesProposalPreview["kind"]) => {
    const res =
      previewed === undefined
        ? await proposeCategories(app)
        : await post("/api/categories/proposal", { previewed });
    return { status: res.status, body: await res.json() };
  };
  return { harness, review, tipHolds, own, draft, row, preview, submit };
};
