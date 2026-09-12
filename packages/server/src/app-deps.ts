import type {
  BrowseFilesystem,
  ConnectInventory,
  DeleteLocalSkill,
  DeploySkill,
  GlobalDeployStateReader,
  ImportSkill,
  InventoryReader,
  PromoteSkill,
  PromoteSkillDeletion,
  ProposalActions,
  PublishRelease,
  ReadDrift,
  ReadHarnessState,
  Registry,
  RemoveDeployedSkill,
  RestoreSkill,
  RetryTargetOperation,
  ScaffoldHarness,
} from "@maestro/core";

// Built from injected dependencies so routes are testable in isolation
// (tests/integration). Production uses realDeps() in app.ts.
export type AppDeps = {
  registry: Registry;
  inventory: InventoryReader;
  harness: ReadHarnessState;
  importSkill: ImportSkill;
  publish: PublishRelease;
  promote: PromoteSkill;
  promoteDeletion: PromoteSkillDeletion;
  // The one Harness mutation that never reaches GitHub (#798).
  deleteLocalSkill: DeleteLocalSkill;
  // The other one: putting a deleted skill folder back from local HEAD (#888).
  restoreSkill: RestoreSkill;
  proposals: ProposalActions;
  connect: ConnectInventory;
  scaffold: ScaffoldHarness;
  browse: BrowseFilesystem;
  // Serves both per-repo and global routes, so tool presence is required —
  // omitting it is a compile error here, not a 500 discovered later (#187).
  deployState: GlobalDeployStateReader;
  deploy: DeploySkill;
  remove: RemoveDeployedSkill;
  // The one way out of a Deploy or Remove that never finished (#951).
  retryOperation: RetryTargetOperation;
  drift: ReadDrift;
  // Tests inject a sandbox so the real ~/.apm is never touched (apm-driver.md).
  resolveGlobalRoot: () => string;
  // Production always enables the guard; tests construct it disabled. No
  // static bypass header.
  enforceOriginHost: boolean;
};
