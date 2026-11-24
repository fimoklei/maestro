import type { ScreenWrites } from "../ui/use-write-action";
import { RegisterRepositoryDialog } from "./register-repository-dialog";
import { useRegisterFlow } from "./use-register-flow";

export function RegisterRepositoryAction(props: {
  screen: ScreenWrites;
  onAdded: (path: string) => void;
  onClose: () => void;
  registered: readonly string[];
}) {
  return <RegisterRepositoryDialog {...useRegisterFlow(props)} />;
}
