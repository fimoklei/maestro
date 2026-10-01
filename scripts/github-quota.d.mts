export interface QuotaCheck {
  ok: boolean;
  /** Null when GitHub did not answer. */
  remaining: number | null;
  /** UTC time the quota refills, `HH:MM:SSZ`; null when GitHub did not answer. */
  resetAt: string | null;
}

export function checkQuota(
  needed: number,
  get?: (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>,
): Promise<QuotaCheck>;
