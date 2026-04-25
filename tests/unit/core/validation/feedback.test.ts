import { FeedbackInputSchema } from "@core/validation/feedback";

describe("FeedbackInputSchema", () => {
  const validInput = {
    category: "feature_request",
    message: "フィードバック本文です。10文字以上あります。",
    pageContext: "",
    name: "",
    email: "",
    consent: true,
  };

  test("有効な入力を受け入れる", () => {
    const result = FeedbackInputSchema.safeParse(validInput);

    expect(result.success).toBe(true);
  });

  test("名前とメールアドレスは任意", () => {
    const result = FeedbackInputSchema.safeParse({
      ...validInput,
      name: "",
      email: "",
    });

    expect(result.success).toBe(true);
  });

  test("メールアドレスは入力された場合だけ形式検証する", () => {
    const result = FeedbackInputSchema.safeParse({
      ...validInput,
      email: "invalid-email",
    });

    expect(result.success).toBe(false);
  });

  test("未知のカテゴリを拒否する", () => {
    const result = FeedbackInputSchema.safeParse({
      ...validInput,
      category: "unknown",
    });

    expect(result.success).toBe(false);
  });

  test("短すぎる本文を拒否する", () => {
    const result = FeedbackInputSchema.safeParse({
      ...validInput,
      message: "短い",
    });

    expect(result.success).toBe(false);
  });

  test("プライバシーポリシー未同意を拒否する", () => {
    const result = FeedbackInputSchema.safeParse({
      ...validInput,
      consent: false,
    });

    expect(result.success).toBe(false);
  });
});
