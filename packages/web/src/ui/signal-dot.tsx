import { cn } from "./cn";
import { STATUS_TOKENS } from "./status-family";

// A neutral dot without a word, beside a control's label: something waits
// behind it. The control names `id` in `aria-describedby`, so a screen reader
// hears the text as its description and the label stays its name.
export function SignalDot({ id, text }: { id: string; text: string }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "size-2 flex-none rounded-full",
          STATUS_TOKENS.neutral.dot,
        )}
      />
      <span id={id} hidden>
        {text}
      </span>
    </>
  );
}
