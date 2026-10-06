import type {
  HarnessReviewPort,
  HarnessReviewRead,
  NewReviewRequest,
  ReviewWriteOutcome,
  ViewerRead,
} from "@maestro/core";

// GitHub's answers are set by the test, not a live account (#827).
export type StubReview = HarnessReviewPort & {
  /** What the next read answers. */
  answer: (read: HarnessReviewRead) => void;
  /** Who the next sign-in read names. `fimoklei` by default. */
  answerViewer: (viewer: ViewerRead) => void;
  /** What the next write answers. Success by default. */
  answerWrite: (outcome: ReviewWriteOutcome) => void;
  /** Each origin the port was asked about, in order. */
  readonly asked: string[];
  /** Every write the port was asked to make, in order. */
  readonly created: NewReviewRequest[];
  readonly reopened: number[];
  readonly closed: number[];
  readonly edited: { number: number; title: string }[];
};

const EMPTY: HarnessReviewRead = {
  outcome: "read",
  requests: [],
  complete: true,
  limit: 100,
};

export const stubReview = (initial: HarnessReviewRead = EMPTY): StubReview => {
  let current = initial;
  let write: ReviewWriteOutcome = { ok: true };
  let viewer: ViewerRead = { outcome: "read", login: "fimoklei" };
  const asked: string[] = [];
  const created: NewReviewRequest[] = [];
  const reopened: number[] = [];
  const closed: number[] = [];
  const edited: { number: number; title: string }[] = [];
  return {
    asked,
    created,
    reopened,
    closed,
    edited,
    answer: (read) => {
      current = read;
    },
    answerViewer: (read) => {
      viewer = read;
    },
    answerWrite: (outcome) => {
      write = outcome;
    },
    readReviews: async (origin) => {
      asked.push(origin.ownerRepo);
      return current;
    },
    readViewer: async () => viewer,
    createRequest: async (_origin, request) => {
      created.push(request);
      return write;
    },
    reopenRequest: async (_origin, number) => {
      reopened.push(number);
      return write;
    },
    closeRequest: async (_origin, number) => {
      closed.push(number);
      return write;
    },
    editRequest: async (_origin, number, { title }) => {
      edited.push({ number, title });
      return write;
    },
  };
};
