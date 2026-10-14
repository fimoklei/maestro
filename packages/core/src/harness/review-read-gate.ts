// The Harness read asks GitHub once per Harness within a window; a Proposal
// action through `writes` drops that answer, so its result shows at once.
import type { GitOrigin } from "../deploy/git-origin";
import { ReuseGate } from "../reuse-gate";
import type {
  HarnessReviewPort,
  HarnessReviewRead,
  ViewerRead,
} from "./harness-review-port";

const keyOf = (origin: GitOrigin) => `${origin.host}/${origin.ownerRepo}`;

export class ReviewReadGate {
  private readonly review: HarnessReviewPort;
  private readonly reviews: ReuseGate<HarnessReviewRead>;
  private readonly viewers: ReuseGate<ViewerRead>;
  // Rechecks read fresh: a mutation is never judged on a remembered answer.
  readonly writes: HarnessReviewPort;

  constructor(deps: { review: HarnessReviewPort; now: () => Date }) {
    this.review = deps.review;
    this.reviews = new ReuseGate({ now: deps.now });
    this.viewers = new ReuseGate({ now: deps.now });
    // Dropped whatever the outcome: a write GitHub refused may still have landed.
    const dropAfter =
      <A extends unknown[], R>(
        write: (origin: GitOrigin, ...args: A) => Promise<R>,
      ) =>
      (origin: GitOrigin, ...args: A): Promise<R> =>
        write(origin, ...args).finally(() =>
          this.reviews.invalidate(keyOf(origin)),
        );
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
    maxAgeMs: number,
  ): Pick<HarnessReviewPort, "readReviews" | "readViewer"> {
    return {
      readReviews: (origin) =>
        this.remembered(this.reviews, origin, maxAgeMs, () =>
          this.review.readReviews(origin),
        ),
      readViewer: (origin) =>
        this.remembered(this.viewers, origin, maxAgeMs, () =>
          this.review.readViewer(origin),
        ),
    };
  }

  // Only a read is reused: once gh is signed in, the next read must say so.
  private async remembered<T extends { outcome: string }>(
    gate: ReuseGate<T>,
    origin: GitOrigin,
    maxAgeMs: number,
    read: () => Promise<T>,
  ): Promise<T> {
    const key = keyOf(origin);
    const answer = await gate.run(key, maxAgeMs, read);
    if (answer.outcome !== "read") {
      gate.invalidate(key);
    }
    return answer;
  }
}
