import { randomUUID } from "node:crypto";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { fail, ok } from "@core/errors/adapters/server-actions";
import type { ParticipantView } from "@core/validation/participant-management";

import {
  ParticipantsTableV2,
  type ParticipantsTableV2Props,
} from "@/app/(app)/events/[id]/participants/components/participants-table-v2/ParticipantsTableV2";
import type { EventManagementQuery } from "@/app/(app)/events/[id]/query-params";
import { MobileChromeProvider } from "@/components/layout/mobile-chrome-context";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  toast: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(mocks.toast, { error: mocks.toastError }),
}));

const query: EventManagementQuery = {
  tab: "participants",
  search: "",
  attendance: "all",
  smart: false,
  page: 1,
  limit: 150,
};

function createParticipant(overrides: Partial<ParticipantView> = {}): ParticipantView {
  const paymentId = overrides.payment_id ?? randomUUID();
  const attendanceId = overrides.attendance_id ?? randomUUID();
  return {
    attendance_id: attendanceId,
    nickname: "テスト参加者",
    email: "participant@example.com",
    status: "attending",
    attendance_created_at: "2026-01-01T00:00:00.000Z",
    attendance_updated_at: "2026-01-01T00:00:00.000Z",
    payment_id: paymentId,
    payment_method: "cash",
    payment_status: "pending",
    amount: 1000,
    paid_at: null,
    payment_version: 1,
    payment_created_at: "2026-01-01T00:00:00.000Z",
    payment_updated_at: "2026-01-01T00:00:00.000Z",
    can_delete_mistaken_attendance: false,
    ...overrides,
  };
}

function renderTable(
  participants: ParticipantView[],
  options: {
    updateCashStatusAction?: ParticipantsTableV2Props["updateCashStatusAction"];
    bulkUpdateCashStatusAction?: ParticipantsTableV2Props["bulkUpdateCashStatusAction"];
    isSelectionMode?: boolean;
  } = {}
) {
  const updateCashStatusAction =
    options.updateCashStatusAction ??
    (async () => fail("INTERNAL_ERROR", { userMessage: "テスト未設定" }));
  const bulkUpdateCashStatusAction =
    options.bulkUpdateCashStatusAction ??
    (async () =>
      ok({
        successCount: 0,
        failedCount: 0,
        failures: [],
      }));

  return render(
    <MobileChromeProvider>
      <ParticipantsTableV2
        eventId={randomUUID()}
        eventFee={1000}
        eventStatus="upcoming"
        eventPaymentMethods={["cash"]}
        allParticipants={participants}
        query={query}
        onParamsChange={vi.fn()}
        adminUpdateAttendanceStatusAction={vi.fn()}
        deleteMistakenAttendanceAction={vi.fn()}
        updateCashStatusAction={updateCashStatusAction}
        bulkUpdateCashStatusAction={bulkUpdateCashStatusAction}
        isSelectionMode={options.isSelectionMode}
      />
    </MobileChromeProvider>
  );
}

describe("ParticipantsTableV2のPayment version連携", () => {
  beforeEach(() => {
    mocks.refresh.mockReset();
    mocks.toast.mockReset();
    mocks.toastError.mockReset();
    window.localStorage.clear();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
  });

  test("単件更新に表示時versionを渡し、競合時に楽観表示を戻してrefreshする", async () => {
    const participant = createParticipant({ nickname: "単件参加者", payment_version: 7 });
    const updateCashStatusAction = vi.fn(async () =>
      fail("RESOURCE_CONFLICT", { userMessage: "競合しました" })
    );

    renderTable([participant], { updateCashStatusAction });

    const receiveButton = await screen.findByRole("button", {
      name: "単件参加者を受領済みにする",
    });
    await userEvent.click(receiveButton);

    await waitFor(() => expect(updateCashStatusAction).toHaveBeenCalledOnce());
    expect(updateCashStatusAction).toHaveBeenCalledWith({
      paymentId: participant.payment_id,
      expectedVersion: 7,
      status: "received",
    });
    expect(await screen.findByText("未集金")).toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalled();
  });

  test.each([
    { status: "received" as const, buttonName: /受領する/, successLabel: "集金済" },
    { status: "waived" as const, buttonName: /免除する/, successLabel: "免除" },
  ])(
    "一括$status更新はPaymentごとのversionを渡し、競合した行だけを戻す",
    async ({ status, buttonName, successLabel }) => {
      const stale = createParticipant({ nickname: "競合参加者", payment_version: 3 });
      const valid = createParticipant({ nickname: "成功参加者", payment_version: 8 });
      const bulkUpdateCashStatusAction = vi.fn(async () =>
        ok({
          successCount: 1,
          failedCount: 1,
          failures: [
            {
              paymentId: stale.payment_id as string,
              code: "RESOURCE_CONFLICT" as const,
              error: "競合しました",
            },
          ],
        })
      );

      renderTable([stale, valid], { bulkUpdateCashStatusAction, isSelectionMode: true });

      await userEvent.click((await screen.findAllByRole("checkbox"))[0]);
      await userEvent.click((await screen.findAllByRole("checkbox"))[1]);
      await userEvent.click(await screen.findByRole("button", { name: buttonName }));

      await waitFor(() => expect(bulkUpdateCashStatusAction).toHaveBeenCalledOnce());
      expect(bulkUpdateCashStatusAction).toHaveBeenCalledWith({
        payments: [
          { paymentId: stale.payment_id, expectedVersion: 3 },
          { paymentId: valid.payment_id, expectedVersion: 8 },
        ],
        status,
      });
      expect(await screen.findByText("未集金")).toBeInTheDocument();
      expect(await screen.findByText(successLabel)).toBeInTheDocument();
      expect(mocks.refresh).toHaveBeenCalled();
    }
  );

  test("取消に表示時versionを渡し、競合時に楽観表示を戻してrefreshする", async () => {
    const participant = createParticipant({
      nickname: "取消参加者",
      payment_status: "received",
      payment_version: 11,
    });
    const updateCashStatusAction = vi.fn(async () =>
      fail("RESOURCE_CONFLICT", { userMessage: "競合しました" })
    );

    renderTable([participant], { updateCashStatusAction });

    await userEvent.click(
      await screen.findByRole("button", { name: "取消参加者の操作メニューを開く" })
    );
    await userEvent.click(await screen.findByRole("menuitem", { name: "受領を取り消し" }));

    await waitFor(() => expect(updateCashStatusAction).toHaveBeenCalledOnce());
    expect(updateCashStatusAction).toHaveBeenCalledWith({
      paymentId: participant.payment_id,
      expectedVersion: 11,
      status: "pending",
      isCancel: true,
      notes: "管理者による決済取り消し",
    });
    expect(await screen.findByText("集金済")).toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalled();
  });

  test("表示versionがないPaymentは受領操作の対象にしない", async () => {
    const participant = createParticipant({ payment_version: null });

    renderTable([participant]);

    await waitFor(() => expect(screen.queryByRole("button", { name: /受領済み/ })).toBeNull());
  });
});
