export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ENUM型の定義
export type EventStatus = "upcoming" | "ongoing" | "past" | "cancelled";
export type PaymentMethod = "stripe" | "cash" | "free";
export type PaymentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "received"
  | "completed"
  | "refunded"
  | "waived";
export type AttendanceStatus = "attending" | "not_attending" | "maybe";
export type StripeAccountStatus =
  | "unverified"
  | "onboarding"
  | "verified"
  | "restricted";
export type PayoutStatus = "pending" | "processing" | "completed" | "failed";

// データベーステーブル型
export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          created_by: string;
          title: string;
          date: string;
          location: string | null;
          fee: number;
          capacity: number | null;
          description: string | null;
          registration_deadline: string | null;
          payment_deadline: string | null;
          payment_methods: PaymentMethod[];
          invite_token: string;
          status: EventStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          created_by: string;
          title: string;
          date: string;
          location?: string | null;
          fee: number;
          capacity?: number | null;
          description?: string | null;
          registration_deadline?: string | null;
          payment_deadline?: string | null;
          payment_methods: PaymentMethod[];
          invite_token: string;
          status?: EventStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          created_by?: string;
          title?: string;
          date?: string;
          location?: string | null;
          fee?: number;
          capacity?: number | null;
          description?: string | null;
          registration_deadline?: string | null;
          payment_deadline?: string | null;
          payment_methods?: PaymentMethod[];
          invite_token?: string;
          status?: EventStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      attendances: {
        Row: {
          id: string;
          event_id: string;
          nickname: string;
          email: string | null;
          status: AttendanceStatus;
          guest_token: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          nickname: string;
          email?: string | null;
          status: AttendanceStatus;
          guest_token?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          nickname?: string;
          email?: string | null;
          status?: AttendanceStatus;
          guest_token?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendances_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          }
        ];
      };
      payments: {
        Row: {
          id: string;
          attendance_id: string;
          method: PaymentMethod;
          amount: number;
          status: PaymentStatus;
          stripe_payment_intent_id: string | null;
          webhook_event_id: string | null;
          webhook_processed_at: string | null;
          paid_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          attendance_id: string;
          method: PaymentMethod;
          amount: number;
          status: PaymentStatus;
          stripe_payment_intent_id?: string | null;
          webhook_event_id?: string | null;
          webhook_processed_at?: string | null;
          paid_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          attendance_id?: string;
          method?: PaymentMethod;
          amount?: number;
          status?: PaymentStatus;
          stripe_payment_intent_id?: string | null;
          webhook_event_id?: string | null;
          webhook_processed_at?: string | null;
          paid_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_attendance_id_fkey";
            columns: ["attendance_id"];
            isOneToOne: true;
            referencedRelation: "attendances";
            referencedColumns: ["id"];
          }
        ];
      };
      stripe_connect_accounts: {
        Row: {
          user_id: string;
          stripe_account_id: string;
          status: StripeAccountStatus;
          charges_enabled: boolean;
          payouts_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          stripe_account_id: string;
          status?: StripeAccountStatus;
          charges_enabled?: boolean;
          payouts_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          stripe_account_id?: string;
          status?: StripeAccountStatus;
          charges_enabled?: boolean;
          payouts_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stripe_connect_accounts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      payouts: {
        Row: {
          id: string;
          event_id: string;
          user_id: string;
          total_stripe_sales: number;
          total_stripe_fee: number;
          platform_fee: number;
          net_payout_amount: number;
          status: PayoutStatus;
          stripe_transfer_id: string | null;
          webhook_event_id: string | null;
          webhook_processed_at: string | null;
          processed_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          user_id: string;
          total_stripe_sales: number;
          total_stripe_fee: number;
          platform_fee: number;
          net_payout_amount: number;
          status?: PayoutStatus;
          stripe_transfer_id?: string | null;
          webhook_event_id?: string | null;
          webhook_processed_at?: string | null;
          processed_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          user_id?: string;
          total_stripe_sales?: number;
          total_stripe_fee?: number;
          platform_fee?: number;
          net_payout_amount?: number;
          status?: PayoutStatus;
          stripe_transfer_id?: string | null;
          webhook_event_id?: string | null;
          webhook_processed_at?: string | null;
          processed_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payouts_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payouts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      public_profiles: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      get_event_creator_name: {
        Args: {
          event_id: string;
        };
        Returns: string;
      };
      process_payment_webhook_atomic: {
        Args: {
          payment_intent_id: string;
          webhook_event_id: string;
          amount_received: number;
          processed_at: string;
        };
        Returns: undefined;
      };
      process_payout_webhook_atomic: {
        Args: {
          stripe_transfer_id: string;
          webhook_event_id: string;
          processed_at: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      attendance_status_enum: AttendanceStatus;
      event_status_enum: EventStatus;
      payment_method_enum: PaymentMethod;
      payment_status_enum: PaymentStatus;
      payout_status_enum: PayoutStatus;
      stripe_account_status_enum: StripeAccountStatus;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
