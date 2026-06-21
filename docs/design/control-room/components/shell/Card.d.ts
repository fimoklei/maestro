/**
 * Outlined panel — the basic container of the cockpit. Optional mono header row.
 */
export interface CardProps {
  /** Header title (mono) — a target name like "Claude Code" or "~/dev/acme-web". Omit for a plain container. */
  title?: React.ReactNode;
  /** Target kind label shown before the title: "global" (blue) or "local" (grey). */
  kind?: "global" | "local";
  /** Right-aligned header slot — usually a <Chip> ("● in sync" / "▲ 2 drift"). */
  status?: React.ReactNode;
  /** When true the card outline warms to amber-brown to flag drift inside. Default false. */
  drift?: boolean;
  /** Add 14px inner padding around children. Default false (rows manage their own padding). */
  padded?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
