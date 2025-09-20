export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      attendances: {
        Row: {
          created_at: string;
          email: string;
          event_id: string;
          guest_token: string;
          id: string;
          nickname: string;
          status: Database["public"]["Enums"]["attendance_status_enum"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          event_id: string;
          guest_token: string;
          id?: string;
          nickname: string;
          status: Database["public"]["Enums"]["attendance_status_enum"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          event_id?: string;
          guest_token?: string;
          id?: string;
          nickname?: string;
          status?: Database["public"]["Enums"]["attendance_status_enum"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendances_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          allow_payment_after_deadline: boolean;
          canceled_at: string | null;
          canceled_by: string | null;
          capacity: number | null;
          created_at: string;
          created_by: string;
          date: string;
          description: string | null;
          fee: number;
          grace_period_days: number;
          id: string;
          invite_token: string | null;
          location: string | null;
          payment_deadline: string | null;
          payment_methods: Database["public"]["Enums"]["payment_method_enum"][];
          registration_deadline: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          allow_payment_after_deadline?: boolean;
          canceled_at?: string | null;
          canceled_by?: string | null;
          capacity?: number | null;
          created_at?: string;
          created_by: string;
          date: string;
          description?: string | null;
          fee?: number;
          grace_period_days?: number;
          id?: string;
          invite_token?: string | null;
          location?: string | null;
          payment_deadline?: string | null;
          payment_methods: Database["public"]["Enums"]["payment_method_enum"][];
          registration_deadline: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          allow_payment_after_deadline?: boolean;
          canceled_at?: string | null;
          canceled_by?: string | null;
          capacity?: number | null;
          created_at?: string;
          created_by?: string;
          date?: string;
          description?: string | null;
          fee?: number;
          grace_period_days?: number;
          id?: string;
          invite_token?: string | null;
          location?: string | null;
          payment_deadline?: string | null;
          payment_methods?: Database["public"]["Enums"]["payment_method_enum"][];
          registration_deadline?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "events_canceled_by_fkey";
            columns: ["canceled_by"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_canceled_by_fkey";
            columns: ["canceled_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      fee_config: {
        Row: {
          id: number;
          is_tax_included: boolean;
          max_platform_fee: number;
          min_payout_amount: number;
          min_platform_fee: number;
          platform_fee_rate: number;
          platform_fixed_fee: number;
          platform_tax_rate: number;
          stripe_base_rate: number;
          stripe_fixed_fee: number;
          updated_at: string;
        };
        Insert: {
          id?: number;
          is_tax_included?: boolean;
          max_platform_fee?: number;
          min_payout_amount?: number;
          min_platform_fee?: number;
          platform_fee_rate?: number;
          platform_fixed_fee?: number;
          platform_tax_rate?: number;
          stripe_base_rate?: number;
          stripe_fixed_fee?: number;
          updated_at?: string;
        };
        Update: {
          id?: number;
          is_tax_included?: boolean;
          max_platform_fee?: number;
          min_payout_amount?: number;
          min_platform_fee?: number;
          platform_fee_rate?: number;
          platform_fixed_fee?: number;
          platform_tax_rate?: number;
          stripe_base_rate?: number;
          stripe_fixed_fee?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      payment_disputes: {
        Row: {
          amount: number;
          charge_id: string | null;
          closed_at: string | null;
          created_at: string;
          currency: string;
          evidence_due_by: string | null;
          id: string;
          payment_id: string | null;
          payment_intent_id: string | null;
          reason: string | null;
          status: string;
          stripe_account_id: string | null;
          stripe_dispute_id: string;
          updated_at: string;
        };
        Insert: {
          amount: number;
          charge_id?: string | null;
          closed_at?: string | null;
          created_at?: string;
          currency?: string;
          evidence_due_by?: string | null;
          id?: string;
          payment_id?: string | null;
          payment_intent_id?: string | null;
          reason?: string | null;
          status: string;
          stripe_account_id?: string | null;
          stripe_dispute_id: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          charge_id?: string | null;
          closed_at?: string | null;
          created_at?: string;
          currency?: string;
          evidence_due_by?: string | null;
          id?: string;
          payment_id?: string | null;
          payment_intent_id?: string | null;
          reason?: string | null;
          status?: string;
          stripe_account_id?: string | null;
          stripe_dispute_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_disputes_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          application_fee_amount: number;
          application_fee_excl_tax: number;
          application_fee_id: string | null;
          application_fee_refund_id: string | null;
          application_fee_refunded_amount: number;
          application_fee_tax_amount: number;
          application_fee_tax_rate: number;
          attendance_id: string;
          checkout_idempotency_key: string | null;
          checkout_key_revision: number;
          created_at: string;
          destination_account_id: string | null;
          id: string;
          method: Database["public"]["Enums"]["payment_method_enum"];
          paid_at: string | null;
          refunded_amount: number;
          status: Database["public"]["Enums"]["payment_status_enum"];
          stripe_account_id: string | null;
          stripe_balance_transaction_fee: number | null;
          stripe_balance_transaction_id: string | null;
          stripe_balance_transaction_net: number | null;
          stripe_charge_id: string | null;
          stripe_checkout_session_id: string | null;
          stripe_customer_id: string | null;
          stripe_fee_details: Json | null;
          stripe_payment_intent_id: string | null;
          stripe_transfer_id: string | null;
          tax_included: boolean;
          transfer_group: string | null;
          updated_at: string;
          version: number;
          webhook_event_id: string | null;
          webhook_processed_at: string | null;
        };
        Insert: {
          amount: number;
          application_fee_amount?: number;
          application_fee_excl_tax?: number;
          application_fee_id?: string | null;
          application_fee_refund_id?: string | null;
          application_fee_refunded_amount?: number;
          application_fee_tax_amount?: number;
          application_fee_tax_rate?: number;
          attendance_id: string;
          checkout_idempotency_key?: string | null;
          checkout_key_revision?: number;
          created_at?: string;
          destination_account_id?: string | null;
          id?: string;
          method: Database["public"]["Enums"]["payment_method_enum"];
          paid_at?: string | null;
          refunded_amount?: number;
          status?: Database["public"]["Enums"]["payment_status_enum"];
          stripe_account_id?: string | null;
          stripe_balance_transaction_fee?: number | null;
          stripe_balance_transaction_id?: string | null;
          stripe_balance_transaction_net?: number | null;
          stripe_charge_id?: string | null;
          stripe_checkout_session_id?: string | null;
          stripe_customer_id?: string | null;
          stripe_fee_details?: Json | null;
          stripe_payment_intent_id?: string | null;
          stripe_transfer_id?: string | null;
          tax_included?: boolean;
          transfer_group?: string | null;
          updated_at?: string;
          version?: number;
          webhook_event_id?: string | null;
          webhook_processed_at?: string | null;
        };
        Update: {
          amount?: number;
          application_fee_amount?: number;
          application_fee_excl_tax?: number;
          application_fee_id?: string | null;
          application_fee_refund_id?: string | null;
          application_fee_refunded_amount?: number;
          application_fee_tax_amount?: number;
          application_fee_tax_rate?: number;
          attendance_id?: string;
          checkout_idempotency_key?: string | null;
          checkout_key_revision?: number;
          created_at?: string;
          destination_account_id?: string | null;
          id?: string;
          method?: Database["public"]["Enums"]["payment_method_enum"];
          paid_at?: string | null;
          refunded_amount?: number;
          status?: Database["public"]["Enums"]["payment_status_enum"];
          stripe_account_id?: string | null;
          stripe_balance_transaction_fee?: number | null;
          stripe_balance_transaction_id?: string | null;
          stripe_balance_transaction_net?: number | null;
          stripe_charge_id?: string | null;
          stripe_checkout_session_id?: string | null;
          stripe_customer_id?: string | null;
          stripe_fee_details?: Json | null;
          stripe_payment_intent_id?: string | null;
          stripe_transfer_id?: string | null;
          tax_included?: boolean;
          transfer_group?: string | null;
          updated_at?: string;
          version?: number;
          webhook_event_id?: string | null;
          webhook_processed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payments_attendance_id_fkey";
            columns: ["attendance_id"];
            isOneToOne: false;
            referencedRelation: "attendances";
            referencedColumns: ["id"];
          },
        ];
      };
      scheduler_locks: {
        Row: {
          acquired_at: string;
          created_at: string;
          expires_at: string;
          lock_name: string;
          metadata: Json | null;
          process_id: string | null;
        };
        Insert: {
          acquired_at?: string;
          created_at?: string;
          expires_at: string;
          lock_name: string;
          metadata?: Json | null;
          process_id?: string | null;
        };
        Update: {
          acquired_at?: string;
          created_at?: string;
          expires_at?: string;
          lock_name?: string;
          metadata?: Json | null;
          process_id?: string | null;
        };
        Relationships: [];
      };
      security_audit_log: {
        Row: {
          details: Json | null;
          event_type: string;
          id: number;
          ip_address: unknown | null;
          timestamp: string | null;
          user_role: string | null;
        };
        Insert: {
          details?: Json | null;
          event_type: string;
          id?: number;
          ip_address?: unknown | null;
          timestamp?: string | null;
          user_role?: string | null;
        };
        Update: {
          details?: Json | null;
          event_type?: string;
          id?: number;
          ip_address?: unknown | null;
          timestamp?: string | null;
          user_role?: string | null;
        };
        Relationships: [];
      };
      settlements: {
        Row: {
          created_at: string;
          dispute_count: number;
          event_id: string;
          generated_at: string | null;
          id: string;
          last_error: string | null;
          net_payout_amount: number;
          notes: string | null;
          platform_fee: number;
          processed_at: string | null;
          retry_count: number;
          stripe_account_id: string;
          total_disputed_amount: number;
          total_stripe_fee: number;
          total_stripe_sales: number;
          transfer_group: string | null;
          updated_at: string;
          user_id: string;
          webhook_event_id: string | null;
          webhook_processed_at: string | null;
        };
        Insert: {
          created_at?: string;
          dispute_count?: number;
          event_id: string;
          generated_at?: string | null;
          id?: string;
          last_error?: string | null;
          net_payout_amount?: number;
          notes?: string | null;
          platform_fee?: number;
          processed_at?: string | null;
          retry_count?: number;
          stripe_account_id: string;
          total_disputed_amount?: number;
          total_stripe_fee?: number;
          total_stripe_sales?: number;
          transfer_group?: string | null;
          updated_at?: string;
          user_id: string;
          webhook_event_id?: string | null;
          webhook_processed_at?: string | null;
        };
        Update: {
          created_at?: string;
          dispute_count?: number;
          event_id?: string;
          generated_at?: string | null;
          id?: string;
          last_error?: string | null;
          net_payout_amount?: number;
          notes?: string | null;
          platform_fee?: number;
          processed_at?: string | null;
          retry_count?: number;
          stripe_account_id?: string;
          total_disputed_amount?: number;
          total_stripe_fee?: number;
          total_stripe_sales?: number;
          transfer_group?: string | null;
          updated_at?: string;
          user_id?: string;
          webhook_event_id?: string | null;
          webhook_processed_at?: string | null;
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
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payouts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      stripe_connect_accounts: {
        Row: {
          charges_enabled: boolean;
          created_at: string;
          payouts_enabled: boolean;
          status: Database["public"]["Enums"]["stripe_account_status_enum"];
          stripe_account_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          charges_enabled?: boolean;
          created_at?: string;
          payouts_enabled?: boolean;
          status?: Database["public"]["Enums"]["stripe_account_status_enum"];
          stripe_account_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          charges_enabled?: boolean;
          created_at?: string;
          payouts_enabled?: boolean;
          status?: Database["public"]["Enums"]["stripe_account_status_enum"];
          stripe_account_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stripe_connect_accounts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stripe_connect_accounts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      system_logs: {
        Row: {
          created_at: string;
          details: Json | null;
          executed_at: string;
          id: number;
          operation_type: string;
        };
        Insert: {
          created_at?: string;
          details?: Json | null;
          executed_at?: string;
          id?: number;
          operation_type: string;
        };
        Update: {
          created_at?: string;
          details?: Json | null;
          executed_at?: string;
          id?: number;
          operation_type?: string;
        };
        Relationships: [];
      };
      users: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      public_profiles: {
        Row: {
          created_at: string | null;
          id: string | null;
          name: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string | null;
          name?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string | null;
          name?: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      calc_refund_dispute_summary: {
        Args: { p_event_id: string };
        Returns: Json;
      };
      calc_total_application_fee: {
        Args: { p_event_id: string };
        Returns: number;
      };
      calc_total_stripe_fee: {
        Args: { p_base_rate?: number; p_event_id: string; p_fixed_fee?: number };
        Returns: number;
      };
      can_access_attendance: {
        Args: { p_attendance_id: string };
        Returns: boolean;
      };
      can_access_event: {
        Args: { p_event_id: string };
        Returns: boolean;
      };
      can_manage_invite_links: {
        Args: { p_event_id: string };
        Returns: boolean;
      };
      cleanup_expired_scheduler_locks: {
        Args: Record<PropertyKey, never>;
        Returns: {
          deleted_count: number;
          expired_locks: Json;
        }[];
      };
      clear_test_guest_token: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      extend_scheduler_lock: {
        Args: {
          p_extend_minutes?: number;
          p_lock_name: string;
          p_process_id: string;
        };
        Returns: boolean;
      };
      find_eligible_events_basic: {
        Args: {
          p_days_after_event?: number;
          p_limit?: number;
          p_minimum_amount?: number;
          p_user_id?: string;
        };
        Returns: {
          created_at: string;
          created_by: string;
          event_date: string;
          event_id: string;
          fee: number;
          paid_attendances_count: number;
          title: string;
          total_stripe_sales: number;
        }[];
      };
      find_eligible_events_with_details: {
        Args: { p_days_after_event?: number; p_limit?: number };
        Returns: {
          charges_enabled: boolean;
          created_at: string;
          created_by: string;
          eligible: boolean;
          event_date: string;
          event_id: string;
          fee: number;
          ineligible_reason: string;
          net_payout_amount: number;
          paid_attendances_count: number;
          payouts_enabled: boolean;
          platform_fee: number;
          title: string;
          total_stripe_fee: number;
          total_stripe_sales: number;
        }[];
      };
      generate_settlement_report: {
        Args: { input_created_by: string; input_event_id: string };
        Returns: {
          already_exists: boolean;
          created_by: string;
          dispute_count: number;
          event_date: string;
          event_title: string;
          net_payout_amount: number;
          payment_count: number;
          refunded_count: number;
          report_generated_at: string;
          report_id: string;
          report_updated_at: string;
          returned_event_id: string;
          stripe_account_id: string;
          total_application_fee: number;
          total_disputed_amount: number;
          total_refunded_amount: number;
          total_stripe_fee: number;
          total_stripe_sales: number;
          transfer_group: string;
        }[];
      };
      get_event_creator_name: {
        Args: { p_creator_id: string };
        Returns: string;
      };
      get_guest_token: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      get_min_payout_amount: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      get_scheduler_lock_status: {
        Args: { p_lock_name?: string };
        Returns: {
          acquired_at: string;
          expires_at: string;
          is_expired: boolean;
          lock_name: string;
          metadata: Json;
          process_id: string;
          time_remaining_minutes: number;
        }[];
      };
      get_settlement_report_details: {
        Args: {
          input_created_by: string;
          input_event_ids?: string[];
          p_from_date?: string;
          p_limit?: number;
          p_offset?: number;
          p_to_date?: string;
        };
        Returns: {
          event_date: string;
          event_id: string;
          event_title: string;
          generated_at: string;
          net_payout_amount: number;
          payment_count: number;
          refunded_count: number;
          report_id: string;
          stripe_account_id: string;
          total_application_fee: number;
          total_refunded_amount: number;
          total_stripe_fee: number;
          total_stripe_sales: number;
          transfer_group: string;
        }[];
      };
      hash_guest_token: {
        Args: { token: string };
        Returns: string;
      };
      register_attendance_with_payment: {
        Args: {
          p_email: string;
          p_event_fee?: number;
          p_event_id: string;
          p_guest_token: string;
          p_nickname: string;
          p_payment_method?: Database["public"]["Enums"]["payment_method_enum"];
          p_status: Database["public"]["Enums"]["attendance_status_enum"];
        };
        Returns: string;
      };
      release_scheduler_lock: {
        Args: { p_lock_name: string; p_process_id?: string };
        Returns: boolean;
      };
      rpc_bulk_update_payment_status_safe: {
        Args: { p_notes?: string; p_payment_updates: Json; p_user_id: string };
        Returns: Json;
      };
      rpc_update_payment_status_safe: {
        Args: {
          p_expected_version: number;
          p_new_status: Database["public"]["Enums"]["payment_status_enum"];
          p_notes?: string;
          p_payment_id: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      set_test_guest_token: {
        Args: { token: string };
        Returns: undefined;
      };
      status_rank: {
        Args: { p: Database["public"]["Enums"]["payment_status_enum"] };
        Returns: number;
      };
      try_acquire_scheduler_lock: {
        Args: {
          p_lock_name: string;
          p_metadata?: Json;
          p_process_id?: string;
          p_ttl_minutes?: number;
        };
        Returns: boolean;
      };
      update_guest_attendance_with_payment: {
        Args: {
          p_attendance_id: string;
          p_event_fee?: number;
          p_payment_method?: Database["public"]["Enums"]["payment_method_enum"];
          p_status: Database["public"]["Enums"]["attendance_status_enum"];
        };
        Returns: undefined;
      };
      update_revenue_summary: {
        Args: { p_event_id: string };
        Returns: Json;
      };
    };
    Enums: {
      admin_reason_enum:
        | "user_cleanup"
        | "test_data_setup"
        | "system_maintenance"
        | "emergency_access"
        | "data_migration"
        | "security_investigation";
      attendance_status_enum: "attending" | "not_attending" | "maybe";
      payment_method_enum: "stripe" | "cash";
      payment_status_enum:
        | "pending"
        | "paid"
        | "failed"
        | "received"
        | "completed"
        | "refunded"
        | "waived";
      security_severity_enum: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      stripe_account_status_enum: "unverified" | "onboarding" | "verified" | "restricted";
      suspicious_activity_type_enum:
        | "EMPTY_RESULT_SET"
        | "ADMIN_ACCESS_ATTEMPT"
        | "INVALID_TOKEN_PATTERN"
        | "RATE_LIMIT_EXCEEDED"
        | "UNAUTHORIZED_RLS_BYPASS"
        | "BULK_DATA_ACCESS"
        | "UNUSUAL_ACCESS_PATTERN";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      admin_reason_enum: [
        "user_cleanup",
        "test_data_setup",
        "system_maintenance",
        "emergency_access",
        "data_migration",
        "security_investigation",
      ],
      attendance_status_enum: ["attending", "not_attending", "maybe"],
      payment_method_enum: ["stripe", "cash"],
      payment_status_enum: [
        "pending",
        "paid",
        "failed",
        "received",
        "completed",
        "refunded",
        "waived",
      ],
      security_severity_enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      stripe_account_status_enum: ["unverified", "onboarding", "verified", "restricted"],
      suspicious_activity_type_enum: [
        "EMPTY_RESULT_SET",
        "ADMIN_ACCESS_ATTEMPT",
        "INVALID_TOKEN_PATTERN",
        "RATE_LIMIT_EXCEEDED",
        "UNAUTHORIZED_RLS_BYPASS",
        "BULK_DATA_ACCESS",
        "UNUSUAL_ACCESS_PATTERN",
      ],
    },
  },
} as const;
