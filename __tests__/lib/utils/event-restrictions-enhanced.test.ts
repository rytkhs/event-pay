import {
  checkEventRestrictions,
  checkDeleteRestrictions,
  checkPaymentChangeRestrictions,
  checkCapacityChangeRestrictions,
  type RestrictionContext,
} from "@/lib/utils/event-restrictions";

describe("拡張されたイベント制限チェック機能", () => {
  const mockEvent = {
    id: "test-event-id",
    title: "テストイベント",
    date: "2024-12-31T23:59:59Z",
    fee: 1000,
    payment_methods: ["stripe", "cash"],
    capacity: 50,
    location: "東京",
    description: "テストの説明",
    attendances: [
      { id: "1", status: "attending" },
      { id: "2", status: "attending" },
      { id: "3", status: "attending" },
    ],
    created_by: "user-id",
    invite_token: "test-token",
    status: "upcoming",
    registration_deadline: null,
    payment_deadline: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };

  describe("checkEventRestrictions", () => {
    it("参加者がいない場合は制限なし", () => {
      const eventWithoutAttendees = { ...mockEvent, attendances: [] };
      const context: RestrictionContext = {
        operation: "update",
        attendeeCount: 0,
      };

      const violations = checkEventRestrictions(
        eventWithoutAttendees,
        { title: "新しいタイトル" },
        context
      );
      expect(violations).toHaveLength(0);
    });

    it("update操作でタイトル変更が制限される", () => {
      const context: RestrictionContext = {
        operation: "update",
        attendeeCount: 3,
      };

      const violations = checkEventRestrictions(mockEvent, { title: "新しいタイトル" }, context);
      expect(violations).toHaveLength(1);
      expect(violations[0].field).toBe("title");
      expect(violations[0].message).toBe("参加者がいるため、タイトルは変更できません");
    });

    it("update操作で参加費変更が制限される", () => {
      const context: RestrictionContext = {
        operation: "update",
        attendeeCount: 3,
      };

      const violations = checkEventRestrictions(mockEvent, { fee: 1500 }, context);
      expect(violations).toHaveLength(1);
      expect(violations[0].field).toBe("fee");
      expect(violations[0].message).toBe("参加者がいるため、参加費は変更できません");
    });

    it("update操作で決済方法変更が制限される", () => {
      const context: RestrictionContext = {
        operation: "update",
        attendeeCount: 3,
      };

      const violations = checkEventRestrictions(
        mockEvent,
        { payment_methods: ["stripe"] },
        context
      );
      expect(violations).toHaveLength(1);
      expect(violations[0].field).toBe("payment_methods");
      expect(violations[0].message).toBe("参加者がいるため、決済方法は変更できません");
    });

    it("update操作で定員を参加者数未満に減らすことが制限される", () => {
      const context: RestrictionContext = {
        operation: "update",
        attendeeCount: 3,
      };

      const violations = checkEventRestrictions(mockEvent, { capacity: 2 }, context);
      expect(violations).toHaveLength(1);
      expect(violations[0].field).toBe("capacity");
      expect(violations[0].message).toBe(
        "参加者が3名いるため、定員を3名未満に減らすことはできません"
      );
    });

    it("update操作で定員を参加者数以上に設定することは許可される", () => {
      const context: RestrictionContext = {
        operation: "update",
        attendeeCount: 3,
      };

      const violations = checkEventRestrictions(mockEvent, { capacity: 5 }, context);
      expect(violations).toHaveLength(0);
    });
  });

  describe("checkDeleteRestrictions", () => {
    it("参加者がいない場合は削除可能", () => {
      const eventWithoutAttendees = { ...mockEvent, attendances: [] };
      const violations = checkDeleteRestrictions(eventWithoutAttendees);
      expect(violations).toHaveLength(0);
    });

    it("参加者がいる場合は削除が制限される", () => {
      const violations = checkDeleteRestrictions(mockEvent);
      expect(violations).toHaveLength(1);
      expect(violations[0].field).toBe("event");
      expect(violations[0].message).toBe("参加者が3名いるため、イベントを削除できません");
    });
  });

  describe("checkPaymentChangeRestrictions", () => {
    it("決済済み参加者がいない場合は変更可能", () => {
      const violations = checkPaymentChangeRestrictions(mockEvent, { fee: 1500 }, false);
      expect(violations).toHaveLength(0);
    });

    it("決済済み参加者がいる場合は参加費変更が制限される", () => {
      const violations = checkPaymentChangeRestrictions(mockEvent, { fee: 1500 }, true);
      expect(violations).toHaveLength(1);
      expect(violations[0].field).toBe("fee");
      expect(violations[0].message).toBe("決済済みの参加者がいるため、参加費は変更できません");
    });

    it("決済済み参加者がいる場合は決済方法変更が制限される", () => {
      const violations = checkPaymentChangeRestrictions(
        mockEvent,
        { payment_methods: ["stripe"] },
        true
      );
      expect(violations).toHaveLength(1);
      expect(violations[0].field).toBe("payment_methods");
      expect(violations[0].message).toBe("決済済みの参加者がいるため、決済方法は変更できません");
    });

    it("決済済み参加者がいても参加費が変更されない場合は制限なし", () => {
      const violations = checkPaymentChangeRestrictions(mockEvent, { fee: 1000 }, true);
      expect(violations).toHaveLength(0);
    });
  });

  describe("checkCapacityChangeRestrictions", () => {
    it("定員を参加者数未満に減らすことが制限される", () => {
      const violations = checkCapacityChangeRestrictions(mockEvent, 2);
      expect(violations).toHaveLength(1);
      expect(violations[0].field).toBe("capacity");
      expect(violations[0].message).toBe(
        "参加者が3名いるため、定員を3名未満に減らすことはできません"
      );
    });

    it("定員を参加者数以上に設定することは許可される", () => {
      const violations = checkCapacityChangeRestrictions(mockEvent, 5);
      expect(violations).toHaveLength(0);
    });

    it("定員を参加者数と同じに設定することは許可される", () => {
      const violations = checkCapacityChangeRestrictions(mockEvent, 3);
      expect(violations).toHaveLength(0);
    });
  });

  describe("複数制限の同時チェック", () => {
    it("複数の制限違反が同時に検出される", () => {
      const context: RestrictionContext = {
        operation: "update",
        attendeeCount: 3,
      };

      const violations = checkEventRestrictions(
        mockEvent,
        {
          title: "新しいタイトル",
          fee: 1500,
          payment_methods: ["stripe"],
        },
        context
      );

      expect(violations).toHaveLength(3);
      expect(violations.map((v) => v.field)).toEqual(["title", "fee", "payment_methods"]);
    });
  });

  describe("操作別制限ルール", () => {
    it("delete操作では特定の制限のみが適用される", () => {
      const context: RestrictionContext = {
        operation: "delete",
        attendeeCount: 3,
      };

      const violations = checkEventRestrictions(mockEvent, {}, context);
      expect(violations).toHaveLength(1);
      expect(violations[0].field).toBe("event");
    });

    it("capacity_change操作では定員制限のみが適用される", () => {
      const context: RestrictionContext = {
        operation: "capacity_change",
        attendeeCount: 3,
      };

      const violations = checkEventRestrictions(
        mockEvent,
        {
          title: "新しいタイトル", // この変更は制限されない
          capacity: 2, // この変更は制限される
        },
        context
      );

      expect(violations).toHaveLength(1);
      expect(violations[0].field).toBe("capacity");
    });
  });

  describe("メッセージの動的生成", () => {
    it("参加者数に応じたメッセージが生成される", () => {
      const context: RestrictionContext = {
        operation: "update",
        attendeeCount: 5,
      };

      const violations = checkEventRestrictions(mockEvent, { capacity: 3 }, context);
      expect(violations[0].message).toBe(
        "参加者が5名いるため、定員を5名未満に減らすことはできません"
      );
    });
  });
});
