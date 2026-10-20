import { Link } from "react-router";
import { cn } from "./cn";
import { FOCUS_RING } from "./focus-ring";
import { InlineMachineValue } from "./inline-machine-value";
import { InlineName } from "./inline-name";
import type { Copy } from "./phrase";

export function PhraseText({ copy }: { copy: Copy }) {
  if (typeof copy === "string") return copy;
  return copy.parts.map((part, index) =>
    typeof part === "string" ? (
      part
    ) : part.kind === "link" ? (
      <Link
        // biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder.
        key={index}
        to={part.to.pathname}
        state={part.to.state}
        className={cn(
          "rounded-control text-blue-11 no-underline underline-offset-2 hover:underline",
          FOCUS_RING,
        )}
      >
        {part.text}
      </Link>
    ) : part.kind === "name" ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder.
      <InlineName key={index}>{part.text}</InlineName>
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder.
      <InlineMachineValue key={index}>{part.text}</InlineMachineValue>
    ),
  );
}
