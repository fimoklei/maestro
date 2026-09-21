import { Toaster, toast } from "sonner";

// Success only (ADR-0033 §6). A failure, a warning and anything with an action
// is a Notice, which stays until the reader resolves it — so this module
// exposes no other level, and none can be added at a call site.

/** Announce a success the reader may miss: a removed row, a result elsewhere. */
export function showSuccess(sentence: string): void {
  toast.success(sentence);
}

/** Mounted once, at the composition root. */
export function ToastHost() {
  return (
    <Toaster
      position="bottom-right"
      duration={5000}
      // Only what floats fades, by opacity alone (ADR-0033 §8).
      gap={8}
      icons={{
        success: (
          <span aria-hidden="true" className="font-mono text-green-11">
            ✓
          </span>
        ),
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-[360px] max-w-full items-start gap-inline rounded-control border border-green-7 bg-green-3 px-cell py-inline font-ui text-green-11 text-row shadow-float",
        },
      }}
    />
  );
}
