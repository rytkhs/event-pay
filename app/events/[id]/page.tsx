import { getEventDetailAction } from "@/app/events/actions/get-event-detail";
import { EventDetail } from "@/components/events/event-detail";
import { EventActions } from "@/components/events/event-actions";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { sanitizeEventDescription } from "@/lib/utils/sanitize";

interface EventDetailPageProps {
  params: {
    id: string;
  };
}


// React.cacheの適切な初期化
const getCachedEventDetail =
  process.env.NODE_ENV === "production" ? cache(getEventDetailAction) : getEventDetailAction;

export default async function EventDetailPage({ params }: EventDetailPageProps) {
  try {
    if (!params?.id) {
      notFound();
    }

    const eventDetail = await getCachedEventDetail(params.id);

    if (!eventDetail) {
      notFound();
    }

    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">イベント詳細</h1>
            </div>
            <EventActions eventId={params.id} />
          </div>

          <EventDetail event={eventDetail} />
        </div>
      </div>
    );
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Event not found") {
        notFound();
      }
      if (error.message === "Access denied") {
        redirect("/events/" + params.id + "/forbidden");
      }
      if (error.message === "Invalid event ID format") {
        notFound();
      }
    }
    throw error;
  }
}

// ページメタデータ生成（動的タイトル設定）
export async function generateMetadata({ params }: EventDetailPageProps) {
  try {
    const eventDetail = await getCachedEventDetail(params.id);
    if (!eventDetail) {
      return {
        title: "イベント詳細 - EventPay",
        description: "イベントの詳細情報",
      };
    }
    return {
      title: `${eventDetail.title} - EventPay`,
      description: sanitizeEventDescription(
        eventDetail.description || `${eventDetail.title}の詳細情報`
      ),
    };
  } catch {
    return {
      title: "イベント詳細 - EventPay",
      description: "イベントの詳細情報",
    };
  }
}
