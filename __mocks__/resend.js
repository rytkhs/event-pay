// Mock Resend for email testing
const mockSend = jest.fn().mockResolvedValue({
  data: { id: "mock-email-id" },
  error: null,
});

export const Resend = jest.fn().mockImplementation(() => ({
  emails: { send: mockSend },
}));
