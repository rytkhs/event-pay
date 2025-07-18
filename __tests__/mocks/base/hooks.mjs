// フック用の軽量モック
export const mockUseEventEditForm = (overrides = {}) => {
  const defaultMock = {
    formData: {
      title: "テストイベント",
      description: "テストイベントの説明",
      location: "東京都渋谷区",
      date: "2024-01-01T10:00",
      fee: "1000",
      capacity: "50",
      payment_methods: ["stripe"],
      registration_deadline: "2023-12-31T23:59",
      payment_deadline: "2023-12-31T23:59",
    },
    errors: {},
    hasAttendees: false,
    hasChanges: false,
    isFieldRestricted: jest.fn(() => false),
    handleInputChange: jest.fn(),
    validateField: jest.fn(),
    detectChanges: jest.fn(() => []),
    resetForm: jest.fn(),
    submitForm: jest.fn(() => Promise.resolve({ success: true })),
    setErrors: jest.fn(),
    ...overrides,
  };

  return defaultMock;
};

// その他のフック用モック
export const mockUseEventForm = (overrides = {}) => ({
  formData: {
    title: "",
    description: "",
    location: "",
    date: "",
    capacity: "",
    registrationDeadline: "",
    paymentDeadline: "",
    paymentMethods: "",
    fee: "",
  },
  errors: {},
  handleInputChange: jest.fn(),
  handleSubmit: jest.fn(),
  isLoading: false,
  ...overrides,
});

export const mockUseRouter = () => ({
  push: jest.fn(),
  back: jest.fn(),
  refresh: jest.fn(),
  replace: jest.fn(),
  prefetch: jest.fn(),
});

export const mockUseSearchParams = () => ({
  get: jest.fn(),
  has: jest.fn(),
  getAll: jest.fn(),
  keys: jest.fn(),
  values: jest.fn(),
  entries: jest.fn(),
  forEach: jest.fn(),
  toString: jest.fn(),
});
