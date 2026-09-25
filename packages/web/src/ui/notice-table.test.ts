import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import { type NoticeTable, noticeFromTable } from "./notice-table";

const headings: NoticeTable<"web-owns-it"> = {
  "web-owns-it": {
    level: "error",
    label: "Nothing written",
    message: "Give the file a name, then save it again.",
  },
};

const fallback = {
  label: "Request not answered",
  message: "The Maestro server did not answer. Try again.",
};

describe("noticeFromTable", () => {
  it("shows the sentence the row carries", () => {
    const notice = noticeFromTable(
      headings,
      new HttpError(422, "The server sentence.", "web-owns-it"),
      fallback,
    );

    expect(notice?.message).toBe("Give the file a name, then save it again.");
  });

  it("never reads the sentence off the error", () => {
    const notice = noticeFromTable(
      headings,
      new HttpError(422, "The server sentence.", "a-code-this-build-predates"),
      fallback,
    );

    expect(notice).toEqual({
      level: "error",
      label: "Request not answered",
      message: "The Maestro server did not answer. Try again.",
    });
  });

  it("hands a request-shape refusal to the shared path", () => {
    const notice = noticeFromTable(
      headings,
      new HttpError(
        400,
        "Maestro did not receive a folder. Reload the page, then choose a folder again.",
        "invalid-body",
        {
          error: "invalid-body",
          message:
            "Maestro did not receive a folder. Reload the page, then choose a folder again.",
          detail: "The request carries a path: { path: string }.",
        },
      ),
      fallback,
    );

    expect(notice).toEqual({
      level: "error",
      label: "Maestro could not start the action",
      message:
        "Maestro did not receive a folder. Reload the page, then choose a folder again.",
      detail: "The request carries a path: { path: string }.",
    });
  });

  it("rejects a row that carries no sentence", () => {
    const rows: NoticeTable<"web-owns-it"> = {
      // @ts-expect-error a copy table row must carry its own sentence
      "web-owns-it": { level: "error", label: "Nothing written" },
    };

    expect(rows["web-owns-it"].message).toBeUndefined();
  });
});
