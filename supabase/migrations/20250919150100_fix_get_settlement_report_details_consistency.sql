-- get_settlement_report_details関数の一貫性修正
-- 他の清算関数との一貫性を保つため、ステータス条件を'paid'のみからIN ('paid', 'refunded')に変更し、返金済み決済も含める

CREATE OR REPLACE FUNCTION "public"."get_settlement_report_details"(
    "input_created_by" "uuid",
    "input_event_ids" "uuid"[] DEFAULT NULL::"uuid"[],
    "p_from_date" timestamp with time zone DEFAULT NULL::timestamp with time zone,
    "p_to_date" timestamp with time zone DEFAULT NULL::timestamp with time zone,
    "p_limit" integer DEFAULT 50,
    "p_offset" integer DEFAULT 0
)
RETURNS TABLE(
    "report_id" "uuid",
    "event_id" "uuid",
    "event_title" character varying,
    "event_date" timestamp with time zone,
    "stripe_account_id" character varying,
    "transfer_group" character varying,
    "generated_at" timestamp with time zone,
    "total_stripe_sales" integer,
    "total_stripe_fee" integer,
    "total_application_fee" integer,
    "net_payout_amount" integer,
    "payment_count" integer,
    "refunded_count" integer,
    "total_refunded_amount" integer,
    "settlement_mode" "public"."settlement_mode_enum",
    "status" "public"."payout_status_enum"
)
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id AS report_id,
        p.event_id,
        e.title AS event_title,
        e.date AS event_date,
        p.stripe_account_id,
        p.transfer_group,
        p.generated_at,

        p.total_stripe_sales,
        p.total_stripe_fee,
        p.platform_fee AS total_application_fee,
        p.net_payout_amount,

        -- 決済件数を動的に取得 (修正: IN ('paid', 'refunded') で一貫性確保)
        (
            SELECT COUNT(*)::INT
            FROM public.payments pay
            JOIN public.attendances att ON pay.attendance_id = att.id
            WHERE att.event_id = p.event_id
              AND pay.method = 'stripe'
              AND pay.status IN ('paid', 'refunded')
        ) AS payment_count,

        -- 返金件数・金額を動的に取得
        (
            SELECT COUNT(*)::INT
            FROM public.payments pay
            JOIN public.attendances att ON pay.attendance_id = att.id
            WHERE att.event_id = p.event_id
              AND pay.method = 'stripe'
              AND pay.refunded_amount > 0
        ) AS refunded_count,

        (
            SELECT COALESCE(SUM(pay.refunded_amount), 0)::INT
            FROM public.payments pay
            JOIN public.attendances att ON pay.attendance_id = att.id
            WHERE att.event_id = p.event_id
              AND pay.method = 'stripe'
              AND pay.refunded_amount > 0
        ) AS total_refunded_amount,

        p.settlement_mode,
        p.status
    FROM public.settlements p
    JOIN public.events e ON p.event_id = e.id
    WHERE p.user_id = input_created_by
      AND p.settlement_mode = 'destination_charge'
      AND (input_event_ids IS NULL OR p.event_id = ANY(input_event_ids))
      AND (p_from_date IS NULL OR p.generated_at >= p_from_date)
      AND (p_to_date IS NULL OR p.generated_at <= p_to_date)
    ORDER BY p.generated_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- 権限付与
GRANT ALL ON FUNCTION "public"."get_settlement_report_details"("input_created_by" "uuid", "input_event_ids" "uuid"[], "p_from_date" timestamp with time zone, "p_to_date" timestamp with time zone, "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_settlement_report_details"("input_created_by" "uuid", "input_event_ids" "uuid"[], "p_from_date" timestamp with time zone, "p_to_date" timestamp with time zone, "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_settlement_report_details"("input_created_by" "uuid", "input_event_ids" "uuid"[], "p_from_date" timestamp with time zone, "p_to_date" timestamp with time zone, "p_limit" integer, "p_offset" integer) TO "service_role";

-- 修正内容を記録するコメントを追加
COMMENT ON FUNCTION "public"."get_settlement_report_details"("input_created_by" "uuid", "input_event_ids" "uuid"[], "p_from_date" timestamp with time zone, "p_to_date" timestamp with time zone, "p_limit" integer, "p_offset" integer) IS '一貫した決済ステータスフィルタリング（paid + refunded）を適用した清算レポート詳細。他の清算関数との一貫性を保つためpayment_count計算を修正。';
