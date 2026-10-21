import { Copy } from "lucide-react";
import { Icon } from "../ui/icon";
import { IconButton } from "../ui/icon-button";
import { COPY_PROMPT_TEXT, PROMPT_TEXT_HEADING } from "./prompts-copy";

/** A prompt's released text, whole and as written, under its heading with a copy icon. */
export function PromptText({
  text,
  onCopy,
}: {
  text: string;
  onCopy: () => void;
}) {
  return (
    <section
      aria-label={PROMPT_TEXT_HEADING}
      className="rounded-control border border-edge bg-gray-2"
    >
      <div className="flex h-row items-center justify-between border-divider border-b pr-tight pl-cell">
        <h3 className="m-0 font-normal text-gray-11 text-meta">
          {PROMPT_TEXT_HEADING}
        </h3>
        <IconButton label={COPY_PROMPT_TEXT} variant="ghost" onClick={onCopy}>
          <Icon of={Copy} />
        </IconButton>
      </div>
      <pre className="m-0 whitespace-pre-wrap p-cell font-mono text-gray-12 text-meta [overflow-wrap:anywhere]">
        {text}
      </pre>
    </section>
  );
}
