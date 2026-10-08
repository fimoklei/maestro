import { Skeleton } from "./skeleton";
import { useReadSkeleton } from "./use-read-skeleton";

// A Status cell whose reading has not answered: busy at once, a placeholder
// past 1.3 s.
export function StatusSkeleton() {
  const { visible } = useReadSkeleton(true);
  return (
    <span aria-busy="true" className="block">
      {visible ? <Skeleton className="w-16" /> : null}
    </span>
  );
}
