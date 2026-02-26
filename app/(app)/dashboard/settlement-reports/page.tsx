import React from "react";

import { redirect } from "next/navigation";

import { getCurrentUserForServerComponent } from "@core/auth/auth-utils";
import { createServerComponentSupabaseClient } from "@core/supabase/factory";
import { deriveEventStatus } from "@core/utils/derive-event-status";

import { SettlementReportGenerator, SettlementReportList } from "@features/settlements";
import { SettlementReportService } from "@features/settlements/server";

import {
  exportSettlementReportsAction,
  generateSettlementReportAction,
  getSettlementReportsAction,
  regenerateAfterRefundAction,
} from "@/app/_actions/settlement-reports/actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const dynamic = "force-dynamic";

export default async function SettlementReportsPage() {
  const user = await getCurrentUserForServerComponent();
  if (!user?.id) {
    redirect("/login");
  }

  const supabase = await createServerComponentSupabaseClient();
  const service = new SettlementReportService(supabase);

  // 直近のレポートを初期表示（最大50件）
  const initialReports = await service.getSettlementReports({
    createdBy: user.id,
    limit: 50,
    offset: 0,
  });

  // イベント選択肢（イベント名・日付・状態）
  const { data: events } = await supabase
    .from("events")
    .select("id, title, date, canceled_at")
    .eq("created_by", user.id)
    .order("date", { ascending: false })
    .limit(200);

  const existingReportEventIds = new Set(initialReports.map((report) => report.eventId));
  const generatorAvailableEvents = (events ?? []).map((event) => ({
    id: event.id,
    title: event.title,
    date: event.date,
    status: deriveEventStatus(event.date, event.canceled_at ?? null),
    hasExistingReport: existingReportEventIds.has(event.id),
  }));
  const listAvailableEvents = generatorAvailableEvents.map((event) => ({
    id: event.id,
    title: event.title,
    date: event.date,
  }));

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">清算レポート</h1>
        <p className="text-muted-foreground">イベント清算レポートを管理します</p>
      </div>

      <Tabs defaultValue="reports" className="space-y-6">
        <TabsList>
          <TabsTrigger value="reports">レポート一覧</TabsTrigger>
          <TabsTrigger value="generate">レポート生成</TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="space-y-6">
          <SettlementReportList
            initialReports={initialReports}
            availableEvents={listAvailableEvents}
            onGetReports={getSettlementReportsAction}
            onExportReports={exportSettlementReportsAction}
            onRegenerateReport={regenerateAfterRefundAction}
          />
        </TabsContent>

        <TabsContent value="generate" className="space-y-6">
          <SettlementReportGenerator
            availableEvents={generatorAvailableEvents}
            onGenerateReport={generateSettlementReportAction}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
