import { Button } from "../ui/button";
import { BrowseDialog } from "./browse-dialog";
import { useRegisterPicker } from "./use-register-picker";

// The sidebar's "register a repo" affordance (#163), registration's only
// control since ADR-0015. Wiring lives in use-register-picker.ts; this file
// owns only the button.
export function SidebarRegister() {
  const picker = useRegisterPicker();

  return (
    <>
      <Button
        variant="dashed"
        size="sm"
        onClick={picker.openPicker}
        className="w-full"
      >
        + repo
      </Button>
      {picker.open ? <BrowseDialog {...picker.dialogProps} /> : null}
    </>
  );
}
