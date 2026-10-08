export type TableMeasurement =
  | {
      screen: string;
      viewport: number;
      detailOpen: boolean;
      tableWidth: number;
      roomWidth: number;
      /** The shown columns an open detail pane lies over, by header. */
      covered?: string[];
    }
  | { screen: string; viewport: number; rows: false }
  | { screen: string; viewport: number; paneOpened: false };

export interface TableFitReport {
  /** One sentence per table wider than its scroll container, or under an open pane. */
  failures: string[];
  /** Screens that showed no rows, so had no table to measure. */
  skipped: string[];
}

export function tableFitReport(
  measurements: TableMeasurement[],
): TableFitReport;

export function checkTableFit(input: {
  webOrigin: string;
  session: string;
}): TableFitReport & { measured: number };
