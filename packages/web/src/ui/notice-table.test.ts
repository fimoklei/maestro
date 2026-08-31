import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import { type NoticeTable, noticeFromTable } from "./notice-table";

const headings: NoticeTable<"web-owns-it" | "server-owns-it"> = {
  "web-owns-it": {
    level: "error",
    label: "nothing was written",
    message: "Give the file a name, then save it again.",
  },
  "server-owns-it": { level: "error", label: "nothing was read" },
};

describe("noticeFromTable", () => {
  it("shows the sentence the row carries", () => {
    const notice = noticeFromTable(
      headings,
      new HttpError(422, "The server sentence.", "web-owns-it"),
      "the request failed",
    );

    expect(notice?.message).toBe("Give the file a name, then save it again.");
  });

  it("shows the server's sentence for a row without one", () => {
    const notice = noticeFromTable(
      headings,
      new HttpError(422, "The server sentence.", "server-owns-it"),
      "the request failed",
    );

    expect(notice?.message).toBe("The server sentence.");
  });
});
