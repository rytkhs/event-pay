import React from "react";

import { redirect } from "next/navigation";

import { getCurrentUser } from "@core/auth/auth-utils";
import { createClient } from "@core/supabase/server";

import {
  SettlementReportList,
  SettlementReportService,
  exportSettlementReportsAction,
  getSettlementReportsAction,
  regenerateAfterRefundAction,
} from "@features/settlements";

export const dynamic = "force-dynamic";

export default async function SettlementReportsPage() {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  const supabase = createClient();
  const service = new SettlementReportService(supabase);

  // 直近のレポートを初期表示（最大50件）
  const initialReports = await service.getSettlementReports({
    createdBy: user.id,
    limit: 50,
    offset: 0,
  });

  // イベント選択肢（イベント名・日付）
  const { data: events } = await supabase
    .from("events")
    .select("id, title, date")
    .eq("created_by", user.id)
    .order("date", { ascending: false })
    .limit(200);

  const availableEvents = (events ?? []).map((e) => ({ id: e.id, title: e.title, date: e.date }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">清算レポート</h1>
      <SettlementReportList
        initialReports={initialReports}
        availableEvents={availableEvents}
        onGetReports={getSettlementReportsAction}
        onExportReports={exportSettlementReportsAction}
        onRegenerateReport={regenerateAfterRefundAction}
      />
    </div>
  );
}
