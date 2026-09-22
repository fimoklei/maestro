import { useId } from "react";
import { Button } from "./button";
import { Field, type FieldProps } from "./field";
import { Notice } from "./notice";
import type { FolderChooser } from "./use-folder-chooser";

export interface PathFieldProps extends Omit<FieldProps, "trailing"> {
  /** From `useFolderChooser()`; passed in so the field stays presentational. */
  chooser: FolderChooser;
  /** A folder came back from the chooser — the moment to check it. */
  onPicked?: (path: string) => void;
}

// A folder field plus **Browse**, which opens the system folder chooser on the
// folder already typed (ADR-0032). The field takes a typed or pasted path
// everywhere, so where no chooser exists the field stands alone.
export function PathField({
  chooser,
  onPicked,
  onChange,
  value,
  describedBy,
  ...rest
}: PathFieldProps) {
  const noticeId = useId();
  const hasNotice = chooser.notice !== null;

  return (
    <div className="flex flex-col gap-inline">
      <Field
        mono
        value={value}
        onChange={onChange}
        describedBy={
          [describedBy, hasNotice ? noticeId : undefined]
            .filter((each) => each !== undefined)
            .join(" ") || undefined
        }
        trailing={
          chooser.available ? (
            <Button
              variant="quiet"
              busy={chooser.busy}
              onClick={() =>
                chooser.browse(value, (path) => {
                  onChange(path);
                  onPicked?.(path);
                })
              }
            >
              Browse
            </Button>
          ) : null
        }
        {...rest}
      />
      <Notice id={noticeId} trigger="user-action" notice={chooser.notice} />
    </div>
  );
}
