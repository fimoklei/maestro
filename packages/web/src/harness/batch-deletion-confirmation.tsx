import { GroupedList } from "../ui/grouped-list";
import { PhraseText } from "../ui/phrase-text";
import {
  deletionsKept,
  deletionsSentence,
  PER_CHANGE_PULL_REQUEST,
} from "./propose-batch-copy";
import { type BatchItem, confirmationGroups } from "./propose-batch-view";

// The type, in spacing steps: 88px, as the release dialog sets it.
const TYPE_SLOT = [22];

// What the deletions do, then the changes grouped by their Change word.
export function BatchDeletionConfirmation({
  items,
  origin,
}: {
  items: readonly BatchItem[];
  origin: string;
}) {
  const deletions = items.filter((item) => item.change === "deletion");
  const skills = deletions.filter((item) => item.type === "skill").length;
  return (
    <div className="flex flex-col gap-cell">
      <div className="flex flex-col gap-tight text-gray-11">
        <p className="m-0 text-gray-12">
          <PhraseText copy={deletionsSentence(deletions, origin)} />
        </p>
        <p className="m-0">{PER_CHANGE_PULL_REQUEST}</p>
        {deletionsKept(skills, deletions.length - skills).map((sentence) => (
          <p key={sentence} className="m-0">
            {sentence}
          </p>
        ))}
      </div>
      <GroupedList
        groups={confirmationGroups(items)}
        checklist={null}
        slots={TYPE_SLOT}
        live={null}
      />
    </div>
  );
}
