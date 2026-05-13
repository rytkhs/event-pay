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
      communities: {
        Row: {
          created_at: string;
          created_by: string;
          current_payout_profile_id: string | null;
          deleted_at: string | null;
          description: string | null;
          id: string;
          is_deleted: boolean;
          legal_slug: string;
          name: string;
          show_community_link: boolean;
          show_legal_disclosure_link: boolean;
          slug: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          current_payout_profile_id?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          is_deleted?: boolean;
          legal_slug?: string;
          name: string;
          show_community_link?: boolean;
          show_legal_disclosure_link?: boolean;
          slug?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          current_payout_profile_id?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          is_deleted?: boolean;
          legal_slug?: string;
          name?: string;
          show_community_link?: boolean;
          show_legal_disclosure_link?: boolean;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "communities_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "communities_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "communities_current_payout_profile_id_fkey";
            columns: ["current_payout_profile_id"];
            isOneToOne: false;
            referencedRelation: "payout_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      community_contacts: {
        Row: {
          community_id: string;
          created_at: string;
          email: string;
          fingerprint_hash: string;
          id: string;
          ip_hash: string | null;
          message: string;
          name: string;
          user_agent: string | null;
        };
        Insert: {
          community_id: string;
          created_at?: string;
          email: string;
          fingerprint_hash: string;
          id?: string;
          ip_hash?: string | null;
          message: string;
          name: string;
          user_agent?: string | null;
        };
        Update: {
          community_id?: string;
          created_at?: string;
          email?: string;
          fingerprint_hash?: string;
          id?: string;
          ip_hash?: string | null;
          message?: string;
          name?: string;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "community_contacts_community_id_fkey";
            columns: ["community_id"];
            isOneToOne: false;
            referencedRelation: "communities";
            referencedColumns: ["id"];
          },
        ];
      };
      contacts: {
        Row: {
          created_at: string;
          email: string;
          fingerprint_hash: string;
          id: string;
          ip_hash: string | null;
          message: string;
          name: string;
          user_agent: string | null;
        };
        Insert: {
          created_at?: string;
          email: string;
          fingerprint_hash: string;
          id?: string;
          ip_hash?: string | null;
          message: string;
          name: string;
          user_agent?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string;
          fingerprint_hash?: string;
          id?: string;
          ip_hash?: string | null;
          message?: string;
          name?: string;
          user_agent?: string | null;
        };
        Relationships: [];
      };
      events: {
        Row: {
          allow_payment_after_deadline: boolean;
          canceled_at: string | null;
          canceled_by: string | null;
          capacity: number | null;
          community_id: string;
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
          payout_profile_id: string | null;
          registration_deadline: string;
          show_capacity: boolean;
          show_participant_count: boolean;
          title: string;
          updated_at: string;
        };
        Insert: {
          allow_payment_after_deadline?: boolean;
          canceled_at?: string | null;
          canceled_by?: string | null;
          capacity?: number | null;
          community_id: string;
          created_at?: string;
          created_by?: string;
          date: string;
          description?: string | null;
          fee?: number;
          grace_period_days?: number;
          id?: string;
          invite_token?: string | null;
          location?: string | null;
          payment_deadline?: string | null;
          payment_methods: Database["public"]["Enums"]["payment_method_enum"][];
          payout_profile_id?: string | null;
          registration_deadline: string;
          show_capacity?: boolean;
          show_participant_count?: boolean;
          title: string;
          updated_at?: string;
        };
        Update: {
          allow_payment_after_deadline?: boolean;
          canceled_at?: string | null;
          canceled_by?: string | null;
          capacity?: number | null;
          community_id?: string;
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
          payout_profile_id?: string | null;
          registration_deadline?: string;
          show_capacity?: boolean;
          show_participant_count?: boolean;
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
            foreignKeyName: "events_community_id_fkey";
            columns: ["community_id"];
            isOneToOne: false;
            referencedRelation: "communities";
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
          {
            foreignKeyName: "events_payout_profile_id_fkey";
            columns: ["payout_profile_id"];
            isOneToOne: false;
            referencedRelation: "payout_profiles";
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
      feedbacks: {
        Row: {
          category: string;
          created_at: string;
          email: string | null;
          fingerprint_hash: string;
          id: string;
          ip_hash: string | null;
          message: string;
          name: string | null;
          page_context: string | null;
          user_agent: string | null;
        };
        Insert: {
          category: string;
          created_at?: string;
          email?: string | null;
          fingerprint_hash: string;
          id?: string;
          ip_hash?: string | null;
          message: string;
          name?: string | null;
          page_context?: string | null;
          user_agent?: string | null;
        };
        Update: {
          category?: string;
          created_at?: string;
          email?: string | null;
          fingerprint_hash?: string;
          id?: string;
          ip_hash?: string | null;
          message?: string;
          name?: string | null;
          page_context?: string | null;
          user_agent?: string | null;
        };
        Relationships: [];
      };
      line_accounts: {
        Row: {
          auth_user_id: string;
          channel_id: string;
          created_at: string;
          display_name: string | null;
          email: string | null;
          id: string;
          line_sub: string;
          picture_url: string | null;
          updated_at: string;
        };
        Insert: {
          auth_user_id: string;
          channel_id: string;
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          id?: string;
          line_sub: string;
          picture_url?: string | null;
          updated_at?: string;
        };
        Update: {
          auth_user_id?: string;
          channel_id?: string;
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          id?: string;
          line_sub?: string;
          picture_url?: string | null;
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
          payout_profile_id: string | null;
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
          payout_profile_id?: string | null;
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
          payout_profile_id?: string | null;
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
          {
            foreignKeyName: "payments_payout_profile_id_fkey";
            columns: ["payout_profile_id"];
            isOneToOne: false;
            referencedRelation: "payout_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      payout_profiles: {
        Row: {
          collection_ready: boolean;
          created_at: string;
          id: string;
          owner_user_id: string;
          payouts_enabled: boolean;
          representative_community_id: string | null;
          requirements_disabled_reason: string | null;
          requirements_summary: Json;
          status: Database["public"]["Enums"]["stripe_account_status_enum"];
          stripe_account_id: string;
          stripe_status_synced_at: string | null;
          transfers_status: string | null;
          updated_at: string;
        };
        Insert: {
          collection_ready?: boolean;
          created_at?: string;
          id?: string;
          owner_user_id: string;
          payouts_enabled?: boolean;
          representative_community_id?: string | null;
          requirements_disabled_reason?: string | null;
          requirements_summary?: Json;
          status?: Database["public"]["Enums"]["stripe_account_status_enum"];
          stripe_account_id: string;
          stripe_status_synced_at?: string | null;
          transfers_status?: string | null;
          updated_at?: string;
        };
        Update: {
          collection_ready?: boolean;
          created_at?: string;
          id?: string;
          owner_user_id?: string;
          payouts_enabled?: boolean;
          representative_community_id?: string | null;
          requirements_disabled_reason?: string | null;
          requirements_summary?: Json;
          status?: Database["public"]["Enums"]["stripe_account_status_enum"];
          stripe_account_id?: string;
          stripe_status_synced_at?: string | null;
          transfers_status?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payout_profiles_owner_user_id_fkey";
            columns: ["owner_user_id"];
            isOneToOne: true;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payout_profiles_owner_user_id_fkey";
            columns: ["owner_user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payout_profiles_representative_community_id_fkey";
            columns: ["representative_community_id"];
            isOneToOne: false;
            referencedRelation: "communities";
            referencedColumns: ["id"];
          },
        ];
      };
      payout_requests: {
        Row: {
          amount: number;
          arrival_date: string | null;
          community_id: string;
          currency: string;
          failure_code: string | null;
          failure_message: string | null;
          id: string;
          idempotency_key: string;
          payout_profile_id: string;
          requested_at: string;
          requested_by: string;
          status: Database["public"]["Enums"]["payout_request_status"];
          stripe_account_id: string;
          stripe_created_at: string | null;
          stripe_payout_id: string | null;
          updated_at: string;
        };
        Insert: {
          amount: number;
          arrival_date?: string | null;
          community_id: string;
          currency?: string;
          failure_code?: string | null;
          failure_message?: string | null;
          id?: string;
          idempotency_key: string;
          payout_profile_id: string;
          requested_at?: string;
          requested_by: string;
          status?: Database["public"]["Enums"]["payout_request_status"];
          stripe_account_id: string;
          stripe_created_at?: string | null;
          stripe_payout_id?: string | null;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          arrival_date?: string | null;
          community_id?: string;
          currency?: string;
          failure_code?: string | null;
          failure_message?: string | null;
          id?: string;
          idempotency_key?: string;
          payout_profile_id?: string;
          requested_at?: string;
          requested_by?: string;
          status?: Database["public"]["Enums"]["payout_request_status"];
          stripe_account_id?: string;
          stripe_created_at?: string | null;
          stripe_payout_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payout_requests_community_id_fkey";
            columns: ["community_id"];
            isOneToOne: false;
            referencedRelation: "communities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payout_requests_payout_profile_id_fkey";
            columns: ["payout_profile_id"];
            isOneToOne: false;
            referencedRelation: "payout_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payout_requests_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "public_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payout_requests_requested_by_fkey";
            columns: ["requested_by"];
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
          action: string;
          actor_identifier: string | null;
          actor_type: Database["public"]["Enums"]["actor_type_enum"];
          created_at: string;
          dedupe_key: string | null;
          error_code: string | null;
          error_message: string | null;
          error_stack: string | null;
          id: number;
          idempotency_key: string | null;
          ip_address: unknown;
          log_category: Database["public"]["Enums"]["log_category_enum"];
          log_level: Database["public"]["Enums"]["log_level_enum"];
          message: string;
          metadata: Json | null;
          outcome: Database["public"]["Enums"]["log_outcome_enum"];
          request_id: string | null;
          resource_id: string | null;
          resource_type: string | null;
          session_id: string | null;
          stripe_event_id: string | null;
          stripe_request_id: string | null;
          tags: string[] | null;
          user_agent: string | null;
          user_id: string | null;
        };
        Insert: {
          action: string;
          actor_identifier?: string | null;
          actor_type?: Database["public"]["Enums"]["actor_type_enum"];
          created_at?: string;
          dedupe_key?: string | null;
          error_code?: string | null;
          error_message?: string | null;
          error_stack?: string | null;
          id?: number;
          idempotency_key?: string | null;
          ip_address?: unknown;
          log_category: Database["public"]["Enums"]["log_category_enum"];
          log_level?: Database["public"]["Enums"]["log_level_enum"];
          message: string;
          metadata?: Json | null;
          outcome?: Database["public"]["Enums"]["log_outcome_enum"];
          request_id?: string | null;
          resource_id?: string | null;
          resource_type?: string | null;
          session_id?: string | null;
          stripe_event_id?: string | null;
          stripe_request_id?: string | null;
          tags?: string[] | null;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          actor_identifier?: string | null;
          actor_type?: Database["public"]["Enums"]["actor_type_enum"];
          created_at?: string;
          dedupe_key?: string | null;
          error_code?: string | null;
          error_message?: string | null;
          error_stack?: string | null;
          id?: number;
          idempotency_key?: string | null;
          ip_address?: unknown;
          log_category?: Database["public"]["Enums"]["log_category_enum"];
          log_level?: Database["public"]["Enums"]["log_level_enum"];
          message?: string;
          metadata?: Json | null;
          outcome?: Database["public"]["Enums"]["log_outcome_enum"];
          request_id?: string | null;
          resource_id?: string | null;
          resource_type?: string | null;
          session_id?: string | null;
          stripe_event_id?: string | null;
          stripe_request_id?: string | null;
          tags?: string[] | null;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      users: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          email: string | null;
          id: string;
          is_deleted: boolean;
          name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          email?: string | null;
          id: string;
          is_deleted?: boolean;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          email?: string | null;
          id?: string;
          is_deleted?: boolean;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      webhook_event_ledger: {
        Row: {
          created_at: string;
          dedupe_key: string;
          event_type: string;
          id: string;
          is_terminal_failure: boolean;
          last_error_code: string | null;
          last_error_reason: string | null;
          processed_at: string | null;
          processing_status: string;
          stripe_event_id: string;
          stripe_object_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          dedupe_key: string;
          event_type: string;
          id?: string;
          is_terminal_failure?: boolean;
          last_error_code?: string | null;
          last_error_reason?: string | null;
          processed_at?: string | null;
          processing_status?: string;
          stripe_event_id: string;
          stripe_object_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          dedupe_key?: string;
          event_type?: string;
          id?: string;
          is_terminal_failure?: boolean;
          last_error_code?: string | null;
          last_error_reason?: string | null;
          processed_at?: string | null;
          processing_status?: string;
          stripe_event_id?: string;
          stripe_object_id?: string | null;
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
      admin_add_attendance_with_capacity_check: {
        Args: {
          p_email: string;
          p_event_id: string;
          p_guest_token: string;
          p_nickname: string;
          p_status: Database["public"]["Enums"]["attendance_status_enum"];
        };
        Returns: string;
      };
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
      can_access_event: { Args: { p_event_id: string }; Returns: boolean };
      can_manage_invite_links: {
        Args: { p_event_id: string };
        Returns: boolean;
      };
      generate_community_slug: { Args: never; Returns: string };
      get_dashboard_stats: {
        Args: { p_community_id: string };
        Returns: {
          total_upcoming_participants: number;
          unpaid_fees_total: number;
          upcoming_events_count: number;
        }[];
      };
      get_event_creator_name: {
        Args: { p_creator_id: string };
        Returns: string;
      };
      get_guest_token: { Args: never; Returns: string };
      get_min_payout_amount: { Args: never; Returns: number };
      get_recent_events: {
        Args: { p_community_id: string };
        Returns: {
          attendances_count: number;
          canceled_at: string;
          capacity: number;
          date: string;
          fee: number;
          id: string;
          location: string;
          title: string;
        }[];
      };
      hash_guest_token: { Args: { token: string }; Returns: string };
      is_attendance_community_owner: {
        Args: { p_attendance_id: string };
        Returns: boolean;
      };
      is_community_owner: { Args: { p_community_id: string }; Returns: boolean };
      is_event_community_owner: {
        Args: { p_event_id: string };
        Returns: boolean;
      };
      is_payment_community_owner: {
        Args: { p_payment_id: string };
        Returns: boolean;
      };
      is_payout_profile_owner: {
        Args: { p_payout_profile_id: string };
        Returns: boolean;
      };
      is_public_community: {
        Args: { p_community_id: string };
        Returns: boolean;
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
      rpc_admin_delete_mistaken_attendance: {
        Args: { p_attendance_id: string; p_event_id: string; p_user_id: string };
        Returns: Json;
      };
      rpc_admin_update_attendance_status: {
        Args: {
          p_acknowledged_finalized_payment?: boolean;
          p_acknowledged_past_event?: boolean;
          p_attendance_id: string;
          p_event_id: string;
          p_new_status: Database["public"]["Enums"]["attendance_status_enum"];
          p_notes?: string;
          p_payment_method?: Database["public"]["Enums"]["payment_method_enum"];
          p_user_id: string;
        };
        Returns: Json;
      };
      rpc_bulk_update_payment_status_safe: {
        Args: { p_notes?: string; p_payment_updates: Json; p_user_id: string };
        Returns: Json;
      };
      rpc_guest_get_attendance: {
        Args: { p_guest_token: string };
        Returns: {
          attendance_created_at: string;
          attendance_id: string;
          attendance_updated_at: string;
          canceled_at: string;
          community_legal_slug: string;
          community_name: string;
          community_show_community_link: boolean;
          community_show_legal_disclosure_link: boolean;
          community_slug: string;
          email: string;
          event_allow_payment_after_deadline: boolean;
          event_capacity: number;
          event_date: string;
          event_description: string;
          event_fee: number;
          event_grace_period_days: number;
          event_id: string;
          event_location: string;
          event_payment_methods: Database["public"]["Enums"]["payment_method_enum"][];
          event_show_capacity: boolean;
          event_show_participant_count: boolean;
          event_title: string;
          guest_token: string;
          nickname: string;
          payment_amount: number;
          payment_created_at: string;
          payment_deadline: string;
          payment_id: string;
          payment_method: Database["public"]["Enums"]["payment_method_enum"];
          payment_status: Database["public"]["Enums"]["payment_status_enum"];
          registration_deadline: string;
          status: Database["public"]["Enums"]["attendance_status_enum"];
        }[];
      };
      rpc_guest_get_latest_payment: {
        Args: { p_attendance_id: string; p_guest_token: string };
        Returns: number;
      };
      rpc_public_attending_count: {
        Args: { p_event_id: string; p_invite_token: string };
        Returns: number;
      };
      rpc_public_check_duplicate_email: {
        Args: { p_email: string; p_event_id: string; p_invite_token: string };
        Returns: boolean;
      };
      rpc_public_get_community_by_legal_slug: {
        Args: { p_legal_slug: string };
        Returns: {
          description: string;
          id: string;
          legal_slug: string;
          name: string;
          slug: string;
        }[];
      };
      rpc_public_get_community_by_slug: {
        Args: { p_slug: string };
        Returns: {
          description: string;
          id: string;
          legal_slug: string;
          name: string;
          slug: string;
        }[];
      };
      rpc_public_get_connect_account: {
        Args: { p_event_id: string };
        Returns: {
          collection_ready: boolean;
          payout_profile_id: string;
          status: string;
          stripe_account_id: string;
        }[];
      };
      rpc_public_get_event: {
        Args: { p_invite_token: string };
        Returns: {
          attendances_count: number;
          canceled_at: string;
          capacity: number;
          community_legal_slug: string;
          community_name: string;
          community_show_community_link: boolean;
          community_show_legal_disclosure_link: boolean;
          community_slug: string;
          date: string;
          description: string;
          fee: number;
          id: string;
          invite_token: string;
          location: string;
          payment_deadline: string;
          payment_methods: Database["public"]["Enums"]["payment_method_enum"][];
          registration_deadline: string;
          show_capacity: boolean;
          show_participant_count: boolean;
          title: string;
        }[];
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
      status_rank: {
        Args: { p: Database["public"]["Enums"]["payment_status_enum"] };
        Returns: number;
      };
      update_guest_attendance_with_payment: {
        Args: {
          p_attendance_id: string;
          p_event_fee?: number;
          p_guest_token: string;
          p_payment_method?: Database["public"]["Enums"]["payment_method_enum"];
          p_status: Database["public"]["Enums"]["attendance_status_enum"];
        };
        Returns: undefined;
      };
      update_revenue_summary: { Args: { p_event_id: string }; Returns: Json };
    };
    Enums: {
      actor_type_enum: "user" | "guest" | "system" | "webhook" | "service_role" | "anonymous";
      attendance_status_enum: "attending" | "not_attending" | "maybe";
      log_category_enum:
        | "authentication"
        | "authorization"
        | "event_management"
        | "attendance"
        | "payment"
        | "stripe_webhook"
        | "stripe_connect"
        | "email"
        | "export"
        | "security"
        | "system";
      log_level_enum: "debug" | "info" | "warn" | "error" | "critical";
      log_outcome_enum: "success" | "failure" | "unknown";
      payment_method_enum: "stripe" | "cash";
      payment_status_enum:
        | "pending"
        | "paid"
        | "failed"
        | "received"
        | "refunded"
        | "waived"
        | "canceled";
      payout_request_status:
        | "requesting"
        | "pending"
        | "in_transit"
        | "paid"
        | "failed"
        | "canceled"
        | "creation_unknown"
        | "manual_review_required";
      stripe_account_status_enum: "unverified" | "onboarding" | "verified" | "restricted";
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
      actor_type_enum: ["user", "guest", "system", "webhook", "service_role", "anonymous"],
      attendance_status_enum: ["attending", "not_attending", "maybe"],
      log_category_enum: [
        "authentication",
        "authorization",
        "event_management",
        "attendance",
        "payment",
        "stripe_webhook",
        "stripe_connect",
        "email",
        "export",
        "security",
        "system",
      ],
      log_level_enum: ["debug", "info", "warn", "error", "critical"],
      log_outcome_enum: ["success", "failure", "unknown"],
      payment_method_enum: ["stripe", "cash"],
      payment_status_enum: [
        "pending",
        "paid",
        "failed",
        "received",
        "refunded",
        "waived",
        "canceled",
      ],
      payout_request_status: [
        "requesting",
        "pending",
        "in_transit",
        "paid",
        "failed",
        "canceled",
        "creation_unknown",
        "manual_review_required",
      ],
      stripe_account_status_enum: ["unverified", "onboarding", "verified", "restricted"],
    },
  },
} as const;
