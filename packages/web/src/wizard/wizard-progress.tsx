import { cn } from "../ui/cn";

// The first-run wizard's 3-step progress strip (issue #96, design f1-empty):
// connect inventory -> register repos -> deploy. Step 2 has no screen yet
// (issue #96 builds the connect step only — "minus the register step"); it
// still lists here as an inert step so the user knows what's ahead.
const STEPS = ["connect inventory", "register repos", "deploy"] as const;

export type WizardProgressProps = {
  activeStep: 1 | 2 | 3;
};

export function WizardProgress({ activeStep }: WizardProgressProps) {
  return (
    <ol className="flex gap-2">
      {STEPS.map((label, index) => {
        const step = index + 1;
        const active = step === activeStep;
        return (
          <li
            key={label}
            aria-current={active ? "step" : undefined}
            className={cn(
              "rounded-control border px-2.5 py-1 font-mono text-tag",
              active
                ? "border-line-amber-dim bg-amber-bg text-amber-ink"
                : "border-line-chip text-dim",
            )}
          >
            {step} · {label}
          </li>
        );
      })}
    </ol>
  );
}
