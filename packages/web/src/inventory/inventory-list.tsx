import type { Primitive } from "./use-inventory";

// Presentational list of central skills. Empty state is explicit so a correctly
// configured but empty inventory never shows a bare, ambiguous blank.
export function InventoryList({ primitives }: { primitives: Primitive[] }) {
  if (primitives.length === 0) {
    return <p>No skills found in the inventory.</p>;
  }

  return (
    <ul>
      {primitives.map((primitive) => (
        <li key={primitive.name}>
          <strong>{primitive.name}</strong>:{" "}
          <span>{primitive.description}</span>
        </li>
      ))}
    </ul>
  );
}
