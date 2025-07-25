/**
 * @file utils.tsのテストスイート
 * @description CSS クラス名結合ユーティリティのテスト
 */

import { cn } from "@/lib/utils";

describe("lib/utils", () => {
  describe("cn function", () => {
    it("基本的なクラス名結合が正しく動作する", () => {
      const result = cn("bg-red-500", "text-white");
      expect(result).toBe("bg-red-500 text-white");
    });

    it("条件付きクラス名が正しく処理される", () => {
      const isActive = true;
      const result = cn("base-class", isActive && "active-class", !isActive && "inactive-class");
      expect(result).toBe("base-class active-class");
    });

    it("重複するクラス名がマージされる", () => {
      const result = cn("p-4", "p-2"); // Tailwindの競合クラス
      expect(result).toBe("p-2"); // 後の方が優先される
    });

    it("空の入力でも正しく動作する", () => {
      const result = cn();
      expect(result).toBe("");
    });

    it("nullやundefinedが正しく無視される", () => {
      const result = cn("text-blue-500", null, undefined, false, "font-bold");
      expect(result).toBe("text-blue-500 font-bold");
    });

    it("配列形式の入力が正しく処理される", () => {
      const result = cn(["bg-white", "border"], "rounded-lg");
      expect(result).toBe("bg-white border rounded-lg");
    });

    it("オブジェクト形式の条件付きクラスが正しく処理される", () => {
      const result = cn({
        "text-red-500": true,
        "text-green-500": false,
        "font-semibold": true,
      });
      expect(result).toBe("text-red-500 font-semibold");
    });

    it("複雑な組み合わせが正しく動作する", () => {
      const variant = "primary" as "primary" | "secondary";
      const size = "lg" as "sm" | "lg";
      const disabled = false;

      const result = cn(
        "btn",
        variant === "primary" && "btn-primary",
        variant === "secondary" && "btn-secondary",
        size === "sm" && "btn-sm",
        size === "lg" && "btn-lg",
        disabled && "btn-disabled"
      );

      expect(result).toBe("btn btn-primary btn-lg");
    });

    it("Tailwindクラスの競合解決が正しく動作する", () => {
      // marginの競合
      const result1 = cn("m-2", "m-4");
      expect(result1).toBe("m-4");

      // paddingの競合（px, pyはpよりも具体的なので残る）
      const result2 = cn("p-2", "px-4", "py-6");
      expect(result2).toBe("p-2 px-4 py-6");

      // background colorの競合
      const result3 = cn("bg-red-500", "bg-blue-600");
      expect(result3).toBe("bg-blue-600");

      // より具体的な競合例
      const result4 = cn("p-4", "p-6"); // 同レベルの競合
      expect(result4).toBe("p-6");

      const result5 = cn("text-red-500", "text-blue-500", "text-green-500");
      expect(result5).toBe("text-green-500");
    });
  });
});
