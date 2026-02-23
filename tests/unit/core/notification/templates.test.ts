import {
  buildAdminContactNoticeTemplate,
  buildEventStartReminderTemplate,
  buildParticipationRegisteredTemplate,
  buildResponseDeadlineReminderTemplate,
} from "@core/notification/templates";

describe("core/notification/templates", () => {
  test("参加登録テンプレートはJST固定書式で日時を表示する", () => {
    const template = buildParticipationRegisteredTemplate({
      nickname: "田中",
      eventTitle: "新年会",
      eventDate: "2025-01-02T03:04:00.000Z",
      attendanceStatus: "attending",
      guestUrl: "https://example.com/guest",
    });

    expect(template.text).toContain("開催日時: 2025年1月2日 12:04");
    expect(template.html).toContain("2025年1月2日 12:04");
  });

  test("開催リマインダーテンプレートは曜日付きJST固定書式で日時を表示する", () => {
    const template = buildEventStartReminderTemplate({
      nickname: "田中",
      eventTitle: "新年会",
      eventDate: "2025-01-02T03:04:00.000Z",
      eventLocation: "東京",
      eventDescription: null,
      guestUrl: "https://example.com/guest",
    });

    expect(template.text).toContain("日時: 2025年1月2日(木) 12:04");
    expect(template.html).toContain("2025年1月2日(木) 12:04");
  });

  test("参加期限リマインダーテンプレートはJSTスラッシュ書式で日時を表示する", () => {
    const template = buildResponseDeadlineReminderTemplate({
      nickname: "田中",
      eventTitle: "新年会",
      eventDate: "2025-01-02T03:04:00.000Z",
      eventLocation: "東京",
      responseDeadline: "2025-01-03T10:20:00.000Z",
      guestUrl: "https://example.com/guest",
    });

    expect(template.text).toContain("日時: 2025/01/02 12:04");
    expect(template.text).toContain("参加期限: 2025/01/03 19:20");
    expect(template.html).toContain("2025/01/02 12:04");
    expect(template.html).toContain("2025/01/03 19:20");
  });

  test("不正な日付文字列は入力値をそのまま表示する", () => {
    const template = buildParticipationRegisteredTemplate({
      nickname: "田中",
      eventTitle: "新年会",
      eventDate: "invalid-date",
      attendanceStatus: "attending",
      guestUrl: "https://example.com/guest",
    });

    expect(template.text).toContain("開催日時: invalid-date");
    expect(template.html).toContain("invalid-date");
  });

  test("不正なDateはハイフンで表示する", () => {
    const template = buildAdminContactNoticeTemplate({
      name: "田中",
      email: "tanaka@example.com",
      messageExcerpt: "test",
      receivedAt: new Date(Number.NaN),
    });

    expect(template.text).toContain("受信日時: - (JST)");
    expect(template.html).toContain("- (JST)");
  });
});
