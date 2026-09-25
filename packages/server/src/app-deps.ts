import type {
  ChooseFolder,
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
  UpdateTarget,
} from "@maestro/core";

export type AppDeps = {
  registry: Registry;
  inventory: InventoryReader;
  harness: ReadHarnessState;
  importSkill: ImportSkill;
  publish: PublishRelease;
  promote: PromoteSkill;
  promoteDeletion: PromoteSkillDeletion;
  deleteLocalSkill: DeleteLocalSkill;
  restoreSkill: RestoreSkill;
  proposals: ProposalActions;
  connect: ConnectInventory;
  scaffold: ScaffoldHarness;
  // Null on a platform with no chooser helper.
  folderChooser: ChooseFolder;
  // Required, so omitting it is a compile error here, not a 500 later (#187).
  deployState: GlobalDeployStateReader;
  deploy: DeploySkill;
  remove: RemoveDeployedSkill;
  update: UpdateTarget;
  retryOperation: RetryTargetOperation;
  drift: ReadDrift;
  // Tests inject a sandbox so the real ~/.apm is never touched.
  resolveGlobalRoot: () => string;
  // Production always enables the guard; tests construct it disabled.
  enforceOriginHost: boolean;
};
