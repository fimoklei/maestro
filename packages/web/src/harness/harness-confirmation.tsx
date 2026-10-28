import type { HarnessPrimitiveType } from "@maestro/core";
import { type ComponentProps, useId } from "react";
import type { ActionKey } from "../ui/busy-copy";
import { Card } from "../ui/card";
import { Dialog } from "../ui/dialog";
import { Fact } from "../ui/fact";
import { Notice, type NoticeContent } from "../ui/notice";
import type { Copy } from "../ui/phrase";
import { PhraseText } from "../ui/phrase-text";
import { StatusLine } from "../ui/status-line";
import { ITEM_WORDS } from "./item-words";

/** A fact the card shows after the item's own name. */
type ConfirmationFact = Omit<ComponentProps<typeof Fact>, "wrap">;

/** The danger action a Harness confirmation runs. */
type ConfirmationAction = {
  label: string;
  /** Picks the busy label from `busy-copy`. */
  verb: ActionKey;
  /** Why it cannot run, beyond a check under way; `null` when it can. */
  unavailable: string | null;
  run: () => void;
};

/** The one layout every Harness confirmation shares. */
export function HarnessConfirmation({
  type,
  name,
  title,
  action,
  running,
  failure,
  changes,
  stays,
  facts,
  checking,
  loadNotice,
  onClose,
}: {
  type: HarnessPrimitiveType;
  name: string;
  title: string;
  action: ConfirmationAction;
  running: boolean;
  failure: NoticeContent | null;
  changes: Copy | null;
  stays: Copy | null;
  facts: readonly ConfirmationFact[];
  checking: string | null;
  loadNotice: NoticeContent | null;
  onClose: () => void;
}) {
  const changesId = useId();
  const noticeId = useId();
  return (
    <Dialog
      title={title}
      version={null}
      width={480}
      phase={running ? "running" : "idle"}
      action={{
        label: action.label,
        verb: action.verb,
        tone: "danger",
        unavailable: checking ?? action.unavailable,
        onRun: action.run,
      }}
      failure={failure}
      // The load notice says what the press does where no sentence does.
      describedBy={
        changes !== null ? changesId : loadNotice !== null ? noticeId : null
      }
      fieldsChanged={false}
      onClose={onClose}
    >
      {changes === null ? null : (
        <p className="m-0" id={changesId}>
          <PhraseText copy={changes} />
        </p>
      )}
      {stays === null ? null : (
        <p className="m-0 text-gray-11">
          <PhraseText copy={stays} />
        </p>
      )}
      <Card padded>
        <dl className="flex flex-wrap gap-x-panel gap-y-cell">
          <Fact
            label={ITEM_WORDS[type].Noun}
            value={name}
            wrap
            machine={false}
          />
          {facts.map((fact) => (
            <Fact key={fact.label} {...fact} wrap />
          ))}
        </dl>
      </Card>
      {checking === null ? null : <StatusLine>{checking}</StatusLine>}
      <Notice trigger="load" notice={loadNotice} id={noticeId} />
    </Dialog>
  );
}
