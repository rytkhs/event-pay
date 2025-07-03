const mockHeaders = () => ({
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  has: jest.fn(),
  entries: jest.fn(() => []),
  keys: jest.fn(() => []),
  values: jest.fn(() => []),
  forEach: jest.fn(),
  append: jest.fn(),
  getSetCookie: jest.fn(() => []),
});

const mockCookies = () => ({
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  has: jest.fn(),
  clear: jest.fn(),
  getAll: jest.fn(() => []),
  toString: jest.fn(() => ""),
});

const mockRouter = () => ({
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
  prefetch: jest.fn(),
});

const mockSearchParams = () => ({
  get: jest.fn(),
  getAll: jest.fn(),
  has: jest.fn(),
  keys: jest.fn(),
  values: jest.fn(),
  entries: jest.fn(),
  forEach: jest.fn(),
  toString: jest.fn(),
});

export { mockHeaders, mockCookies, mockRouter, mockSearchParams };
