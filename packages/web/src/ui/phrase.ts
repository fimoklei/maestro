// A sentence whose names and machine values render apart from the words
// around them, while a screen reader hears the sentence unchanged.

type Mark = { kind: "name" | "machine"; text: string };

export type Phrase = { readonly parts: readonly (string | Mark)[] };

/** Copy a visible sentence carries: plain words, or a phrase with marked parts. */
export type Copy = string | Phrase;

export const named = (text: string): Mark => ({ kind: "name", text });

/** A version, tag, path, ref, hash or command. */
export const machine = (text: string): Mark => ({ kind: "machine", text });

// en-GB fixes the form to no Oxford comma, whatever locale the reader runs.
const listFormat = new Intl.ListFormat("en-GB");

/** Names joined as `a, b and c`, each one marked. */
export function namedList(names: readonly string[]): Phrase {
  return {
    parts: listFormat
      .formatToParts(names)
      .map((part) =>
        part.type === "element" ? named(part.value) : part.value,
      ),
  };
}

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
