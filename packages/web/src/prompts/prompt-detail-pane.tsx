import type { InventoryPrompt } from "@maestro/core";
import {
  pendingReleaseFacts,
  pendingReleaseLine,
} from "../inventory/pending-release-copy";
import { TYPE_WORD } from "../inventory/type-filter";
import { LATEST_RELEASE_FACT, NOT_RELEASED_YET } from "../ui/band-copy";
import { DetailPane, type PaneNotice } from "../ui/detail-pane";
import type { FootItem } from "../ui/foot-actions";
import type { NoticeContent } from "../ui/notice";
import { PromptText } from "./prompt-text";
import { NOT_COPIED, nameNotValidNotice, PATH_FACT } from "./prompts-copy";

// Facts, the description, the findings, then the text to copy. Copy prompt
// leads the ⋮ order, so it is the pane's primary.
export function PromptDetailPane({
  prompt,
  latestRelease,
  copyRefused,
  readRefusal,
  onCopy,
  footItems,
  position,
  onPage,
  initialFocus,
  onClose,
  getTriggerElement,
}: {
  prompt: InventoryPrompt;
  /** The Harness's latest release: null where none exists, undefined until read. */
  latestRelease: string | null | undefined;
  /** The last Copy prompt of this prompt was refused by the browser. */
  copyRefused: boolean;
  /** Why the last Edit prompt of this prompt opened no dialog. */
  readRefusal: NoticeContent | null;
  onCopy: () => void;
  /** The row's ⋮ items, Copy prompt first. */
  footItems: readonly FootItem[];
  position?: { index: number; count: number } | null;
  onPage?: (step: -1 | 1) => void;
  initialFocus?: string | null;
  onClose: () => void;
  getTriggerElement: (name: string) => HTMLElement | null;
}) {
  const notices: PaneNotice[] = [
    ...(prompt.nameValid
      ? []
      : [
          {
            content: { level: "warning", ...nameNotValidNotice(prompt.name) },
            trigger: "load",
          } satisfies PaneNotice,
        ]),
    ...(copyRefused
      ? [
          {
            content: { level: "error", ...NOT_COPIED },
            trigger: "user-action",
          } satisfies PaneNotice,
        ]
      : []),
    ...(readRefusal === null
      ? []
      : [
          { content: readRefusal, trigger: "user-action" } satisfies PaneNotice,
        ]),
  ];
  const pending = prompt.pendingRelease;
  return (
    <DetailPane
      title={prompt.name}
      activeKey={prompt.name}
      position={position}
      onPage={onPage}
      initialFocus={initialFocus}
      onClose={onClose}
      getTriggerElement={getTriggerElement}
      facts={[
        { label: "Type", value: TYPE_WORD[prompt.type] },
        ...(pending === null ? [] : pendingReleaseFacts(pending)),
        latestRelease === undefined
          ? null
          : {
              label: LATEST_RELEASE_FACT,
              value: latestRelease ?? NOT_RELEASED_YET,
              machine: latestRelease !== null,
            },
        {
          label: PATH_FACT,
          value: prompt.path,
          machine: true,
          fullValue: prompt.path,
        },
      ]}
      paragraph={[
        ...(pending === null ? [] : [pendingReleaseLine(prompt, pending)]),
        ...(prompt.description === "" ? [] : [prompt.description]),
      ]}
      clampParagraph
      notices={notices}
      subList={<PromptText text={prompt.text} onCopy={onCopy} />}
      foot={footItems}
      leadsWithNextStep
    />
  );
}
