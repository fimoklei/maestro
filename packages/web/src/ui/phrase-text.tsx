import { InlineMachineValue } from "./inline-machine-value";
import { InlineName } from "./inline-name";
import type { Copy } from "./phrase";
import { TextLink } from "./text-link";

export function PhraseText({ copy }: { copy: Copy }) {
  if (typeof copy === "string") return copy;
  return copy.parts.map((part, index) =>
    typeof part === "string" ? (
      part
    ) : part.kind === "link" ? (
      <TextLink
        // biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder.
        key={index}
        to={part.to.pathname}
        state={part.to.state}
      >
        {part.text}
      </TextLink>
    ) : part.kind === "name" ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder.
      <InlineName key={index}>{part.text}</InlineName>
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder.
      <InlineMachineValue key={index}>{part.text}</InlineMachineValue>
    ),
  );
}
