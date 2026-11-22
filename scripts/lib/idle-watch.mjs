/**
 * Tracks the last output of a child process; `check` returns the idle time
 * once it passes `limitMs`, once per silence.
 */
export function idleWatch({ limitMs, startedAt }) {
  let lastOutputAt = startedAt;
  let reported = false;
  return {
    output(now) {
      lastOutputAt = now;
      reported = false;
    },
    check(now) {
      const idle = now - lastOutputAt;
      if (reported || idle < limitMs) return null;
      reported = true;
      return idle;
    },
  };
}
