import test from "#test/runner";
import assert from "#test/assert";
import {
  RealTimeSource,
  SlidingWindowRateLimiter,
  AdaptiveRateLimiter,
} from "../src/rag/rateLimiter.ts";

class FakeTimeSource {
  constructor(now = 0) {
    this.now = now;
    this.sleeps = [];
  }

  nowMs() {
    return this.now;
  }

  async sleepMs(ms) {
    this.sleeps.push(ms);
    this.now += ms;
  }
}

test("RealTimeSource exposes time and sleep helpers", async () => {
  const source = new RealTimeSource();
  const before = source.nowMs();
  await source.sleepMs(1);
  const after = source.nowMs();
  assert.ok(after >= before);
});

test("SlidingWindowRateLimiter allows unlimited mode", async () => {
  const time = new FakeTimeSource();
  const limiter = new SlidingWindowRateLimiter(Infinity, time);

  await limiter.consume("sid");
  await limiter.consume("sid");
  assert.deepEqual(time.sleeps, []);
});

test("SlidingWindowRateLimiter rejects non-positive limits", async () => {
  const limiter = new SlidingWindowRateLimiter(0, new FakeTimeSource());
  await assert.rejects(() => limiter.consume("sid"), /maxPerSecond must be > 0 or Infinity/);
});

test("SlidingWindowRateLimiter waits once the window is full and then prunes old timestamps", async () => {
  const time = new FakeTimeSource(0);
  const limiter = new SlidingWindowRateLimiter(2, time);

  await limiter.consume("sid");
  time.now = 100;
  await limiter.consume("sid");
  time.now = 200;
  await limiter.consume("sid");

  assert.deepEqual(time.sleeps, [50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50]);
  assert.equal(time.now, 1000);
});

test("SlidingWindowRateLimiter tracks keys independently", async () => {
  const time = new FakeTimeSource(0);
  const limiter = new SlidingWindowRateLimiter(1, time);

  await limiter.consume("sid");
  await limiter.consume("vic");
  assert.deepEqual(time.sleeps, []);
});

test("AdaptiveRateLimiter rejects invalid defaults", () => {
  assert.throws(() => new AdaptiveRateLimiter(0), /defaultRps must be > 0/);
});

test("AdaptiveRateLimiter consumes without waiting below limit", async () => {
  const time = new FakeTimeSource(0);
  const limiter = new AdaptiveRateLimiter(2, time);

  await limiter.consume("sid");
  time.now = 100;
  await limiter.consume("sid");
  assert.deepEqual(time.sleeps, []);
});

test("AdaptiveRateLimiter throttles, respects minRps, and slowly recovers", async () => {
  const time = new FakeTimeSource(0);
  const limiter = new AdaptiveRateLimiter(4, time, {
    minRps: 2,
    increaseIntervalMs: 500,
    increaseStep: 1,
  });

  limiter.notifyThrottle("sid", 0.1);
  await limiter.consume("sid");
  time.now = 100;
  await limiter.consume("sid");
  time.now = 200;
  const waiting = limiter.consume("sid");
  await waiting;
  assert.ok(time.sleeps.every((ms) => ms <= 10));

  time.now += 600;
  await limiter.consume("sid");
  assert.ok(time.now >= 1000);
});

test("AdaptiveRateLimiter keeps separate state per key", async () => {
  const time = new FakeTimeSource(0);
  const limiter = new AdaptiveRateLimiter(1, time, { increaseIntervalMs: 100 });

  limiter.notifyThrottle("sid", 0.5);
  await limiter.consume("sid");
  await limiter.consume("vic");
  assert.deepEqual(time.sleeps, []);
});