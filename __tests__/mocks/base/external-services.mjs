const mockStripe = () => ({
  webhooks: {
    constructEvent: jest.fn(() => ({
      id: "evt_test",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_test",
          status: "succeeded",
          amount: 1000,
          currency: "jpy",
        },
      },
    })),
  },
  paymentIntents: {
    create: jest.fn(() =>
      Promise.resolve({
        id: "pi_test",
        client_secret: "pi_test_client_secret",
        status: "requires_payment_method",
      })
    ),
    retrieve: jest.fn(() =>
      Promise.resolve({
        id: "pi_test",
        status: "succeeded",
      })
    ),
  },
});

const mockResend = () => ({
  emails: {
    send: jest.fn(() =>
      Promise.resolve({
        id: "email_test",
        from: "noreply@example.com",
        to: ["test@example.com"],
        subject: "Test Email",
      })
    ),
  },
});

const mockUpstashRateLimit = () => ({
  limit: jest.fn(() =>
    Promise.resolve({
      success: true,
      limit: 5,
      remaining: 4,
      reset: Date.now() + 60000,
    })
  ),
});

const mockUpstashRedis = () => ({
  get: jest.fn(() => Promise.resolve(null)),
  set: jest.fn(() => Promise.resolve("OK")),
  del: jest.fn(() => Promise.resolve(1)),
  exists: jest.fn(() => Promise.resolve(0)),
  expire: jest.fn(() => Promise.resolve(1)),
  ttl: jest.fn(() => Promise.resolve(-1)),
});

export { mockStripe, mockResend, mockUpstashRateLimit, mockUpstashRedis };
