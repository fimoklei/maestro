import { comparedLine, releaseSentence } from "./release-head-copy";
import type { ReleaseHead } from "./use-deploy-state";

// The two dim lines a target card opens its body with: what the newest release
// costs this target, then when that comparison was read. A target on the latest
// release carries the read time alone (ADR-0031).
export function ReleaseHeadMeta({
  head,
  now = new Date(),
}: {
  head: ReleaseHead;
  // Injected by the tests; the card reads the wall clock.
  now?: Date;
}) {
  const sentence = releaseSentence(head);
  return (
    <div className="border-line-row border-b px-card-x py-row-y text-dim text-tag">
      {sentence ? <p>{sentence}</p> : null}
      <p>{comparedLine(head, now)}</p>
    </div>
  );
}
