// Mock for @upstash/ratelimit package
// Used in unit tests to avoid ESM module issues and actual rate limiting

class MockRatelimit {
  constructor(config) {
    this.config = config;
  }

  async limit(identifier) {
    return {
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60000,
      pending: Promise.resolve(),
    };
  }

  // Static algorithm methods
  static slidingWindow(tokens, window) {
    return {
      type: "slidingWindow",
      tokens,
      window,
    };
  }

  static fixedWindow(tokens, window) {
    return {
      type: "fixedWindow",
      tokens,
      window,
    };
  }

  static tokenBucket(refillRate, interval, maxTokens) {
    return {
      type: "tokenBucket",
      refillRate,
      interval,
      maxTokens,
    };
  }
}

module.exports = {
  Ratelimit: MockRatelimit,
};
