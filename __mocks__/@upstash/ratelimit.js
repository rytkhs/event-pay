// Mock @upstash/ratelimit
export const Ratelimit = jest.fn().mockImplementation(() => ({
  limit: jest.fn().mockResolvedValue({
    success: true,
    remaining: 10,
    reset: Date.now() + 60000,
  }),
}));

// Mock static method
Ratelimit.slidingWindow = jest.fn().mockReturnValue({
  windowSize: "60s",
  interval: "1m",
});
