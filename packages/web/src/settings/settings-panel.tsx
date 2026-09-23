import type { ReactNode } from "react";
import { Panel } from "../ui/panel";

// A Settings page (#995): the panel with band 1 only, holding one centred
// column of sections at most 640px wide.
export function SettingsPanel({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <Panel title={title}>
      <div className="mx-auto flex max-w-[640px] flex-col gap-section px-cell py-panel sidebar:px-panel sidebar:py-page">
        {children}
      </div>
    </Panel>
  );
}
