import type {
  HarnessStage,
  HarnessStageRow,
  ReviewRequestLink,
  StageStatus,
} from "@maestro/core";

// One stage row with every field a story does not care about already settled.
export const stageRow = (
  stage: HarnessStage,
  skill: string,
  status: StageStatus,
  over: Partial<HarnessStageRow> = {},
): HarnessStageRow => ({
  stage,
  skill,
  status,
  change: "edit",
  requests: [],
  reviewers: [],
  comparison: stage === "pending-proposal" ? { kind: "default-branch" } : null,
  alsoIn: [],
  concurrentChange: false,
  waitingOn: null,
  localOnly: false,
  remoteTree: null,
  restorable: false,
  folderOnDisk: false,
  previousName: null,
  ...over,
});

export const pullRequest = (
  number: number,
  skill = "tdd",
): ReviewRequestLink => ({
  number,
  url: `https://github.com/fimoklei/agent-harness/pull/${number}`,
  headBranch: `maestro/${skill}`,
  baseBranch: "main",
  author: "fimoklei",
  byOther: false,
});
