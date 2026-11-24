import { useState } from "react";
import { repoTargetName } from "../shell/target-name";
import { useFolderChooser } from "../ui/use-folder-chooser";
import { type ScreenWrites, useWriteAction } from "../ui/use-write-action";
import { registerMessage } from "./repositories-copy";
import { useCheckRepo, useRegisterRepo } from "./use-registry";

export function useRegisterFlow({
  screen,
  onAdded,
  onClose,
  registered,
}: {
  screen: ScreenWrites;
  onAdded: (path: string) => void;
  onClose: () => void;
  registered: readonly string[];
}) {
  const addedPath = (repos: readonly { path: string }[], sent: string) =>
    repos.find((repo) => repo.path === sent)?.path ??
    repos.find((repo) => !registered.includes(repo.path))?.path ??
    sent;
  const [path, setPath] = useState("");
  const [refusal, setRefusal] = useState<{
    path: string;
    message: string;
  } | null>(null);
  const chooser = useFolderChooser();
  const check = useCheckRepo();
  const registerRepo = useRegisterRepo();
  const register = useWriteAction(registerRepo, {
    screen,
    action: "register",
    subject: ({ repos }, sent) => {
      const added = addedPath(repos, sent);
      return {
        name: repoTargetName(
          added,
          repos.map((repo) => repo.path),
        ),
        row: added,
      };
    },
    failure: () => null,
  });

  const refuse = (sent: string) => (error: unknown) =>
    setRefusal({ path: sent, message: registerMessage(error) });

  return {
    path,
    onPathChange: setPath,
    chooser,
    error: refusal?.path === path ? refusal.message : undefined,
    phase: register.phase,
    onPicked(picked: string) {
      setRefusal(null);
      check.mutate(picked, { onError: refuse(picked) });
    },
    onRegister() {
      const sent = path;
      register.run(sent, {
        onSuccess: ({ repos }) => {
          onClose();
          onAdded(addedPath(repos, sent));
        },
        onError: refuse(sent),
      });
    },
    onClose() {
      if (register.phase !== "running") onClose();
    },
  };
}
