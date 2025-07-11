import React, { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EventList } from "@/components/events/event-list";
import { EventLoading } from "@/components/events/event-loading";
import { EventError } from "@/components/events/event-error";
import { Button } from "@/components/ui/button";
import { getEventsAction } from "./actions";

async function EventsContent() {
  const result = await getEventsAction();
  
  if (!result.success) {
    console.error("イベント一覧取得エラー:", result.error);
    
    // 認証エラーの場合はログインページにリダイレクト
    if (result.error.includes("認証")) {
      redirect('/auth/login');
    }
    
    // その他のエラー
    return (
      <EventError 
        error={new Error(result.error)}
        reset={() => window.location.reload()}
      />
    );
  }
  
  return <EventList events={result.data} />;
}

export default async function EventsPage() {
  return (
    <div data-testid="events-page-container" className="container mx-auto px-4 py-8">
      <div data-testid="events-page-header" className="mb-8">
        <h1 className="text-3xl font-bold">イベント一覧</h1>
        <Button asChild className="mt-4">
          <Link href="/events/create">
            新しいイベントを作成
          </Link>
        </Button>
      </div>
      
      <Suspense fallback={<EventLoading />}>
        <EventsContent />
      </Suspense>
    </div>
  );
}
