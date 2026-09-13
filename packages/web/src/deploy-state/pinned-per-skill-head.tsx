import { pinnedTagsLine, RELEASE_NOT_ADOPTED } from "./release-head-copy";
import type { PinnedPerSkill } from "./use-deploy-state";

// What a target deployed one skill at a time opens its body with, where a
// target on one release carries its Release head: the tags its skills sit on,
// then the way to one release (ADR-0031, #950).
export function PinnedPerSkillHead({ pinned }: { pinned: PinnedPerSkill }) {
  return (
    <div className="border-line-row border-b px-card-x py-row-y text-dim text-tag">
      <p>{pinnedTagsLine(pinned)}</p>
      <p>{RELEASE_NOT_ADOPTED}</p>
    </div>
  );
}
