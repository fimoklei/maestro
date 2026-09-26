import { type ReactNode, useId } from "react";

// A Settings section (#995): a heading with an optional action on its right,
// then its rows in one bordered list.

export interface SettingsSectionProps {
  title: string;
  /** One control beside the heading, acting on the rows below it. */
  action?: ReactNode;
  /** The rows are being read again. */
  busy?: boolean;
  /** `SettingsRow`s. */
  children: ReactNode;
}

export function SettingsSection({
  title,
  action,
  busy = false,
  children,
}: SettingsSectionProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      aria-busy={busy || undefined}
      className="flex flex-col gap-inline"
    >
      <div className="flex min-h-control items-center gap-inline">
        <h2
          id={headingId}
          className="m-0 grow font-semibold font-ui text-gray-12 text-heading tracking-heading"
        >
          {title}
        </h2>
        {action}
      </div>
      <div className="flex flex-col overflow-hidden rounded-control border border-edge">
        {children}
      </div>
    </section>
  );
}
