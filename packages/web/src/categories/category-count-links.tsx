import type { HarnessPrimitiveType } from "@maestro/core";
import { Fragment } from "react";
import { inventoryPathFor } from "../inventory/inventory-views";
import { TextLink } from "../ui/text-link";
import { countInCategory, countWords, NO_ITEMS } from "./categories-copy";

// A Settings › Categories row's counts, each a link to its screen filtered to
// the row (design.md → Frame).
export function CategoryCountLinks({
  name,
  skills,
  prompts,
}: {
  name: string;
  skills: number;
  prompts: number;
}) {
  const counts = (
    [
      ["skill", skills],
      ["prompt", prompts],
    ] as const
  ).filter(([, count]) => count > 0);
  const search = `?${new URLSearchParams({ category: name })}`;
  return (
    <span className="font-ui text-gray-11 text-row">
      {counts.length === 0
        ? NO_ITEMS
        : counts.map(([type, count], index) => (
            <Fragment key={type}>
              {index > 0 ? <span aria-hidden="true"> · </span> : null}
              <CountLink
                type={type}
                count={count}
                label={countInCategory(count, type, name)}
                search={search}
              />
            </Fragment>
          ))}
    </span>
  );
}

function CountLink({
  type,
  count,
  label,
  search,
}: {
  type: HarnessPrimitiveType;
  count: number;
  label: string;
  search: string;
}) {
  return (
    <TextLink to={{ pathname: inventoryPathFor(type), search }} label={label}>
      {countWords(count, type)}
    </TextLink>
  );
}
