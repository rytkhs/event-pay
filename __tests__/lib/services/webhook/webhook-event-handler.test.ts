import Stripe from "stripe";
import { StripeWebhookEventHandler } from "@/lib/services/webhook/webhook-event-handler";
import type { SecurityReporter } from "@/lib/security/security-reporter.types";

// Supabaseクライアントのモック
const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(),
      })),
    })),
    update: jest.fn(() => ({
      eq: jest.fn(),
    })),
  })),
  rpc: jest.fn(),
};

// SecurityReporterのモック
const mockSecurityReporter = {
  logSecurityEvent: jest.fn(),
  logSuspiciousActivity: jest.fn(),
} as unknown as SecurityReporter;

// Supabaseクライアントの作成をモック
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => mockSupabase),
}));

describe("StripeWebhookEventHandler", () => {
  let handler: StripeWebhookEventHandler;

  beforeEach(() => {
    handler = new StripeWebhookEventHandler(mockSecurityReporter);
    jest.clearAllMocks();
  });

  describe("handleEvent", () => {
    it("サポートされていないイベントタイプを適切に処理する", async () => {
      const event = {
        id: "evt_test",
        type: "unsupported.event",
        data: { object: {} },
      } as unknown as Stripe.Event;

      const result = await handler.handleEvent(event);

      expect(result.success).toBe(true);
      expect(mockSecurityReporter.logSecurityEvent).toHaveBeenCalledWith({
        type: "webhook_unsupported_event",
        details: {
          eventType: "unsupported.event",
          eventId: "evt_test",
        },
      });
    });

    it("処理中にエラーが発生した場合の処理", async () => {
      const event = {
        id: "evt_test",
        type: "payment_intent.succeeded",
        data: { object: { id: "pi_test" } },
      } as Stripe.PaymentIntentSucceededEvent;

      // データベースエラーをシミュレート
      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: "Database error" },
            }),
          })),
        })),
      });

      const result = await handler.handleEvent(event);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Payment record not found");
      expect(mockSecurityReporter.logSuspiciousActivity).toHaveBeenCalledWith({
        type: "webhook_processing_error",
        details: {
          eventType: "payment_intent.succeeded",
          eventId: "evt_test",
          error: expect.stringContaining("Payment record not found"),
        },
      });
    });
  });

  describe("handlePaymentIntentSucceeded", () => {
    const mockPaymentIntentSucceeded = {
      id: "evt_test",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_test_123",
          amount: 1000,
          currency: "jpy",
        },
      },
    } as Stripe.PaymentIntentSucceededEvent;

    it("決済成功イベントを正常に処理する", async () => {
      const mockPayment = {
        id: "pay_test_123",
        attendance_id: "att_test_123",
        status: "pending",
        stripe_payment_intent_id: "pi_test_123",
      };

      const mockAttendance = {
        event_id: "evt_test_123",
      };

      // データベースクエリのモック設定
      mockSupabase.from
        .mockReturnValueOnce({
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: mockPayment,
                error: null,
              }),
            })),
          })),
        })
        .mockReturnValueOnce({
          update: jest.fn(() => ({
            eq: jest.fn().mockResolvedValue({
              error: null,
            }),
          })),
        })
        .mockReturnValueOnce({
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: mockAttendance,
                error: null,
              }),
            })),
          })),
        });

      mockSupabase.rpc.mockResolvedValue({ error: null });

      const result = await handler.handleEvent(mockPaymentIntentSucceeded);

      expect(result.success).toBe(true);
      expect(mockSecurityReporter.logSecurityEvent).toHaveBeenCalledWith({
        type: "webhook_payment_succeeded_processed",
        details: {
          eventId: "evt_test",
          paymentId: "pay_test_123",
          amount: 1000,
          currency: "jpy",
        },
      });
    });

    it("既に処理済みの決済の重複処理を防ぐ", async () => {
      const mockPayment = {
        id: "pay_test_123",
        status: "paid", // 既に処理済み
        stripe_payment_intent_id: "pi_test_123",
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({
              data: mockPayment,
              error: null,
            }),
          })),
        })),
      });

      const result = await handler.handleEvent(mockPaymentIntentSucceeded);

      expect(result.success).toBe(true);
      expect(mockSecurityReporter.logSecurityEvent).toHaveBeenCalledWith({
        type: "webhook_duplicate_processing_prevented",
        details: {
          eventId: "evt_test",
          paymentId: "pay_test_123",
          currentStatus: "paid",
        },
      });
    });

    it("決済レコードが見つからない場合のエラー処理", async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: "No rows returned" },
            }),
          })),
        })),
      });

      const result = await handler.handleEvent(mockPaymentIntentSucceeded);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Payment record not found");
    });

    it("売上集計の更新が失敗しても決済処理は成功とする", async () => {
      const mockPayment = {
        id: "pay_test_123",
        attendance_id: "att_test_123",
        status: "pending",
        stripe_payment_intent_id: "pi_test_123",
      };

      const mockAttendance = {
        event_id: "evt_test_123",
      };

      mockSupabase.from
        .mockReturnValueOnce({
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: mockPayment,
                error: null,
              }),
            })),
          })),
        })
        .mockReturnValueOnce({
          update: jest.fn(() => ({
            eq: jest.fn().mockResolvedValue({
              error: null,
            }),
          })),
        })
        .mockReturnValueOnce({
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: mockAttendance,
                error: null,
              }),
            })),
          })),
        });

      // RPC関数の実行が失敗
      mockSupabase.rpc.mockResolvedValue({
        error: { message: "RPC function failed" },
      });

      const result = await handler.handleEvent(mockPaymentIntentSucceeded);

      expect(result.success).toBe(true); // 決済処理自体は成功
      expect(mockSecurityReporter.logSecurityEvent).toHaveBeenCalledWith({
        type: "webhook_revenue_update_failed",
        details: {
          eventId: "evt_test",
          paymentId: "pay_test_123",
          eventIdForRevenue: "evt_test_123",
          error: "RPC function failed",
        },
      });
    });
  });

  describe("handlePaymentIntentFailed", () => {
    const mockPaymentIntentFailed = {
      id: "evt_test",
      type: "payment_intent.payment_failed",
      data: {
        object: {
          id: "pi_test_123",
          amount: 1000,
          currency: "jpy",
          last_payment_error: {
            message: "Your card was declined.",
          },
        },
      },
    } as Stripe.PaymentIntentPaymentFailedEvent;

    it("決済失敗イベントを正常に処理する", async () => {
      const mockPayment = {
        id: "pay_test_123",
        status: "pending",
        stripe_payment_intent_id: "pi_test_123",
      };

      mockSupabase.from
        .mockReturnValueOnce({
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: mockPayment,
                error: null,
              }),
            })),
          })),
        })
        .mockReturnValueOnce({
          update: jest.fn(() => ({
            eq: jest.fn().mockResolvedValue({
              error: null,
            }),
          })),
        });

      const result = await handler.handleEvent(mockPaymentIntentFailed);

      expect(result.success).toBe(true);
      expect(mockSecurityReporter.logSecurityEvent).toHaveBeenCalledWith({
        type: "webhook_payment_failed_processed",
        details: {
          eventId: "evt_test",
          paymentId: "pay_test_123",
          failureReason: "Your card was declined.",
          amount: 1000,
          currency: "jpy",
        },
      });
    });

    it("既に失敗ステータスの決済の重複処理を防ぐ", async () => {
      const mockPayment = {
        id: "pay_test_123",
        status: "failed", // 既に失敗ステータス
        stripe_payment_intent_id: "pi_test_123",
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({
              data: mockPayment,
              error: null,
            }),
          })),
        })),
      });

      const result = await handler.handleEvent(mockPaymentIntentFailed);

      expect(result.success).toBe(true);
      expect(mockSecurityReporter.logSecurityEvent).toHaveBeenCalledWith({
        type: "webhook_duplicate_processing_prevented",
        details: {
          eventId: "evt_test",
          paymentId: "pay_test_123",
          currentStatus: "failed",
        },
      });
    });

    it("失敗理由が不明な場合のデフォルトメッセージ", async () => {
      const mockPaymentIntentFailedNoReason = {
        ...mockPaymentIntentFailed,
        data: {
          object: {
            ...mockPaymentIntentFailed.data.object,
            last_payment_error: null,
          },
        },
      } as Stripe.PaymentIntentPaymentFailedEvent;

      const mockPayment = {
        id: "pay_test_123",
        status: "pending",
        stripe_payment_intent_id: "pi_test_123",
      };

      mockSupabase.from
        .mockReturnValueOnce({
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: mockPayment,
                error: null,
              }),
            })),
          })),
        })
        .mockReturnValueOnce({
          update: jest.fn(() => ({
            eq: jest.fn().mockResolvedValue({
              error: null,
            }),
          })),
        });

      const result = await handler.handleEvent(mockPaymentIntentFailedNoReason);

      expect(result.success).toBe(true);
      expect(mockSecurityReporter.logSecurityEvent).toHaveBeenCalledWith({
        type: "webhook_payment_failed_processed",
        details: {
          eventId: "evt_test",
          paymentId: "pay_test_123",
          failureReason: "Unknown payment failure",
          amount: 1000,
          currency: "jpy",
        },
      });
    });
  });

  describe("handleTransferCreated", () => {
    const mockTransferCreated = {
      id: "evt_test",
      type: "transfer.created",
      data: {
        object: {
          id: "tr_test_123",
          amount: 1000,
          currency: "jpy",
          destination: "acct_test_123",
        },
      },
    } as Stripe.TransferCreatedEvent;

    it("送金作成イベントを正常に処理する", async () => {
      const mockPayout = {
        id: "payout_test_123",
        status: "pending",
        stripe_transfer_id: null,
      };

      mockSupabase.from
        .mockReturnValueOnce({
          select: jest.fn(() => ({
            limit: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: mockPayout,
                  error: null,
                }),
              })),
            })),
          })),
        })
        .mockReturnValueOnce({
          update: jest.fn(() => ({
            eq: jest.fn().mockResolvedValue({
              error: null,
            }),
          })),
        });

      const result = await handler.handleEvent(mockTransferCreated);

      expect(result.success).toBe(true);
      expect(mockSecurityReporter.logSecurityEvent).toHaveBeenCalledWith({
        type: "webhook_transfer_created_processed",
        details: {
          eventId: "evt_test",
          payoutId: "payout_test_123",
          transferId: "tr_test_123",
          amount: 1000,
          currency: "jpy",
        },
      });
    });

    it("既に完了済みの送金の重複処理を防ぐ", async () => {
      const mockPayout = {
        id: "payout_test_123",
        status: "completed", // 既に完了済み
        stripe_transfer_id: "tr_test_123",
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          limit: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn().mockResolvedValue({
                data: mockPayout,
                error: null,
              }),
            })),
          })),
        })),
      });

      const result = await handler.handleEvent(mockTransferCreated);

      expect(result.success).toBe(true);
      expect(mockSecurityReporter.logSecurityEvent).toHaveBeenCalledWith({
        type: "webhook_duplicate_processing_prevented",
        details: {
          eventId: "evt_test",
          payoutId: "payout_test_123",
          currentStatus: "completed",
        },
      });
    });

    it("関連する送金レコードが見つからない場合", async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          limit: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            })),
          })),
        })),
      });

      const result = await handler.handleEvent(mockTransferCreated);

      expect(result.success).toBe(true);
      expect(mockSecurityReporter.logSecurityEvent).toHaveBeenCalledWith({
        type: "webhook_transfer_no_payout_record",
        details: {
          eventId: "evt_test",
          transferId: "tr_test_123",
          transferGroup: undefined,
        },
      });
    });
  });

  describe("handleTransferUpdated", () => {
    const mockTransferUpdated = {
      id: "evt_test",
      type: "transfer.updated",
      data: {
        object: {
          id: "tr_test_123",
          amount: 1000,
          currency: "jpy",
        },
      },
    } as Stripe.TransferUpdatedEvent;

    it("送金更新イベントを正常に処理する", async () => {
      const mockPayout = {
        id: "payout_test_123",
        status: "completed",
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockPayout,
              error: null,
            }),
          })),
        })),
      });

      const result = await handler.handleEvent(mockTransferUpdated);

      expect(result.success).toBe(true);
      expect(mockSecurityReporter.logSecurityEvent).toHaveBeenCalledWith({
        type: "webhook_transfer_updated_processed",
        details: {
          eventId: "evt_test",
          payoutId: "payout_test_123",
          transferId: "tr_test_123",
          currentPayoutStatus: "completed",
        },
      });
    });

    it("関連する送金レコードが見つからない場合", async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          })),
        })),
      });

      const result = await handler.handleEvent(mockTransferUpdated);

      expect(result.success).toBe(true);
      expect(mockSecurityReporter.logSecurityEvent).toHaveBeenCalledWith({
        type: "webhook_transfer_updated_no_payout",
        details: {
          eventId: "evt_test",
          transferId: "tr_test_123",
        },
      });
    });
  });

  describe("handleTransferReversed", () => {
    const mockTransferReversed = {
      id: "evt_test",
      type: "transfer.reversed",
      data: {
        object: {
          id: "tr_test_123",
          amount: 1000,
          currency: "jpy",
          reversals: {
            data: [
              {
                reason: "fraudulent",
              },
            ],
          },
        },
      },
    } as Stripe.TransferReversedEvent;

    it("送金リバーサルイベントを正常に処理する", async () => {
      const mockPayout = {
        id: "payout_test_123",
        status: "completed",
      };

      mockSupabase.from
        .mockReturnValueOnce({
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn().mockResolvedValue({
                data: mockPayout,
                error: null,
              }),
            })),
          })),
        })
        .mockReturnValueOnce({
          update: jest.fn(() => ({
            eq: jest.fn().mockResolvedValue({
              error: null,
            }),
          })),
        });

      const result = await handler.handleEvent(mockTransferReversed);

      expect(result.success).toBe(true);
      expect(mockSecurityReporter.logSecurityEvent).toHaveBeenCalledWith({
        type: "webhook_transfer_reversed_processed",
        details: {
          eventId: "evt_test",
          payoutId: "payout_test_123",
          transferId: "tr_test_123",
          reversalReason: "fraudulent",
          amount: 1000,
          currency: "jpy",
        },
      });
    });

    it("既に失敗済みの送金の重複処理を防ぐ", async () => {
      const mockPayout = {
        id: "payout_test_123",
        status: "failed", // 既に失敗済み
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockPayout,
              error: null,
            }),
          })),
        })),
      });

      const result = await handler.handleEvent(mockTransferReversed);

      expect(result.success).toBe(true);
      expect(mockSecurityReporter.logSecurityEvent).toHaveBeenCalledWith({
        type: "webhook_duplicate_processing_prevented",
        details: {
          eventId: "evt_test",
          payoutId: "payout_test_123",
          currentStatus: "failed",
        },
      });
    });

    it("関連する送金レコードが見つからない場合", async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          })),
        })),
      });

      const result = await handler.handleEvent(mockTransferReversed);

      expect(result.success).toBe(true);
      expect(mockSecurityReporter.logSecurityEvent).toHaveBeenCalledWith({
        type: "webhook_transfer_reversed_no_payout",
        details: {
          eventId: "evt_test",
          transferId: "tr_test_123",
        },
      });
    });
  });

});
