// Mock Stripe for payment testing
export default jest.fn().mockImplementation(() => ({
  charges: {
    create: jest.fn().mockResolvedValue({
      id: "ch_mock",
      status: "succeeded",
    }),
  },
  paymentIntents: {
    create: jest.fn().mockResolvedValue({
      id: "pi_mock",
      client_secret: "pi_mock_secret",
    }),
    confirm: jest.fn().mockResolvedValue({
      id: "pi_mock",
      status: "succeeded",
    }),
  },
  customers: {
    create: jest.fn().mockResolvedValue({
      id: "cus_mock",
    }),
  },
  accounts: {
    create: jest.fn().mockResolvedValue({
      id: "acct_mock",
    }),
  },
  webhooks: {
    constructEvent: jest.fn(),
  },
}));
