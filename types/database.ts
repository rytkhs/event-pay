export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_access_audit: {
        Row: {
          accessed_tables: string[] | null
          context: string
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          ip_address: unknown | null
          operation_details: Json | null
          reason: Database["public"]["Enums"]["admin_reason_enum"]
          session_id: string | null
          success: boolean | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          accessed_tables?: string[] | null
          context: string
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          ip_address?: unknown | null
          operation_details?: Json | null
          reason: Database["public"]["Enums"]["admin_reason_enum"]
          session_id?: string | null
          success?: boolean | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          accessed_tables?: string[] | null
          context?: string
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          ip_address?: unknown | null
          operation_details?: Json | null
          reason?: Database["public"]["Enums"]["admin_reason_enum"]
          session_id?: string | null
          success?: boolean | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      attendances: {
        Row: {
          created_at: string
          email: string
          event_id: string
          guest_token: string
          id: string
          nickname: string
          status: Database["public"]["Enums"]["attendance_status_enum"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          event_id: string
          guest_token: string
          id?: string
          nickname: string
          status: Database["public"]["Enums"]["attendance_status_enum"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          event_id?: string
          guest_token?: string
          id?: string
          nickname?: string
          status?: Database["public"]["Enums"]["attendance_status_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendances_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          capacity: number | null
          created_at: string
          created_by: string
          date: string
          description: string | null
          fee: number
          id: string
          invite_token: string | null
          location: string | null
          payment_deadline: string | null
          payment_methods: Database["public"]["Enums"]["payment_method_enum"][]
          registration_deadline: string | null
          status: Database["public"]["Enums"]["event_status_enum"]
          title: string
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          created_by: string
          date: string
          description?: string | null
          fee?: number
          id?: string
          invite_token?: string | null
          location?: string | null
          payment_deadline?: string | null
          payment_methods: Database["public"]["Enums"]["payment_method_enum"][]
          registration_deadline?: string | null
          status?: Database["public"]["Enums"]["event_status_enum"]
          title: string
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          created_by?: string
          date?: string
          description?: string | null
          fee?: number
          id?: string
          invite_token?: string | null
          location?: string | null
          payment_deadline?: string | null
          payment_methods?: Database["public"]["Enums"]["payment_method_enum"][]
          registration_deadline?: string | null
          status?: Database["public"]["Enums"]["event_status_enum"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_config: {
        Row: {
          id: number
          is_tax_included: boolean
          max_platform_fee: number
          min_payout_amount: number
          min_platform_fee: number
          platform_fee_rate: number
          platform_fixed_fee: number
          platform_tax_rate: number
          stripe_base_rate: number
          stripe_fixed_fee: number
          updated_at: string
        }
        Insert: {
          id?: number
          is_tax_included?: boolean
          max_platform_fee: number
          min_payout_amount?: number
          min_platform_fee: number
          platform_fee_rate: number
          platform_fixed_fee: number
          platform_tax_rate?: number
          stripe_base_rate: number
          stripe_fixed_fee: number
          updated_at?: string
        }
        Update: {
          id?: number
          is_tax_included?: boolean
          max_platform_fee?: number
          min_payout_amount?: number
          min_platform_fee?: number
          platform_fee_rate?: number
          platform_fixed_fee?: number
          platform_tax_rate?: number
          stripe_base_rate?: number
          stripe_fixed_fee?: number
          updated_at?: string
        }
        Relationships: []
      }
      guest_access_audit: {
        Row: {
          action: string
          attendance_id: string | null
          created_at: string
          duration_ms: number | null
          error_code: string | null
          error_message: string | null
          event_id: string | null
          guest_token_hash: string
          id: string
          ip_address: unknown | null
          operation_type: string | null
          result_count: number | null
          session_id: string | null
          success: boolean
          table_name: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          attendance_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          event_id?: string | null
          guest_token_hash: string
          id?: string
          ip_address?: unknown | null
          operation_type?: string | null
          result_count?: number | null
          session_id?: string | null
          success: boolean
          table_name?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          attendance_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          event_id?: string | null
          guest_token_hash?: string
          id?: string
          ip_address?: unknown | null
          operation_type?: string | null
          result_count?: number | null
          session_id?: string | null
          success?: boolean
          table_name?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_access_audit_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_access_audit_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_links: {
        Row: {
          created_at: string | null
          created_by: string | null
          current_uses: number | null
          event_id: string
          expires_at: string
          id: string
          max_uses: number | null
          token: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          current_uses?: number | null
          event_id: string
          expires_at: string
          id?: string
          max_uses?: number | null
          token: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          current_uses?: number | null
          event_id?: string
          expires_at?: string
          id?: string
          max_uses?: number | null
          token?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invite_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          application_fee_amount: number
          application_fee_excl_tax: number
          application_fee_id: string | null
          application_fee_refund_id: string | null
          application_fee_refunded_amount: number
          application_fee_tax_amount: number
          application_fee_tax_rate: number
          attendance_id: string
          created_at: string
          destination_account_id: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method_enum"]
          paid_at: string | null
          refunded_amount: number
          status: Database["public"]["Enums"]["payment_status_enum"]
          stripe_balance_transaction_id: string | null
          stripe_charge_id: string | null
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          stripe_transfer_id: string | null
          tax_included: boolean
          transfer_group: string | null
          updated_at: string
          webhook_event_id: string | null
          webhook_processed_at: string | null
        }
        Insert: {
          amount: number
          application_fee_amount?: number
          application_fee_excl_tax?: number
          application_fee_id?: string | null
          application_fee_refund_id?: string | null
          application_fee_refunded_amount?: number
          application_fee_tax_amount?: number
          application_fee_tax_rate?: number
          attendance_id: string
          created_at?: string
          destination_account_id?: string | null
          id?: string
          method: Database["public"]["Enums"]["payment_method_enum"]
          paid_at?: string | null
          refunded_amount?: number
          status?: Database["public"]["Enums"]["payment_status_enum"]
          stripe_balance_transaction_id?: string | null
          stripe_charge_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          stripe_transfer_id?: string | null
          tax_included?: boolean
          transfer_group?: string | null
          updated_at?: string
          webhook_event_id?: string | null
          webhook_processed_at?: string | null
        }
        Update: {
          amount?: number
          application_fee_amount?: number
          application_fee_excl_tax?: number
          application_fee_id?: string | null
          application_fee_refund_id?: string | null
          application_fee_refunded_amount?: number
          application_fee_tax_amount?: number
          application_fee_tax_rate?: number
          attendance_id?: string
          created_at?: string
          destination_account_id?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method_enum"]
          paid_at?: string | null
          refunded_amount?: number
          status?: Database["public"]["Enums"]["payment_status_enum"]
          stripe_balance_transaction_id?: string | null
          stripe_charge_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          stripe_transfer_id?: string | null
          tax_included?: boolean
          transfer_group?: string | null
          updated_at?: string
          webhook_event_id?: string | null
          webhook_processed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: true
            referencedRelation: "attendances"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_scheduler_logs: {
        Row: {
          created_at: string | null
          dry_run: boolean
          eligible_events_count: number
          end_time: string
          error_message: string | null
          execution_id: string
          failed_payouts: number
          id: string
          processing_time_ms: number
          results: Json | null
          start_time: string
          successful_payouts: number
          summary: Json | null
          total_amount: number
        }
        Insert: {
          created_at?: string | null
          dry_run?: boolean
          eligible_events_count?: number
          end_time: string
          error_message?: string | null
          execution_id: string
          failed_payouts?: number
          id?: string
          processing_time_ms: number
          results?: Json | null
          start_time: string
          successful_payouts?: number
          summary?: Json | null
          total_amount?: number
        }
        Update: {
          created_at?: string | null
          dry_run?: boolean
          eligible_events_count?: number
          end_time?: string
          error_message?: string | null
          execution_id?: string
          failed_payouts?: number
          id?: string
          processing_time_ms?: number
          results?: Json | null
          start_time?: string
          successful_payouts?: number
          summary?: Json | null
          total_amount?: number
        }
        Relationships: []
      }
      payouts: {
        Row: {
          created_at: string
          event_id: string
          generated_at: string | null
          id: string
          last_error: string | null
          net_payout_amount: number
          notes: string | null
          platform_fee: number
          processed_at: string | null
          retry_count: number
          settlement_mode:
          | Database["public"]["Enums"]["settlement_mode_enum"]
          | null
          status: Database["public"]["Enums"]["payout_status_enum"]
          stripe_account_id: string
          stripe_transfer_id: string | null
          total_stripe_fee: number
          total_stripe_sales: number
          transfer_group: string | null
          updated_at: string
          user_id: string
          webhook_event_id: string | null
          webhook_processed_at: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          generated_at?: string | null
          id?: string
          last_error?: string | null
          net_payout_amount?: number
          notes?: string | null
          platform_fee?: number
          processed_at?: string | null
          retry_count?: number
          settlement_mode?:
          | Database["public"]["Enums"]["settlement_mode_enum"]
          | null
          status?: Database["public"]["Enums"]["payout_status_enum"]
          stripe_account_id: string
          stripe_transfer_id?: string | null
          total_stripe_fee?: number
          total_stripe_sales?: number
          transfer_group?: string | null
          updated_at?: string
          user_id: string
          webhook_event_id?: string | null
          webhook_processed_at?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          generated_at?: string | null
          id?: string
          last_error?: string | null
          net_payout_amount?: number
          notes?: string | null
          platform_fee?: number
          processed_at?: string | null
          retry_count?: number
          settlement_mode?:
          | Database["public"]["Enums"]["settlement_mode_enum"]
          | null
          status?: Database["public"]["Enums"]["payout_status_enum"]
          stripe_account_id?: string
          stripe_transfer_id?: string | null
          total_stripe_fee?: number
          total_stripe_sales?: number
          transfer_group?: string | null
          updated_at?: string
          user_id?: string
          webhook_event_id?: string | null
          webhook_processed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payouts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduler_locks: {
        Row: {
          acquired_at: string
          created_at: string
          expires_at: string
          lock_name: string
          metadata: Json | null
          process_id: string | null
        }
        Insert: {
          acquired_at?: string
          created_at?: string
          expires_at: string
          lock_name: string
          metadata?: Json | null
          process_id?: string | null
        }
        Update: {
          acquired_at?: string
          created_at?: string
          expires_at?: string
          lock_name?: string
          metadata?: Json | null
          process_id?: string | null
        }
        Relationships: []
      }
      security_audit_log: {
        Row: {
          details: Json | null
          event_type: string
          id: number
          ip_address: unknown | null
          timestamp: string | null
          user_role: string | null
        }
        Insert: {
          details?: Json | null
          event_type: string
          id?: number
          ip_address?: unknown | null
          timestamp?: string | null
          user_role?: string | null
        }
        Update: {
          details?: Json | null
          event_type?: string
          id?: number
          ip_address?: unknown | null
          timestamp?: string | null
          user_role?: string | null
        }
        Relationships: []
      }
      stripe_connect_accounts: {
        Row: {
          charges_enabled: boolean
          created_at: string
          payouts_enabled: boolean
          status: Database["public"]["Enums"]["stripe_account_status_enum"]
          stripe_account_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          charges_enabled?: boolean
          created_at?: string
          payouts_enabled?: boolean
          status?: Database["public"]["Enums"]["stripe_account_status_enum"]
          stripe_account_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          charges_enabled?: boolean
          created_at?: string
          payouts_enabled?: boolean
          status?: Database["public"]["Enums"]["stripe_account_status_enum"]
          stripe_account_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_connect_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stripe_connect_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      suspicious_activity_log: {
        Row: {
          activity_type: Database["public"]["Enums"]["suspicious_activity_type_enum"]
          actual_result_count: number | null
          attempted_action: string | null
          context: Json | null
          created_at: string
          detection_method: string | null
          expected_result_count: number | null
          false_positive: boolean | null
          id: string
          investigated_at: string | null
          investigated_by: string | null
          investigation_notes: string | null
          ip_address: unknown | null
          session_id: string | null
          severity: Database["public"]["Enums"]["security_severity_enum"] | null
          table_name: string | null
          user_agent: string | null
          user_id: string | null
          user_role: string | null
        }
        Insert: {
          activity_type: Database["public"]["Enums"]["suspicious_activity_type_enum"]
          actual_result_count?: number | null
          attempted_action?: string | null
          context?: Json | null
          created_at?: string
          detection_method?: string | null
          expected_result_count?: number | null
          false_positive?: boolean | null
          id?: string
          investigated_at?: string | null
          investigated_by?: string | null
          investigation_notes?: string | null
          ip_address?: unknown | null
          session_id?: string | null
          severity?:
          | Database["public"]["Enums"]["security_severity_enum"]
          | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["suspicious_activity_type_enum"]
          actual_result_count?: number | null
          attempted_action?: string | null
          context?: Json | null
          created_at?: string
          detection_method?: string | null
          expected_result_count?: number | null
          false_positive?: boolean | null
          id?: string
          investigated_at?: string | null
          investigated_by?: string | null
          investigation_notes?: string | null
          ip_address?: unknown | null
          session_id?: string | null
          severity?:
          | Database["public"]["Enums"]["security_severity_enum"]
          | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Relationships: []
      }
      system_logs: {
        Row: {
          details: Json | null
          executed_at: string
          id: number
          operation_type: string
        }
        Insert: {
          details?: Json | null
          executed_at?: string
          id?: number
          operation_type: string
        }
        Update: {
          details?: Json | null
          executed_at?: string
          id?: number
          operation_type?: string
        }
        Relationships: []
      }
      unauthorized_access_log: {
        Row: {
          attempted_resource: string
          blocked_by_rls: boolean | null
          created_at: string
          detection_method: string
          guest_token_hash: string | null
          id: string
          ip_address: unknown | null
          request_headers: Json | null
          request_method: string | null
          request_path: string | null
          required_permission: string | null
          response_status: number | null
          session_id: string | null
          user_agent: string | null
          user_context: Json | null
          user_id: string | null
        }
        Insert: {
          attempted_resource: string
          blocked_by_rls?: boolean | null
          created_at?: string
          detection_method: string
          guest_token_hash?: string | null
          id?: string
          ip_address?: unknown | null
          request_headers?: Json | null
          request_method?: string | null
          request_path?: string | null
          required_permission?: string | null
          response_status?: number | null
          session_id?: string | null
          user_agent?: string | null
          user_context?: Json | null
          user_id?: string | null
        }
        Update: {
          attempted_resource?: string
          blocked_by_rls?: boolean | null
          created_at?: string
          detection_method?: string
          guest_token_hash?: string | null
          id?: string
          ip_address?: unknown | null
          request_headers?: Json | null
          request_method?: string | null
          request_path?: string | null
          required_permission?: string | null
          response_status?: number | null
          session_id?: string | null
          user_agent?: string | null
          user_context?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          last_retry_at: string | null
          object_id: string | null
          processed_at: string
          processing_error: string | null
          processing_result: Json | null
          retry_count: number
          status: string
          stripe_account_id: string | null
          stripe_event_id: string
          stripe_event_created: number | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          last_retry_at?: string | null
          object_id?: string | null
          processed_at: string
          processing_error?: string | null
          processing_result?: Json | null
          retry_count?: number
          status?: string
          stripe_account_id?: string | null
          stripe_event_id: string
          stripe_event_created?: number | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          last_retry_at?: string | null
          object_id?: string | null
          processed_at?: string
          processing_error?: string | null
          processing_result?: Json | null
          retry_count?: number
          status?: string
          stripe_account_id?: string | null
          stripe_event_id?: string
          stripe_event_created?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      public_profiles: {
        Row: {
          created_at: string | null
          id: string | null
          name: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          name?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          name?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      acquire_payout_scheduler_lock: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      calc_payout_amount: {
        Args: { p_event_id: string }
        Returns: {
          net_payout_amount: number
          platform_fee: number
          stripe_payment_count: number
          total_stripe_fee: number
          total_stripe_sales: number
        }[]
      }
      calc_total_stripe_fee: {
        Args:
        | { p_base_rate?: number; p_event_id: string }
        | { p_base_rate?: number; p_event_id: string; p_fixed_fee?: number }
        Returns: number
      }
      cleanup_expired_scheduler_locks: {
        Args: Record<PropertyKey, never>
        Returns: {
          deleted_count: number
          expired_locks: Json
        }[]
      }
      cleanup_old_audit_logs: {
        Args: { retention_days?: number }
        Returns: number
      }
      cleanup_old_scheduler_logs: {
        Args: { retention_days?: number }
        Returns: number
      }
      cleanup_test_tables_dev_only: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      clear_test_guest_token: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      create_attendance_with_validation: {
        Args: {
          p_email: string
          p_event_id: string
          p_guest_token: string
          p_nickname: string
          p_status: Database["public"]["Enums"]["attendance_status_enum"]
        }
        Returns: string
      }
      create_payment_record: {
        Args: {
          p_amount: number
          p_attendance_id: string
          p_method: Database["public"]["Enums"]["payment_method_enum"]
        }
        Returns: string
      }
      detect_orphaned_users: {
        Args: Record<PropertyKey, never>
        Returns: {
          days_since_creation: number
          email: string
          user_id: string
        }[]
      }
      extend_scheduler_lock: {
        Args: {
          p_extend_minutes?: number
          p_lock_name: string
          p_process_id: string
        }
        Returns: boolean
      }
      find_eligible_events_basic: {
        Args: {
          p_days_after_event?: number
          p_limit?: number
          p_minimum_amount?: number
          p_user_id?: string
        }
        Returns: {
          created_at: string
          created_by: string
          event_date: string
          event_id: string
          fee: number
          paid_attendances_count: number
          title: string
          total_stripe_sales: number
        }[]
      }
      find_eligible_events_with_details: {
        Args:
        | { p_days_after_event?: number; p_limit?: number }
        | { p_limit?: number; p_minimum_amount?: number; p_skip?: number }
        Returns: {
          created_at: string
          created_by: string
          eligible: boolean
          event_date: string
          event_id: string
          fee: number
          ineligible_reason: string
          net_payout_amount: number
          paid_attendances_count: number
          payouts_enabled: boolean
          platform_fee: number
          title: string
          total_stripe_fee: number
          total_stripe_sales: number
        }[]
      }
      force_release_payout_scheduler_lock: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      get_event_creator_name: {
        Args: { p_creator_id: string }
        Returns: string
      }
      get_guest_token: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_min_payout_amount: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      get_scheduler_lock_status: {
        Args: { p_lock_name?: string }
        Returns: {
          acquired_at: string
          expires_at: string
          is_expired: boolean
          lock_name: string
          metadata: Json
          process_id: string
          time_remaining_minutes: number
        }[]
      }
      hash_guest_token: {
        Args: { token: string }
        Returns: string
      }
      log_security_event: {
        Args: { p_details: Json; p_event_type: string }
        Returns: undefined
      }
      process_event_payout: {
        Args: { p_event_id: string; p_user_id: string }
        Returns: string
      }
      register_attendance_with_payment: {
        Args: {
          p_email: string
          p_event_fee?: number
          p_event_id: string
          p_guest_token: string
          p_nickname: string
          p_payment_method?: Database["public"]["Enums"]["payment_method_enum"]
          p_status: Database["public"]["Enums"]["attendance_status_enum"]
        }
        Returns: string
      }
      release_scheduler_lock: {
        Args: { p_lock_name: string; p_process_id?: string }
        Returns: boolean
      }
      set_test_guest_token: {
        Args: { token: string }
        Returns: undefined
      }
      try_acquire_scheduler_lock: {
        Args: {
          p_lock_name: string
          p_metadata?: Json
          p_process_id?: string
          p_ttl_minutes?: number
        }
        Returns: boolean
      }
      update_guest_attendance_with_payment: {
        Args: {
          p_attendance_id: string
          p_event_fee?: number
          p_payment_method?: Database["public"]["Enums"]["payment_method_enum"]
          p_status: Database["public"]["Enums"]["attendance_status_enum"]
        }
        Returns: undefined
      }
      update_payout_status_safe: {
        Args: {
          _from_status: Database["public"]["Enums"]["payout_status_enum"]
          _last_error?: string
          _notes?: string
          _payout_id: string
          _processed_at?: string
          _stripe_transfer_id?: string
          _to_status: Database["public"]["Enums"]["payout_status_enum"]
          _transfer_group?: string
        }
        Returns: undefined
      }
      update_revenue_summary: {
        Args: { p_event_id: string }
        Returns: Json
      }
    }
    Enums: {
      admin_reason_enum:
      | "user_cleanup"
      | "test_data_setup"
      | "system_maintenance"
      | "emergency_access"
      | "data_migration"
      | "security_investigation"
      attendance_status_enum: "attending" | "not_attending" | "maybe"
      event_status_enum: "upcoming" | "ongoing" | "past" | "cancelled"
      payment_method_enum: "stripe" | "cash"
      payment_status_enum:
      | "pending"
      | "paid"
      | "failed"
      | "received"
      | "completed"
      | "refunded"
      | "waived"
      payout_status_enum:
      | "pending"
      | "processing"
      | "completed"
      | "failed"
      | "processing_error"
      security_severity_enum: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
      settlement_mode_enum: "destination_charge"
      stripe_account_status_enum:
      | "unverified"
      | "onboarding"
      | "verified"
      | "restricted"
      suspicious_activity_type_enum:
      | "EMPTY_RESULT_SET"
      | "ADMIN_ACCESS_ATTEMPT"
      | "INVALID_TOKEN_PATTERN"
      | "RATE_LIMIT_EXCEEDED"
      | "UNAUTHORIZED_RLS_BYPASS"
      | "BULK_DATA_ACCESS"
      | "UNUSUAL_ACCESS_PATTERN"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
  | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
    DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
    DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
  ? R
  : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
    DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] &
    DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
  ? R
  : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
  | keyof DefaultSchema["Tables"]
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Insert: infer I
  }
  ? I
  : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
    Insert: infer I
  }
  ? I
  : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
  | keyof DefaultSchema["Tables"]
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Update: infer U
  }
  ? U
  : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
    Update: infer U
  }
  ? U
  : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
  | keyof DefaultSchema["Enums"]
  | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
  : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
  | keyof DefaultSchema["CompositeTypes"]
  | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
  : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

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
      event_status_enum: ["upcoming", "ongoing", "past", "cancelled"],
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
      payout_status_enum: [
        "pending",
        "processing",
        "completed",
        "failed",
        "processing_error",
      ],
      security_severity_enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      settlement_mode_enum: ["destination_charge"],
      stripe_account_status_enum: [
        "unverified",
        "onboarding",
        "verified",
        "restricted",
      ],
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
} as const
