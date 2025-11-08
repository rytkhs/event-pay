// Mock for @upstash/redis package
// Used in unit tests to avoid ESM module issues and actual Redis connections

module.exports = {
  Redis: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    keys: jest.fn(),
    mget: jest.fn(),
    mset: jest.fn(),
    incr: jest.fn(),
    decr: jest.fn(),
    expire: jest.fn(),
    ttl: jest.fn(),
    pipeline: jest.fn(() => ({
      exec: jest.fn(),
    })),
  })),
};
