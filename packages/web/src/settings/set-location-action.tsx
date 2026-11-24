import { SetLocationDialog } from "./set-location-dialog";
import { useSetLocationFlow } from "./use-set-location-flow";

export function SetLocationAction(props: {
  current: string;
  report: (write: string) => void;
  onSet: (path: string) => void;
  onClose: () => void;
}) {
  return <SetLocationDialog {...useSetLocationFlow(props)} />;
}
