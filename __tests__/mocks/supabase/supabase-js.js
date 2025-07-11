// Simple mock for @supabase/supabase-js
export const createClient = jest.fn(() => ({
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