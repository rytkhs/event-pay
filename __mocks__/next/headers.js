// Mock next/headers for SSR testing
const cookieStore = new Map();
const headerStore = new Map();

export const cookies = jest.fn(() => ({
  get: jest.fn((name) => {
    const value = cookieStore.get(name);
    return value ? { name, value } : undefined;
  }),
  set: jest.fn((name, value) => {
    cookieStore.set(name, value);
  }),
  has: jest.fn((name) => cookieStore.has(name)),
  delete: jest.fn((name) => cookieStore.delete(name)),
  getAll: jest.fn(() =>
    Array.from(cookieStore.entries()).map(([name, value]) => ({ name, value }))
  ),
  clear: jest.fn(() => cookieStore.clear()),
}));

export const headers = jest.fn(() => ({
  get: jest.fn((name) => headerStore.get(name.toLowerCase())),
  has: jest.fn((name) => headerStore.has(name.toLowerCase())),
  set: jest.fn((name, value) => headerStore.set(name.toLowerCase(), value)),
  delete: jest.fn((name) => headerStore.delete(name.toLowerCase())),
  entries: jest.fn(() => headerStore.entries()),
  keys: jest.fn(() => headerStore.keys()),
  values: jest.fn(() => headerStore.values()),
}));
