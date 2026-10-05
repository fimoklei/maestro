import { InlineMachineValue } from "./inline-machine-value";
import { InlineName } from "./inline-name";
import type { Copy } from "./phrase";

export function PhraseText({ copy }: { copy: Copy }) {
  if (typeof copy === "string") return copy;
  return copy.parts.map((part, index) =>
    typeof part === "string" ? (
      part
    ) : part.kind === "name" ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder.
      <InlineName key={index}>{part.text}</InlineName>
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder.
      <InlineMachineValue key={index}>{part.text}</InlineMachineValue>
    ),
  );
}
