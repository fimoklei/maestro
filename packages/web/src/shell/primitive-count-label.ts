export function primitiveCountLabel(count: number | undefined): string {
  if (count === undefined) return "Loading the count…";
  return `${count} ${count === 1 ? "primitive" : "primitives"}`;
}
