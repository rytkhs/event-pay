// Simple mock for @supabase/ssr
export const createServerClient = jest.fn(() => ({
  auth: {
    getUser: jest.fn(() => Promise.resolve({
      data: { user: null },
      error: null
    }))
  },
  from: jest.fn(() => ({
    select: jest.fn(() => ({ data: [], error: null })),
    insert: jest.fn(() => ({ data: [], error: null })),
    update: jest.fn(() => ({ data: [], error: null })),
    delete: jest.fn(() => ({ data: [], error: null }))
  }))
}));

export const createBrowserClient = jest.fn(() => ({
  auth: {
    getUser: jest.fn(() => Promise.resolve({
      data: { user: null },
      error: null
    }))
  },
  from: jest.fn(() => ({
    select: jest.fn(() => ({ data: [], error: null })),
    insert: jest.fn(() => ({ data: [], error: null })),
    update: jest.fn(() => ({ data: [], error: null })),
    delete: jest.fn(() => ({ data: [], error: null }))
  }))
}));