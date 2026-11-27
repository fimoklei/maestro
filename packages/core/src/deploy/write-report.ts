import type { DeploySkillError } from "./deploy-skill";
import type { SupportedTool } from "./deploy-tools";
import type { PlaceReadings, SkillReading } from "./place-reading";

export type ReportSkill =
  | {
      name: string;
      state:
        | "written"
        | "already-at-release"
        | "missing"
        | "not-confirmed"
        | "removed"
        | "not-removed";
    }
  | { name: string; state: "not-updated"; stillAt: string | null }
  | { name: string; state: "refused"; reason: DeploySkillError };

export type ReportSkillState = ReportSkill["state"];

export type ReportPlace = {
  tool: SupportedTool;
  path: string | null;
  detected: boolean;
  skills: ReportSkill[];
};

export type WriteReport = {
  release: string | null;
  places: ReportPlace[];
};

export function reportWrite(input: {
  readings: PlaceReadings;
  names: readonly string[];
  wrote: ReadonlySet<string>;
  refused: ReadonlyMap<string, DeploySkillError>;
}): WriteReport {
  const { wrote, refused } = input;
  const stateOf = (reading: SkillReading): ReportSkill => {
    switch (reading.reading) {
      case "at-release":
        return {
          name: reading.name,
          state: wrote.has(reading.name) ? "written" : "already-at-release",
        };
      case "not-updated":
        return {
          name: reading.name,
          state: "not-updated",
          stillAt: reading.stillAt,
        };
      default:
        return { name: reading.name, state: reading.reading };
    }
  };
  return {
    release: input.readings.release,
    places: input.readings.places.map((place) => ({
      ...place,
      skills: place.detected
        ? input.names.flatMap((name): ReportSkill[] => {
            const reason = refused.get(name);
            if (reason !== undefined) {
              return [{ name, state: "refused", reason }];
            }
            const reading = place.skills.find((each) => each.name === name);
            return [
              reading === undefined
                ? { name, state: "not-confirmed" }
                : stateOf(reading),
            ];
          })
        : [],
    })),
  };
}

export function writtenEverywhere(report: WriteReport, name: string): boolean {
  const detected = report.places.filter((place) => place.detected);
  return (
    detected.length > 0 &&
    detected.every((place) =>
      place.skills.some(
        (skill) => skill.name === name && skill.state === "written",
      ),
    )
  );
}
