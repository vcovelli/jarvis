export type RateLimitConfig = { limit: number; windowMs: number };
type Bucket = { count: number; resetAt: number };
export type RateLimitResult = { allowed: boolean; limit: number; remaining: number; resetAt: number; retryAfter: number };

export interface RateLimitStore {
  consume(key: string, config: RateLimitConfig, now?: number): RateLimitResult;
  reset?(): void;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, Bucket>();

  consume(key: string, config: RateLimitConfig, now = Date.now()): RateLimitResult {
    const previous = this.buckets.get(key);
    const bucket = !previous || previous.resetAt <= now
      ? { count: 0, resetAt: now + config.windowMs }
      : previous;
    bucket.count += 1;
    this.buckets.set(key, bucket);
    if (this.buckets.size > 10_000) this.prune(now);
    return {
      allowed: bucket.count <= config.limit,
      limit: config.limit,
      remaining: Math.max(0, config.limit - bucket.count),
      resetAt: bucket.resetAt,
      retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  reset() {
    this.buckets.clear();
  }

  private prune(now: number) {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}
