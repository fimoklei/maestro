import { repoTargetName } from "../shell/target-name";
import { named, phrase } from "../ui/phrase";
import { type ScreenWrites, useWriteAction } from "../ui/use-write-action";
import type { RepositoryRow } from "./repositories-columns";
import { unregisterNotice } from "./repositories-copy";
import { UnregisterDialog } from "./unregister-dialog";
import { useUnregisterRepo } from "./use-registry";

export function UnregisterRepositoryAction({
  row,
  paths,
  screen,
  onClose,
}: {
  row: RepositoryRow;
  paths: readonly string[];
  screen: ScreenWrites;
  onClose: () => void;
}) {
  const write = useWriteAction(useUnregisterRepo(), {
    screen,
    action: "unregister",
    subject: (_data, path) => ({
      name: phrase`${named(repoTargetName(path, paths))}`,
      row: path,
    }),
    failure: unregisterNotice,
  });

  return (
    <UnregisterDialog
      name={row.name}
      phase={write.phase}
      failure={write.failure}
      onConfirm={() => write.run(row.path, { onSuccess: onClose })}
      onClose={onClose}
    />
  );
}
