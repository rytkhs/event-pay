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
          email: string | null;
          event_id: string;
          guest_token: string | null;
          id: string;
          nickname: string;
          status: Database["public"]["Enums"]["attendance_status_enum"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          event_id: string;
          guest_token?: string | null;
          id?: string;
          nickname: string;
          status: Database["public"]["Enums"]["attendance_status_enum"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          event_id?: string;
          guest_token?: string | null;
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
          capacity: number | null;
          created_at: string;
          created_by: string;
          date: string;
          description: string | null;
          fee: number;
          id: string;
          invite_token: string;
          location: string | null;
          payment_deadline: string | null;
          payment_methods: Database["public"]["Enums"]["payment_method_enum"][];
          registration_deadline: string | null;
          status: Database["public"]["Enums"]["event_status_enum"];
          title: string;
          updated_at: string;
        };
        Insert: {
          capacity?: number | null;
          created_at?: string;
          created_by: string;
          date: string;
          description?: string | null;
          fee?: number;
          id?: string;
          invite_token: string;
          location?: string | null;
          payment_deadline?: string | null;
          payment_methods: Database["public"]["Enums"]["payment_method_enum"][];
          registration_deadline?: string | null;
          status?: Database["public"]["Enums"]["event_status_enum"];
          title: string;
          updated_at?: string;
        };
        Update: {
          capacity?: number | null;
          created_at?: string;
          created_by?: string;
          date?: string;
          description?: string | null;
          fee?: number;
          id?: string;
          invite_token?: string;
          location?: string | null;
          payment_deadline?: string | null;
          payment_methods?: Database["public"]["Enums"]["payment_method_enum"][];
          registration_deadline?: string | null;
          status?: Database["public"]["Enums"]["event_status_enum"];
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          attendance_id: string;
          created_at: string;
          id: string;
          method: Database["public"]["Enums"]["payment_method_enum"];
          paid_at: string | null;
          status: Database["public"]["Enums"]["payment_status_enum"];
          stripe_payment_intent_id: string | null;
          updated_at: string;
          webhook_event_id: string | null;
          webhook_processed_at: string | null;
        };
        Insert: {
          amount?: number;
          attendance_id: string;
          created_at?: string;
          id?: string;
          method: Database["public"]["Enums"]["payment_method_enum"];
          paid_at?: string | null;
          status?: Database["public"]["Enums"]["payment_status_enum"];
          stripe_payment_intent_id?: string | null;
          updated_at?: string;
          webhook_event_id?: string | null;
          webhook_processed_at?: string | null;
        };
        Update: {
          amount?: number;
          attendance_id?: string;
          created_at?: string;
          id?: string;
          method?: Database["public"]["Enums"]["payment_method_enum"];
          paid_at?: string | null;
          status?: Database["public"]["Enums"]["payment_status_enum"];
          stripe_payment_intent_id?: string | null;
          updated_at?: string;
          webhook_event_id?: string | null;
          webhook_processed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payments_attendance_id_fkey";
            columns: ["attendance_id"];
            isOneToOne: true;
            referencedRelation: "attendances";
            referencedColumns: ["id"];
          },
        ];
      };
      payouts: {
        Row: {
          created_at: string;
          event_id: string;
          id: string;
          net_payout_amount: number;
          notes: string | null;
          platform_fee: number;
          processed_at: string | null;
          status: Database["public"]["Enums"]["payout_status_enum"];
          stripe_transfer_id: string | null;
          total_stripe_fee: number;
          total_stripe_sales: number;
          updated_at: string;
          user_id: string;
          webhook_event_id: string | null;
          webhook_processed_at: string | null;
        };
        Insert: {
          created_at?: string;
          event_id: string;
          id?: string;
          net_payout_amount?: number;
          notes?: string | null;
          platform_fee?: number;
          processed_at?: string | null;
          status?: Database["public"]["Enums"]["payout_status_enum"];
          stripe_transfer_id?: string | null;
          total_stripe_fee?: number;
          total_stripe_sales?: number;
          updated_at?: string;
          user_id: string;
          webhook_event_id?: string | null;
          webhook_processed_at?: string | null;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          id?: string;
          net_payout_amount?: number;
          notes?: string | null;
          platform_fee?: number;
          processed_at?: string | null;
          status?: Database["public"]["Enums"]["payout_status_enum"];
          stripe_transfer_id?: string | null;
          total_stripe_fee?: number;
          total_stripe_sales?: number;
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
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      security_audit_log: {
        Row: {
          blocked_reason: string | null;
          event_type: string;
          id: number;
          ip_address: unknown | null;
          query_attempted: string | null;
          timestamp: string | null;
          user_role: string | null;
        };
        Insert: {
          blocked_reason?: string | null;
          event_type: string;
          id?: number;
          ip_address?: unknown | null;
          query_attempted?: string | null;
          timestamp?: string | null;
          user_role?: string | null;
        };
        Update: {
          blocked_reason?: string | null;
          event_type?: string;
          id?: number;
          ip_address?: unknown | null;
          query_attempted?: string | null;
          timestamp?: string | null;
          user_role?: string | null;
        };
        Relationships: [];
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
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      test_enum_validation: {
        Row: {
          attendance_status: Database["public"]["Enums"]["attendance_status_enum"] | null;
          created_at: string | null;
          event_status: Database["public"]["Enums"]["event_status_enum"] | null;
          id: number;
          payment_method: Database["public"]["Enums"]["payment_method_enum"] | null;
          payment_status: Database["public"]["Enums"]["payment_status_enum"] | null;
          payout_status: Database["public"]["Enums"]["payout_status_enum"] | null;
          stripe_account_status: Database["public"]["Enums"]["stripe_account_status_enum"] | null;
        };
        Insert: {
          attendance_status?: Database["public"]["Enums"]["attendance_status_enum"] | null;
          created_at?: string | null;
          event_status?: Database["public"]["Enums"]["event_status_enum"] | null;
          id?: number;
          payment_method?: Database["public"]["Enums"]["payment_method_enum"] | null;
          payment_status?: Database["public"]["Enums"]["payment_status_enum"] | null;
          payout_status?: Database["public"]["Enums"]["payout_status_enum"] | null;
          stripe_account_status?: Database["public"]["Enums"]["stripe_account_status_enum"] | null;
        };
        Update: {
          attendance_status?: Database["public"]["Enums"]["attendance_status_enum"] | null;
          created_at?: string | null;
          event_status?: Database["public"]["Enums"]["event_status_enum"] | null;
          id?: number;
          payment_method?: Database["public"]["Enums"]["payment_method_enum"] | null;
          payment_status?: Database["public"]["Enums"]["payment_status_enum"] | null;
          payout_status?: Database["public"]["Enums"]["payout_status_enum"] | null;
          stripe_account_status?: Database["public"]["Enums"]["stripe_account_status_enum"] | null;
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
      cleanup_test_data_safe: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      execute_safe_test_query: {
        Args: { test_query: string };
        Returns: {
          result: Json;
        }[];
      };
      get_enum_types: {
        Args: Record<PropertyKey, never>;
        Returns: {
          enum_name: string;
          enum_values: string[];
        }[];
      };
      get_enum_values: {
        Args: { enum_type_name: string };
        Returns: string[];
      };
      get_enum_values_secure: {
        Args: { enum_type_name: string };
        Returns: string[];
      };
      get_event_creator_name: {
        Args: { user_id: string };
        Returns: string;
      };

      log_security_event: {
        Args: {
          p_query_attempted?: string;
          p_blocked_reason?: string;
          p_user_role?: string;
          p_event_type: string;
        };
        Returns: undefined;
      };
      production_security_cleanup: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      test_attendance_status_enum: {
        Args: { test_value: string };
        Returns: boolean;
      };
      test_event_status_enum: {
        Args: { test_value: string };
        Returns: boolean;
      };
      test_payment_method_enum: {
        Args: { test_value: string };
        Returns: boolean;
      };
      test_payment_status_enum: {
        Args: { test_value: string };
        Returns: boolean;
      };
      test_payout_status_enum: {
        Args: { test_value: string };
        Returns: boolean;
      };
      test_stripe_account_status_enum: {
        Args: { test_value: string };
        Returns: boolean;
      };
      verify_seed_data: {
        Args: Record<PropertyKey, never>;
        Returns: {
          record_count: number;
          status: string;
          table_name: string;
        }[];
      };
    };
    Enums: {
      attendance_status_enum: "attending" | "not_attending" | "maybe";
      event_status_enum: "upcoming" | "ongoing" | "past" | "cancelled";
      payment_method_enum: "stripe" | "cash" | "free";
      payment_status_enum:
        | "pending"
        | "paid"
        | "failed"
        | "received"
        | "completed"
        | "refunded"
        | "waived";
      payout_status_enum: "pending" | "processing" | "completed" | "failed";
      stripe_account_status_enum: "unverified" | "onboarding" | "verified" | "restricted";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DefaultSchema = Database[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      attendance_status_enum: ["attending", "not_attending", "maybe"],
      event_status_enum: ["upcoming", "ongoing", "past", "cancelled"],
      payment_method_enum: ["stripe", "cash", "free"],
      payment_status_enum: [
        "pending",
        "paid",
        "failed",
        "received",
        "completed",
        "refunded",
        "waived",
      ],
      payout_status_enum: ["pending", "processing", "completed", "failed"],
      stripe_account_status_enum: ["unverified", "onboarding", "verified", "restricted"],
    },
  },
} as const;
