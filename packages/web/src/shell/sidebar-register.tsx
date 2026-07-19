import { Button } from "../ui/button";
import { BrowseDialog } from "./browse-dialog";
import { useRegisterPicker } from "./use-register-picker";

// The sidebar's steady-state "register a repo" affordance (issue #163): one
// `+ repo` button that opens the browse picker in register mode, so registering
// several repos in one go works past onboarding too — not only in the wizard's
// register step, which shipped it first (#151). The wiring is shared with that
// step (`use-register-picker.ts`); only the button differs.
//
// No path field here, and no list: the picker's own paste field already takes a
// hand-typed absolute path (including one outside the home directory that
// browsing cannot reach), and the Targets list above is the list — registering
// invalidates the registry query, so a registered repo shows up there by itself
// (frontend.md).
//
// Nothing about a failed repo renders here either. The picker is the surface
// for that (issue #175): at 620px it can show the full absolute paths this
// 256px column cannot.
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
