import { Button } from "../ui/button";
import { BrowseDialog } from "./browse-dialog";
import { useRegisterPicker } from "./use-register-picker";

// The sidebar's "register a repo" affordance (issue #163): one `+ repo` button
// that opens the browse picker in register mode, so several repos can be
// registered in one go. Since ADR-0015 this is registration's only control —
// the connect gate never registers anything. The wiring lives in
// `use-register-picker.ts`; this file owns only the button.
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
