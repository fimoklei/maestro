import { useState } from "react";
import { targetLabel } from "../shell/target-label";
import { useFolderChooser } from "../ui/use-folder-chooser";
import { useWriteAction } from "../ui/use-write-action";
import { registerMessage } from "./repositories-copy";
import { useCheckRepo, useRegisterRepo } from "./use-registry";

// The Register repository dialog's state: the field, the after-pick check and
// the registration. A refusal belongs to the path it was given for, so an
// edit clears it and a late answer for an older path never lands.
export function useRegisterDialog({
  report,
  onAdded,
}: {
  /** Into the screen's status region. */
  report: (write: string) => void;
  /** The stored path of the new registration, for its row to take focus. */
  onAdded: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState("");
  const [refusal, setRefusal] = useState<{
    path: string;
    message: string;
  } | null>(null);
  const chooser = useFolderChooser();
  const check = useCheckRepo();
  const registerRepo = useRegisterRepo();
  const register = useWriteAction(registerRepo, {
    report,
    action: "register",
    show: "row",
    // Realpath may have changed the stored path from the sent one. The server
    // appends, so the new entry is the last one.
    name: ({ repos }, sent) => {
      const paths = repos.map((repo) => repo.path);
      return targetLabel(paths[paths.length - 1] ?? sent, paths);
    },
    // The refusal under the field says it.
    failure: () => null,
  });

  const refuse = (sent: string) => (error: unknown) =>
    setRefusal({ path: sent, message: registerMessage(error) });

  return {
    open,
    openDialog() {
      setPath("");
      setRefusal(null);
      registerRepo.reset();
      setOpen(true);
    },
    dialogProps: {
      path,
      onPathChange: setPath,
      chooser,
      error: refusal?.path === path ? refusal.message : undefined,
      phase: register.phase,
      onPicked(picked: string) {
        // Each pick is judged afresh; an earlier refusal is not its answer.
        setRefusal(null);
        check.mutate(picked, { onError: refuse(picked) });
      },
      onRegister() {
        const sent = path;
        register.run(sent, {
          onSuccess: ({ repos }) => {
            setOpen(false);
            onAdded(repos[repos.length - 1]?.path ?? sent);
          },
          onError: refuse(sent),
        });
      },
      onClose() {
        if (register.phase !== "running") setOpen(false);
      },
    },
  };
}
