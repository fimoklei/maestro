// A sentence whose names and machine values render apart from the words
// around them, while a screen reader hears the sentence unchanged.

/** A screen in the cockpit, with the router state it opens with. */
export type LinkTarget = { pathname: string; state: unknown };

type Mark =
  | { kind: "name" | "machine"; text: string }
  | { kind: "link"; text: string; to: LinkTarget };

export type Phrase = { readonly parts: readonly (string | Mark)[] };

/** Copy a visible sentence carries: plain words, or a phrase with marked parts. */
export type Copy = string | Phrase;

export const named = (text: string): Mark => ({ kind: "name", text });

/** A version, tag, path, ref, hash or command. */
export const machine = (text: string): Mark => ({ kind: "machine", text });

/** Words that open another cockpit screen; the words name the destination. */
export const link = (text: string, to: LinkTarget): Mark => ({
  kind: "link",
  text,
  to,
});

// en-GB fixes the form to no Oxford comma, whatever locale the reader runs.
const listFormat = new Intl.ListFormat("en-GB");

const markedList = (
  values: readonly string[],
  mark: (text: string) => Mark,
): Phrase => ({
  parts: listFormat
    .formatToParts(values)
    .map((part) => (part.type === "element" ? mark(part.value) : part.value)),
});

/** Names joined as `a, b and c`, each one marked. */
export const namedList = (names: readonly string[]): Phrase =>
  markedList(names, named);

/** Machine values, such as paths, joined as `a, b and c`, each one marked. */
export const machineList = (values: readonly string[]): Phrase =>
  markedList(values, machine);

export function phrase(
  strings: TemplateStringsArray,
  ...values: (string | number | Mark | Phrase)[]
): Phrase {
  const parts: (string | Mark)[] = [];
  strings.forEach((text, index) => {
    parts.push(text);
    const value = values[index];
    if (value === undefined) return;
    if (typeof value === "string" || typeof value === "number") {
      parts.push(String(value));
    } else if ("parts" in value) {
      parts.push(...value.parts);
    } else {
      parts.push(value);
    }
  });
  return { parts: parts.filter((part) => part !== "") };
}

/** The sentence as one string: for an announcement, a label or a key. */
export function plainText(copy: Copy): string {
  return typeof copy === "string"
    ? copy
    : copy.parts
        .map((part) => (typeof part === "string" ? part : part.text))
        .join("");
}
