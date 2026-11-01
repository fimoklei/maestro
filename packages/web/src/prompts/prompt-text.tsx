import type { PromptFile, PromptPart } from "@maestro/core/prompt-file";
import { Copy } from "lucide-react";
import { useState } from "react";
import { Icon } from "../ui/icon";
import { IconButton } from "../ui/icon-button";
import { SegmentedControl } from "../ui/segmented-control";
import {
  COPY_PART_TEXT,
  PROMPT_PARTS,
  PROMPT_PARTS_LABEL,
  PROMPT_TEXT_HEADING,
} from "./prompts-copy";

/**
 * A prompt's released text, whole and as written, under its heading with a
 * copy icon for the text on show. A prompt with an example gets a switch in
 * the heading's place.
 * Mount it keyed on the prompt's name, so another prompt opens on its text.
 */
export function PromptText({
  prompt,
  onCopy,
}: {
  /** Its example is "" when the prompt has none. */
  prompt: Pick<PromptFile, PromptPart>;
  /** Copies the part on show. */
  onCopy: (part: PromptPart) => void;
}) {
  const [selected, setPart] = useState<PromptPart>("text");
  const switched = prompt.example !== "";
  const part: PromptPart = switched ? selected : "text";
  return (
    <section
      aria-label={switched ? PROMPT_PARTS_LABEL : PROMPT_TEXT_HEADING}
      className="rounded-control border border-edge bg-gray-2"
    >
      <div className="flex h-row items-center justify-between border-divider border-b pr-tight pl-cell">
        {switched ? (
          <SegmentedControl
            label={PROMPT_PARTS_LABEL}
            segments={PROMPT_PARTS}
            value={part}
            onChange={setPart}
            className="-ml-1.5"
          />
        ) : (
          <h3 className="m-0 font-normal text-gray-11 text-meta">
            {PROMPT_TEXT_HEADING}
          </h3>
        )}
        <IconButton
          label={COPY_PART_TEXT[part]}
          variant="ghost"
          onClick={() => onCopy(part)}
        >
          <Icon of={Copy} />
        </IconButton>
      </div>
      <pre className="m-0 whitespace-pre-wrap p-cell font-mono text-gray-12 text-meta [overflow-wrap:anywhere]">
        {prompt[part]}
      </pre>
    </section>
  );
}
