import type { HarnessStageRow } from "@maestro/core";
import { HoverCard } from "../ui/hover-card";
import { PhraseText } from "../ui/phrase-text";
import { CHANGE_WORDS, changeSentence, type StageContext } from "./stage-copy";

// The Change cell (#1399). Its card opens to the pointer only: the row the
// keyboard is on opens the Status card, which carries the same sentence.
export function ChangeCard({
  row,
  context,
}: {
  row: HarnessStageRow;
  context: StageContext;
}) {
  return (
    <HoverCard
      content={
        <p className="m-0 text-gray-12">
          <PhraseText copy={changeSentence(row, context)} />
        </p>
      }
    >
      <span className="text-gray-12">{CHANGE_WORDS[row.change]}</span>
    </HoverCard>
  );
}
