// The Local edits block of a Global deploy that local edits held whole: one
// install writes every Global skill, so one edited copy holds them all.
import { LOCAL_EDITS } from "../deploy-state/target-status";
import { DEPLOY_AGAIN } from "../ui/control-labels";
import type { NoticeCopy } from "../ui/notice";
import { type Copy, named, namedList, phrase } from "../ui/phrase";

const deployed = (held: readonly string[]) =>
  held.length === 1
    ? phrase`${named(held[0] ?? "")}`
    : held.length === 2
      ? phrase`both skills`
      : phrase`all ${held.length} skills`;

/** `edited`: the skills whose copies hold the run; `held`: every skill it held. */
export function heldDeployNotice(input: {
  edited: readonly string[];
  held: readonly string[];
}): NoticeCopy & { items: Copy[] } {
  const { edited, held } = input;
  const waiting = held.filter((name) => !edited.includes(name));
  return {
    label: LOCAL_EDITS.word,
    message: phrase`Nothing was deployed, because ${namedList(edited)} ${edited.length === 1 ? "has" : "have"} local edits.`,
    items: [
      phrase`Select ${DEPLOY_AGAIN} to replace those edits with the latest release and deploy ${deployed(held)}.`,
    ],
    ...(waiting.length === 0
      ? {}
      : {
          detail: phrase`Global skills deploy together, so local edits to ${namedList(edited)} also prevented ${namedList(waiting)} from being deployed.`,
        }),
  };
}
