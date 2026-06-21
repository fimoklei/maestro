/**
 * Section title row: Space Grotesk title, dim mono meta, right-aligned actions.
 */
export interface SectionHeaderProps {
  /** Section title, e.g. "Central inventory". */
  title: React.ReactNode;
  /** Dim mono annotation after the title, e.g. "curated · production-ready". */
  meta?: React.ReactNode;
  /** Right-aligned actions — usually a <Button>. */
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
