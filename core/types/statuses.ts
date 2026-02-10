import type { Database } from "@/types/database";

export type EventStatus = "upcoming" | "ongoing" | "past" | "canceled";

export type PaymentMethod = Database["public"]["Enums"]["payment_method_enum"];
export type PaymentStatus = Database["public"]["Enums"]["payment_status_enum"];
export type AttendanceStatus = Database["public"]["Enums"]["attendance_status_enum"];
export type StripeAccountStatus = Database["public"]["Enums"]["stripe_account_status_enum"];
