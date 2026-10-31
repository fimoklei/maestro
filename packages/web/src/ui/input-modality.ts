// The last press decides whether a focus that follows it came from the keyboard.
// Not `:focus-visible`: a test DOM matches it on every focus.
let pointerLast = false;

if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    () => {
      pointerLast = true;
    },
    true,
  );
  document.addEventListener(
    "keydown",
    () => {
      pointerLast = false;
    },
    true,
  );
}

/** Whether the latest input was a pointer press rather than a key. */
export function lastInputWasPointer(): boolean {
  return pointerLast;
}
