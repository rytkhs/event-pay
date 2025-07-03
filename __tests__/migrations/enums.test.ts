/**
 * ENUM型定義のテスト
 * DB-001: ENUM型定義（イベントステータス、決済方法など）
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "SUPABASE_SERVICE_ROLE_KEY_REDACTED";

// Service roleを使用してテスト関数にアクセス
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

describe("ENUM型定義テスト", () => {
  beforeEach(async () => {
    // 各テスト前にテストデータをクリーンアップ（セキュリティ強化後の安全な関数を使用）
    const { error } = await supabaseAdmin.rpc("cleanup_test_data_safe");
    if (error) {
      console.warn("テストデータクリーンアップに失敗:", error.message);
    }
  });

  describe("event_status_enum", () => {
    it("正しいevent_status値が受け入れられること", async () => {
      const validStatuses = ["upcoming", "ongoing", "past", "cancelled"];

      for (const status of validStatuses) {
        const { data, error } = await supabaseAdmin.rpc("test_event_status_enum", {
          test_value: status,
        });

        expect(error).toBeNull();
        expect(data).toBe(true);
      }
    });

    it("不正なevent_status値が拒否されること", async () => {
      const invalidStatus = "invalid_status";

      const { data, error } = await supabaseAdmin.rpc("test_event_status_enum", {
        test_value: invalidStatus,
      });

      expect(error).toBeNull();
      expect(data).toBe(false);
    });
  });

  describe("payment_method_enum", () => {
    it("正しいpayment_method値が受け入れられること", async () => {
      const validMethods = ["stripe", "cash", "free"];

      for (const method of validMethods) {
        const { data, error } = await supabaseAdmin.rpc("test_payment_method_enum", {
          test_value: method,
        });

        expect(error).toBeNull();
        expect(data).toBe(true);
      }
    });

    it("不正なpayment_method値が拒否されること", async () => {
      const invalidMethod = "bitcoin";

      const { data, error } = await supabaseAdmin.rpc("test_payment_method_enum", {
        test_value: invalidMethod,
      });

      expect(error).toBeNull();
      expect(data).toBe(false);
    });
  });

  describe("payment_status_enum", () => {
    it("正しいpayment_status値が受け入れられること", async () => {
      const validStatuses = [
        "pending",
        "paid",
        "failed",
        "received",
        "completed",
        "refunded",
        "waived",
      ];

      for (const status of validStatuses) {
        const { data, error } = await supabaseAdmin.rpc("test_payment_status_enum", {
          test_value: status,
        });

        expect(error).toBeNull();
        expect(data).toBe(true);
      }
    });

    it("不正なpayment_status値が拒否されること", async () => {
      const invalidStatus = "processing";

      const { data, error } = await supabaseAdmin.rpc("test_payment_status_enum", {
        test_value: invalidStatus,
      });

      expect(error).toBeNull();
      expect(data).toBe(false);
    });
  });

  describe("attendance_status_enum", () => {
    it("正しいattendance_status値が受け入れられること", async () => {
      const validStatuses = ["attending", "not_attending", "maybe"];

      for (const status of validStatuses) {
        const { data, error } = await supabaseAdmin.rpc("test_attendance_status_enum", {
          test_value: status,
        });

        expect(error).toBeNull();
        expect(data).toBe(true);
      }
    });

    it("不正なattendance_status値が拒否されること", async () => {
      const invalidStatus = "confirmed";

      const { data, error } = await supabaseAdmin.rpc("test_attendance_status_enum", {
        test_value: invalidStatus,
      });

      expect(error).toBeNull();
      expect(data).toBe(false);
    });
  });

  describe("stripe_account_status_enum", () => {
    it("正しいstripe_account_status値が受け入れられること", async () => {
      const validStatuses = ["unverified", "onboarding", "verified", "restricted"];

      for (const status of validStatuses) {
        const { data, error } = await supabaseAdmin.rpc("test_stripe_account_status_enum", {
          test_value: status,
        });

        expect(error).toBeNull();
        expect(data).toBe(true);
      }
    });

    it("不正なstripe_account_status値が拒否されること", async () => {
      const invalidStatus = "suspended";

      const { data, error } = await supabaseAdmin.rpc("test_stripe_account_status_enum", {
        test_value: invalidStatus,
      });

      expect(error).toBeNull();
      expect(data).toBe(false);
    });
  });

  describe("payout_status_enum", () => {
    it("正しいpayout_status値が受け入れられること", async () => {
      const validStatuses = ["pending", "processing", "completed", "failed"];

      for (const status of validStatuses) {
        const { data, error } = await supabaseAdmin.rpc("test_payout_status_enum", {
          test_value: status,
        });

        expect(error).toBeNull();
        expect(data).toBe(true);
      }
    });

    it("不正なpayout_status値が拒否されること", async () => {
      const invalidStatus = "cancelled";

      const { data, error } = await supabaseAdmin.rpc("test_payout_status_enum", {
        test_value: invalidStatus,
      });

      expect(error).toBeNull();
      expect(data).toBe(false);
    });
  });

  describe("ENUM型の整合性テスト", () => {
    it("全てのENUM型が正しく作成されていること", async () => {
      const { data: enumTypes, error } = await supabaseAdmin.rpc("get_enum_types");

      expect(error).toBeNull();
      expect(enumTypes).toBeDefined();

      const expectedEnums = [
        "attendance_status_enum",
        "event_status_enum",
        "payment_method_enum",
        "payment_status_enum",
        "payout_status_enum",
        "stripe_account_status_enum",
      ];

      const actualEnumNames = enumTypes?.map((e: any) => e.enum_name).sort();
      expect(actualEnumNames).toEqual(expectedEnums);
    });

    it("event_status_enumの値が正しい順序で定義されていること", async () => {
      const { data: enumValues, error } = await supabaseAdmin.rpc("get_enum_values", {
        enum_type_name: "event_status_enum",
      });

      expect(error).toBeNull();
      expect(enumValues).toEqual(["upcoming", "ongoing", "past", "cancelled"]);
    });

    it("payment_method_enumの値が正しく定義されていること", async () => {
      const { data: enumValues, error } = await supabaseAdmin.rpc("get_enum_values", {
        enum_type_name: "payment_method_enum",
      });

      expect(error).toBeNull();
      expect(enumValues).toEqual(["stripe", "cash", "free"]);
    });

    it("payment_status_enumの値が正しく定義されていること", async () => {
      const { data: enumValues, error } = await supabaseAdmin.rpc("get_enum_values", {
        enum_type_name: "payment_status_enum",
      });

      expect(error).toBeNull();
      expect(enumValues).toEqual([
        "pending",
        "paid",
        "failed",
        "received",
        "completed",
        "refunded",
        "waived",
      ]);
    });
  });

  describe("セキュリティテスト", () => {
    it("SQLインジェクション攻撃が無効化されること", async () => {
      const maliciousInputs = [
        "'; DROP TABLE test_enum_validation; --",
        "upcoming'; INSERT INTO test_enum_validation VALUES (1); --",
        "' OR '1'='1",
        "'; SELECT * FROM pg_user; --",
      ];

      for (const maliciousInput of maliciousInputs) {
        const { data, error } = await supabaseAdmin.rpc("test_event_status_enum", {
          test_value: maliciousInput,
        });

        expect(error).toBeNull();
        expect(data).toBe(false);
      }

      // テストテーブルが破損していないことを確認
      const { data: tableCheck, error: tableError } = await supabaseAdmin
        .from("test_enum_validation")
        .select("count", { count: "exact" });

      expect(tableError).toBeNull();
    });

    it("特殊文字を含む値が適切に処理されること", async () => {
      const specialChars = ["'test'", '"test"', "test\\", "test\ntest", "test\ttest", "test;test"];

      for (const char of specialChars) {
        const { data, error } = await supabaseAdmin.rpc("test_event_status_enum", {
          test_value: char,
        });

        expect(error).toBeNull();
        expect(data).toBe(false);
      }
    });
  });

  describe("テーブル使用テスト", () => {
    it("ENUM型をテーブルで正しく使用できること", async () => {
      const { data, error } = await supabaseAdmin
        .from("test_enum_validation")
        .insert({
          event_status: "upcoming",
          payment_method: "stripe",
          payment_status: "pending",
          attendance_status: "attending",
          stripe_account_status: "verified",
          payout_status: "pending",
        })
        .select();

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0].event_status).toBe("upcoming");
      expect(data![0].payment_method).toBe("stripe");
      expect(data![0].payment_status).toBe("pending");
      expect(data![0].attendance_status).toBe("attending");
      expect(data![0].stripe_account_status).toBe("verified");
      expect(data![0].payout_status).toBe("pending");
    });

    it("不正なENUM値でのINSERTが拒否されること", async () => {
      const { error } = await supabaseAdmin.from("test_enum_validation").insert({
        event_status: "invalid_status",
      });

      expect(error).not.toBeNull();
      expect(error?.message).toContain("invalid input value for enum");
    });

    it("ENUM値でのフィルタリングが正しく動作すること", async () => {
      // テストデータを挿入
      await supabaseAdmin.from("test_enum_validation").insert([
        { event_status: "upcoming", payment_method: "stripe" },
        { event_status: "past", payment_method: "cash" },
        { event_status: "upcoming", payment_method: "free" },
      ]);

      // フィルタリングテスト
      const { data, error } = await supabaseAdmin
        .from("test_enum_validation")
        .select("*")
        .eq("event_status", "upcoming");

      expect(error).toBeNull();
      expect(data!.length).toBeGreaterThanOrEqual(2);
      expect(data!.every((item) => item.event_status === "upcoming")).toBe(true);
    });
  });
});
