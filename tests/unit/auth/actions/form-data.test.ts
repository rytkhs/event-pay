import { formDataToObject } from "@/app/(auth)/_actions/_shared/form-data";

describe("formDataToObject", () => {
  test("FormDataをstringレコードへ変換する", () => {
    const formData = new FormData();
    formData.append("email", "test@example.com");
    formData.append("otp", "123456");

    expect(formDataToObject(formData)).toEqual({
      email: "test@example.com",
      otp: "123456",
    });
  });

  test("同一キーは後勝ちで上書きされる", () => {
    const formData = new FormData();
    formData.append("email", "first@example.com");
    formData.append("email", "second@example.com");

    expect(formDataToObject(formData)).toEqual({
      email: "second@example.com",
    });
  });
});
