import { describe, expect, it } from "vitest";
import { freshnessLine } from "./freshness";

const NOW = new Date("2026-08-03T12:00:00.000Z");
const minutesAgo = (minutes: number) => NOW.getTime() - minutes * 60_000;

describe("freshnessLine on a screen that tracks a read outcome", () => {
  it("says so plainly when nothing has been read yet", () => {
    expect(
      freshnessLine({ readAt: [null], outcome: null, reading: false }, NOW),
    ).toBe("Not read yet");
  });

  it("says a read is running instead of dating the last one", () => {
    expect(
      freshnessLine(
        {
          readAt: ["2026-08-03T11:56:00.000Z"],
          outcome: "fetched",
          reading: true,
        },
        NOW,
      ),
    ).toBe("Reading GitHub…");
  });

  it("dates a successful read in words, so the age reads at a glance", () => {
    expect(
      freshnessLine(
        {
          readAt: ["2026-08-03T11:56:00.000Z"],
          outcome: "fetched",
          reading: false,
        },
        NOW,
      ),
    ).toBe("Read 4 min ago");
  });

  it("reads a timestamp it cannot make sense of as no time at all", () => {
    // The config is hand-editable; a date formatter fed a bad string throws
    // and takes the whole view down (#516).
    expect(
      freshnessLine(
        { readAt: ["yesterday-ish"], outcome: "fetched", reading: false },
        NOW,
      ),
    ).toBe("Not read yet");
  });

  it("treats a read with no time recorded as no read at all", () => {
    expect(
      freshnessLine(
        { readAt: [null], outcome: "fetched", reading: false },
        NOW,
      ),
    ).toBe("Not read yet");
  });

  it("dates a read seconds old as just now", () => {
    expect(
      freshnessLine(
        {
          readAt: ["2026-08-03T11:59:40.000Z"],
          outcome: "fetched",
          reading: false,
        },
        NOW,
      ),
    ).toBe("Read just now");
  });

  it("dates a read hours old in hours", () => {
    expect(
      freshnessLine(
        {
          readAt: ["2026-08-03T09:30:00.000Z"],
          outcome: "fetched",
          reading: false,
        },
        NOW,
      ),
    ).toBe("Read 2 h ago");
  });

  it("falls back to a date once the picture is days old", () => {
    expect(
      freshnessLine(
        {
          readAt: ["2026-07-20T12:00:00.000Z"],
          outcome: "fetched",
          reading: false,
        },
        NOW,
      ),
    ).toBe("Read on 20 Jul");
  });

  it("holds offline apart from a read that failed", () => {
    const readAt = ["2026-08-03T11:00:00.000Z"];
    const offline = freshnessLine(
      { readAt, outcome: "offline", reading: false },
      NOW,
    );
    const failed = freshnessLine(
      { readAt, outcome: "fetch-failed", reading: false },
      NOW,
    );

    expect(offline).toBe("Offline — last read 1 h ago");
    expect(failed).toBe("Read failed — last read 1 h ago");
  });

  it("says never read when no read has ever succeeded", () => {
    expect(
      freshnessLine(
        { readAt: [null], outcome: "offline", reading: false },
        NOW,
      ),
    ).toBe("Offline — never read");
  });

  it("never turns a failed read into a permission verdict of ours", () => {
    // Whether GitHub lets this author in is GitHub's answer to give (#516).
    const line = freshnessLine(
      { readAt: [null], outcome: "fetch-failed", reading: false },
      NOW,
    );

    expect(line).toBe("Read failed — never read");
    expect(line).not.toMatch(/permission|denied|not allowed|access/i);
  });
});

describe("freshnessLine on a screen whose reads report failure elsewhere", () => {
  it("dates the oldest reading on the screen, not the newest", () => {
    expect(
      freshnessLine(
        {
          readAt: [minutesAgo(1), minutesAgo(4), minutesAgo(2)],
          outcome: "untracked",
          reading: false,
        },
        NOW,
      ),
    ).toBe("Read 4 min ago");
  });

  it("reads just now when every reading is under a minute old", () => {
    expect(
      freshnessLine(
        {
          readAt: [minutesAgo(0), NOW.getTime()],
          outcome: "untracked",
          reading: false,
        },
        NOW,
      ),
    ).toBe("Read just now");
  });

  it("ignores a reading that has not answered yet", () => {
    expect(
      freshnessLine(
        {
          readAt: [undefined, minutesAgo(3), 0],
          outcome: "untracked",
          reading: false,
        },
        NOW,
      ),
    ).toBe("Read 3 min ago");
  });

  it("states nothing before any reading has answered", () => {
    expect(
      freshnessLine(
        { readAt: [undefined, 0], outcome: "untracked", reading: false },
        NOW,
      ),
    ).toBeNull();
    expect(
      freshnessLine({ readAt: [], outcome: "untracked", reading: false }, NOW),
    ).toBeNull();
  });
});
