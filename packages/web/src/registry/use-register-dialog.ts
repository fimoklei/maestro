import { useState } from "react";
import { targetLabel } from "../shell/target-label";
import { ACTIONS, doneSentence } from "../ui/busy-copy";
import { useFolderChooser } from "../ui/use-folder-chooser";
import { registerMessage } from "./repositories-copy";
import { useCheckRepo, useRegisterRepo } from "./use-registry";

// The Register repository dialog's state: the field, the after-pick check and
// the registration. A refusal belongs to the path it was given for, so an
// edit clears it and a late answer for an older path never lands.
export function useRegisterDialog({
  report,
}: {
  /** Into the screen's status region. */
  report: (write: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState("");
  const [refusal, setRefusal] = useState<{
    path: string;
    message: string;
  } | null>(null);
  const chooser = useFolderChooser();
  const check = useCheckRepo();
  const register = useRegisterRepo();

  const refuse = (sent: string) => (error: unknown) =>
    setRefusal({ path: sent, message: registerMessage(error) });

  return {
    open,
    openDialog() {
      setPath("");
      setRefusal(null);
      register.reset();
      setOpen(true);
    },
    dialogProps: {
      path,
      onPathChange: setPath,
      chooser,
      error: refusal?.path === path ? refusal.message : undefined,
      busy: register.isPending,
      onPicked(picked: string) {
        // Each pick is judged afresh; an earlier refusal is not its answer.
        setRefusal(null);
        check.mutate(picked, { onError: refuse(picked) });
      },
      onRegister() {
        const sent = path;
        report(ACTIONS.register.busy);
        register.mutate(sent, {
          onSuccess: ({ repos }) => {
            setOpen(false);
            // Realpath may have changed the stored path from the sent one.
            // The server appends, so the new entry is the last one.
            const paths = repos.map((repo) => repo.path);
            const stored = paths[paths.length - 1] ?? sent;
            report(doneSentence("register", targetLabel(stored, paths)));
          },
          onError: (error) => {
            // The refusal under the field says it.
            report("");
            refuse(sent)(error);
          },
        });
      },
      onClose() {
        if (!register.isPending) setOpen(false);
      },
    },
  };
}
