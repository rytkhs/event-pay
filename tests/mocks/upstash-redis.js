// Mock for @upstash/redis package
// Used in unit tests to avoid ESM module issues and actual Redis connections

const mockRedisInstance = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  keys: jest.fn(),
  mget: jest.fn(),
  mset: jest.fn(),
  incr: jest.fn().mockResolvedValue(1), // Return a promise by default
  decr: jest.fn(),
  expire: jest.fn(),
  ttl: jest.fn(),
  pipeline: jest.fn(() => ({
    exec: jest.fn(),
  })),
};

module.exports = {
  Redis: Object.assign(
    jest.fn().mockImplementation(() => mockRedisInstance),
    {
      fromEnv: jest.fn(() => mockRedisInstance),
    }
  ),
};
