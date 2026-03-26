import { NextRequest } from "next/server";

const mockVerify = jest.fn();
const mockSendSlackText = jest.fn();
const mockCreateAuditedAdminClient = jest.fn();

jest.mock("@upstash/qstash", () => ({
  Receiver: jest.fn().mockImplementation(() => ({
    verify: (...args: unknown[]) => mockVerify(...args),
  })),
}));

jest.mock("@core/security/secure-client-factory.impl", () => ({
  createAuditedAdminClient: (...args: unknown[]) => mockCreateAuditedAdminClient(...args),
}));

jest.mock("@core/notification/slack", () => ({
  sendSlackText: (...args: unknown[]) => mockSendSlackText(...args),
}));

import { POST as EventCancelWorkerPOST } from "@/app/api/workers/event-cancel/route";

function createRequest(body: unknown): NextRequest {
  const url = new URL("http://localhost/api/workers/event-cancel");
  const headers = new Headers({
    "Upstash-Signature": "sig_test",
    "Upstash-Delivery-Id": "delivery_test_123",
  });

  return new NextRequest(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function createAdminClient() {
  const attendancesQuery = {
    select: jest.fn(),
    eq: jest.fn(),
    in: jest.fn(),
  } as any;
  attendancesQuery.select.mockReturnValue(attendancesQuery);
  attendancesQuery.eq.mockReturnValue(attendancesQuery);
  attendancesQuery.in.mockResolvedValue({
    data: [{ email: "a@example.com" }, { email: "b@example.com" }],
    error: null,
  });

  const eventsQuery = {
    select: jest.fn(),
    eq: jest.fn(),
    single: jest.fn(),
  } as any;
  eventsQuery.select.mockReturnValue(eventsQuery);
  eventsQuery.eq.mockReturnValue(eventsQuery);
  eventsQuery.single.mockResolvedValue({
    data: { title: "春合宿", community_id: "community-1" },
    error: null,
  });

  const communitiesQuery = {
    select: jest.fn(),
    eq: jest.fn(),
    maybeSingle: jest.fn(),
  } as any;
  communitiesQuery.select.mockReturnValue(communitiesQuery);
  communitiesQuery.eq.mockReturnValue(communitiesQuery);
  communitiesQuery.maybeSingle.mockResolvedValue({
    data: { name: "テストコミュニティ" },
    error: null,
  });

  return {
    from: jest.fn((table: string) => {
      if (table === "attendances") return attendancesQuery;
      if (table === "events") return eventsQuery;
      if (table === "communities") return communitiesQuery;
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

describe("/api/workers/event-cancel", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost";
    process.env.QSTASH_CURRENT_SIGNING_KEY = "test_current_key";
    process.env.QSTASH_NEXT_SIGNING_KEY = "test_next_key";

    mockVerify.mockResolvedValue(true);
    mockSendSlackText.mockResolvedValue({ success: true });
    mockCreateAuditedAdminClient.mockResolvedValue(createAdminClient());
  });

  it("Slack 通知に主催コミュニティ名を含める", async () => {
    const response = await EventCancelWorkerPOST(
      createRequest({ eventId: "event-1", message: "雨天中止" })
    );

    expect(response.status).toBe(204);
    expect(mockSendSlackText).toHaveBeenCalledTimes(1);
    expect(mockSendSlackText).toHaveBeenCalledWith(
      expect.stringContaining("主催コミュニティ: テストコミュニティ")
    );
    expect(mockSendSlackText).toHaveBeenCalledWith(expect.stringContaining("通知対象人数: 2人"));
  });
});
