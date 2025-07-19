import type { Event } from "@/types/event";

export function createMockEvent(overrides: Partial<Event> = {}): Event {
  const baseEvent: Event = {
    id: `event-${Date.now()}`,
    title: "テストイベント",
    description: "テスト用のイベントです",
    date: new Date(Date.now() + 86400000).toISOString(), // 明日
    location: "テスト会場",
    fee: 1000,
    capacity: 50,
    status: "draft",
    payment_methods: ["stripe"],
    creator_id: "test-creator-id",
    creator_name: "テスト作成者",
    attendances_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };

  return baseEvent;
}

export function createMockEvents(count: number, startIndex: number = 1): Event[] {
  return Array.from({ length: count }, (_, i) => 
    createMockEvent({
      id: `event-${startIndex + i}`,
      title: `テストイベント ${startIndex + i}`,
      date: new Date(2024, 0, startIndex + i).toISOString(),
      location: `会場${startIndex + i}`,
      fee: (startIndex + i) * 1000,
      attendances_count: startIndex + i,
    })
  );
}

export function createMockUser(overrides: any = {}) {
  return {
    id: `user-${Date.now()}`,
    email: `test-${Date.now()}@example.com`,
    display_name: "テストユーザー",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

export function createMockFormData(data: Record<string, any>): FormData {
  const formData = new FormData();
  
  Object.entries(data).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      if (Array.isArray(value)) {
        value.forEach(item => formData.append(key, item));
      } else {
        formData.append(key, value.toString());
      }
    }
  });

  return formData;
}