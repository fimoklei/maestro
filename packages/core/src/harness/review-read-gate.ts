import type { GitOrigin } from "../deploy/git-origin";
import { ReuseGate } from "../reuse-gate";
import type {
  HarnessReviewPort,
  HarnessReviewRead,
  ViewerRead,
} from "./harness-review-port";

const keepRead = (answer: { outcome: string }) => answer.outcome === "read";

export class ReviewReadGate {
  private readonly review: HarnessReviewPort;
  private readonly root: () => Promise<string | undefined>;
  private readonly reviews: ReuseGate<HarnessReviewRead>;
  private readonly viewers: ReuseGate<ViewerRead>;
  readonly writes: HarnessReviewPort;

  constructor(deps: {
    review: HarnessReviewPort;
    root: () => Promise<string | undefined>;
    now: () => Date;
  }) {
    this.review = deps.review;
    this.root = deps.root;
    this.reviews = new ReuseGate<HarnessReviewRead>({
      now: deps.now,
      keep: keepRead,
    });
    this.viewers = new ReuseGate<ViewerRead>({ now: deps.now, keep: keepRead });
    const dropAfter =
      <A extends unknown[], R>(
        write: (origin: GitOrigin, ...args: A) => Promise<R>,
      ) =>
      (origin: GitOrigin, ...args: A): Promise<R> =>
        write(origin, ...args).finally(() => this.reviews.invalidateAll());
    const { review } = deps;
    this.writes = {
      readReviews: (origin) => review.readReviews(origin),
      readViewer: (origin) => review.readViewer(origin),
      createRequest: dropAfter(review.createRequest.bind(review)),
      reopenRequest: dropAfter(review.reopenRequest.bind(review)),
      closeRequest: dropAfter(review.closeRequest.bind(review)),
      editRequest: dropAfter(review.editRequest.bind(review)),
    };
  }

  reads(
    viewerMaxAgeMs: number,
  ): Pick<HarnessReviewPort, "readReviews" | "readViewer"> {
    return {
      readReviews: (origin) =>
        this.remembered(this.reviews, Number.POSITIVE_INFINITY, () =>
          this.review.readReviews(origin),
        ),
      readViewer: (origin) =>
        this.remembered(this.viewers, viewerMaxAgeMs, () =>
          this.review.readViewer(origin),
        ),
    };
  }

  fetched(root: string): void {
    this.reviews.invalidate(root);
  }

  private async remembered<T>(
    gate: ReuseGate<T>,
    maxAgeMs: number,
    read: () => Promise<T>,
  ): Promise<T> {
    const root = await this.root();
    return root === undefined ? read() : gate.run(root, maxAgeMs, read);
  }
}
