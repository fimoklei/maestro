import type { ReactNode } from "react";

// Two bands over the one region that scrolls; an empty band is not drawn (#991).

export interface PanelProps {
  /** The screen name. */
  title: string;
  /** The screen's own count or state line, beside the title. */
  meta?: ReactNode;
  /** The screen's primary action, right in band 1. */
  action?: ReactNode;
  /** Band 2's content. Omitted where the screen has none. */
  band2?: ReactNode;
  children: ReactNode;
}

export function Panel({ title, meta, action, band2, children }: PanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-control border border-edge bg-gray-1">
      <div
        data-band="1"
        className="flex h-12 shrink-0 items-center gap-inline border-edge border-b px-panel"
      >
        <h1 className="m-0 font-semibold font-ui text-gray-12 text-title tracking-title">
          {title}
        </h1>
        {meta ? <span className="text-gray-11 text-meta">{meta}</span> : null}
        {action ? (
          <div className="ml-auto flex items-center gap-inline">{action}</div>
        ) : null}
      </div>
      {band2 ? (
        <div
          data-band="2"
          className="flex h-12 shrink-0 items-center gap-inline border-edge border-b px-panel"
        >
          {band2}
        </div>
      ) : null}
      <div
        data-testid="panel-content"
        // @container-[size]: a table inside bounds itself to this region's
        // height, sized by the flex column and never by its own contents.
        className="@container-[size] min-h-0 grow overflow-y-auto"
      >
        {children}
      </div>
    </div>
  );
}
