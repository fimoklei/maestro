import { type ReactNode, useId } from "react";

// A Settings section (#995): a heading with an optional action on its right,
// then its rows in one bordered list.

export interface SettingsSectionProps {
  title: string;
  /** The controls beside the heading, acting on the rows below it. */
  action?: ReactNode;
  /** One sentence under the heading. */
  description?: string;
  /** The rows are a list, named by the heading. */
  list?: boolean;
  /** The rows are being read again. */
  busy?: boolean;
  /** `SettingsRow`s. */
  children: ReactNode;
}

const ROWS = "flex flex-col overflow-hidden rounded-control border border-edge";

export function SettingsSection({
  title,
  action,
  description,
  list = false,
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
      <div className="flex min-h-control items-start gap-inline">
        <div className="flex min-h-control grow flex-col justify-center gap-tight">
          <h2
            id={headingId}
            className="m-0 font-semibold font-ui text-gray-12 text-heading tracking-heading"
          >
            {title}
          </h2>
          {description === undefined ? null : (
            <p className="m-0 font-ui text-gray-11 text-meta">{description}</p>
          )}
        </div>
        {action}
      </div>
      {list ? (
        <ul aria-labelledby={headingId} className={`m-0 list-none p-0 ${ROWS}`}>
          {children}
        </ul>
      ) : (
        <div className={ROWS}>{children}</div>
      )}
    </section>
  );
}
