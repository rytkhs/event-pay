// Mock next/navigation for client components
export const useRouter = jest.fn(() => ({
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
  prefetch: jest.fn(),
}));

export const usePathname = jest.fn(() => "/");

export const useSearchParams = jest.fn(() => new URLSearchParams());

export const redirect = jest.fn();

export const notFound = jest.fn();
