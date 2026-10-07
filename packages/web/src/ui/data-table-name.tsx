import { useState } from "react";
import { Tooltip } from "./tooltip";

/** A row's name on one line; the tooltip shows it whole once it is shortened. */
export function DataTableName({ name }: { name: string }) {
  const [shortened, setShortened] = useState(false);
  const text = (
    <span
      // Measured on every render: a new name, or the tooltip's new trigger.
      ref={(element) => {
        if (element === null) return;
        const measure = () =>
          setShortened(element.scrollWidth > element.clientWidth);
        measure();
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
      }}
      className="block truncate font-medium text-gray-12"
    >
      {name}
    </span>
  );
  return shortened ? <Tooltip label={name}>{text}</Tooltip> : text;
}
