-- ====================================================================
-- EventPay: 統合初期スキーマ第3部 - トリガー・RLSポリシー・権限設定
-- 目的: トリガー、RLSポリシー、権限設定の定義
-- ====================================================================

BEGIN;

-- ====================================================================
-- 7. ストアドプロシージャ・関数群
-- ====================================================================

-- 参加登録のためのストアドプロシージャ
CREATE OR REPLACE FUNCTION public.register_attendance_with_payment(
  p_event_id UUID,
  p_nickname VARCHAR,
  p_email VARCHAR,
  p_status public.attendance_status_enum,
  p_guest_token VARCHAR,
  p_payment_method public.payment_method_enum DEFAULT NULL,
  p_event_fee INTEGER DEFAULT 0  -- 呼び出し時点で確定した参加費を渡す（主催者がfeeを変更してもゲストが見た金額で決済を行うため・個別価格拡張を想定）
)
RETURNS UUID -- 新しく作成されたattendanceのIDを返す
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_attendance_id UUID;
  v_event_exists BOOLEAN;
BEGIN
  -- 入力パラメータの検証
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'Event ID cannot be null';
  END IF;

  IF p_nickname IS NULL OR LENGTH(TRIM(p_nickname)) = 0 THEN
    RAISE EXCEPTION 'Nickname cannot be null or empty';
  END IF;

  IF p_email IS NULL OR LENGTH(TRIM(p_email)) = 0 THEN
    RAISE EXCEPTION 'Email cannot be null or empty';
  END IF;

  IF p_status IS NULL THEN
    RAISE EXCEPTION 'Status cannot be null';
  END IF;

  -- ゲストトークンの検証
  IF p_guest_token IS NULL OR LENGTH(p_guest_token) != 36 THEN
    RAISE EXCEPTION 'Guest token must be exactly 36 characters long with gst_ prefix, got: %', COALESCE(LENGTH(p_guest_token), 0);
  END IF;

  -- ゲストトークンの形式を検証
  IF NOT (p_guest_token ~ '^gst_[a-zA-Z0-9_-]{32}$') THEN
    RAISE EXCEPTION 'Guest token must have format gst_[32 alphanumeric chars], got: %', LEFT(p_guest_token, 8) || '...';
  END IF;

  -- イベントが存在するか確認し、定員を取得
  SELECT EXISTS(SELECT 1 FROM public.events WHERE id = p_event_id FOR UPDATE) INTO v_event_exists;
  IF NOT v_event_exists THEN
    RAISE EXCEPTION 'Event with ID % does not exist', p_event_id;
  END IF;

  -- 定員チェック（attending状態の場合のみ）
  IF p_status = 'attending' THEN
    DECLARE
      v_capacity INTEGER;
      v_current_attendees INTEGER;
    BEGIN
      -- イベントの定員を取得
      SELECT capacity INTO v_capacity FROM public.events WHERE id = p_event_id;

      -- 定員が設定されている場合のみチェック
      IF v_capacity IS NOT NULL THEN
        -- 現在の参加者数を取得（排他ロック付き）
        SELECT COUNT(*) INTO v_current_attendees
        FROM public.attendances
        WHERE event_id = p_event_id AND status = 'attending'
        FOR UPDATE;

        -- 定員超過チェック
        IF v_current_attendees >= v_capacity THEN
          RAISE EXCEPTION 'Event capacity (%) has been reached. Current attendees: %', v_capacity, v_current_attendees;
        END IF;
      END IF;
    END;
  END IF;

  -- ゲストトークンの重複チェック
  IF EXISTS(SELECT 1 FROM public.attendances WHERE guest_token = p_guest_token) THEN
    RAISE EXCEPTION 'Guest token already exists: %', LEFT(p_guest_token, 8) || '...';
  END IF;

  -- 1. attendancesテーブルに参加記録を挿入
  BEGIN
    INSERT INTO public.attendances (event_id, nickname, email, status, guest_token)
    VALUES (p_event_id, p_nickname, p_email, p_status, p_guest_token)
    RETURNING id INTO v_attendance_id;

    -- 挿入が成功したかを確認
    IF v_attendance_id IS NULL THEN
      RAISE EXCEPTION 'Failed to insert attendance record';
    END IF;

  EXCEPTION
    WHEN unique_violation THEN
      -- 重複エラーの詳細を提供
      IF SQLSTATE = '23505' AND CONSTRAINT_NAME = 'attendances_guest_token_key' THEN
        RAISE EXCEPTION 'Guest token already exists (unique constraint violation): %', LEFT(p_guest_token, 8) || '...';
      ELSE
        RAISE EXCEPTION 'Unique constraint violation: %', SQLERRM;
      END IF;
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Failed to insert attendance: %', SQLERRM;
  END;

  -- 2. 参加ステータスが'attending'で、イベントが有料の場合、paymentsテーブルに決済記録を挿入
  IF p_status = 'attending' AND p_event_fee > 0 AND p_payment_method IS NOT NULL THEN
    BEGIN
      INSERT INTO public.payments (attendance_id, amount, method, status)
      VALUES (v_attendance_id, p_event_fee, p_payment_method, 'pending');
    EXCEPTION
      WHEN OTHERS THEN
        -- 決済記録の挿入に失敗した場合、参加記録も削除してロールバック
        DELETE FROM public.attendances WHERE id = v_attendance_id;
        RAISE EXCEPTION 'Failed to insert payment record: %', SQLERRM;
    END;
  END IF;

  RETURN v_attendance_id;
END;
$$;

COMMENT ON FUNCTION public.register_attendance_with_payment IS 'イベント参加登録と決済レコード作成を一括で実行する関数（gst_形式トークン対応）';

-- ゲスト参加状況更新のためのストアドプロシージャ
CREATE OR REPLACE FUNCTION public.update_guest_attendance_with_payment(
  p_attendance_id UUID,
  p_status public.attendance_status_enum,
  p_payment_method public.payment_method_enum DEFAULT NULL,
  p_event_fee INTEGER DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_id UUID;
  v_payment_id UUID;
  v_current_status public.attendance_status_enum;
  v_capacity INTEGER;
  v_current_attendees INTEGER;
  v_payment_status public.payment_status_enum;
  v_payment_method public.payment_method_enum;
BEGIN
  -- 参加記録の存在確認と現在のステータス取得
  SELECT event_id, status INTO v_event_id, v_current_status
  FROM public.attendances
  WHERE id = p_attendance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance record not found';
  END IF;

  -- 定員チェック（attendingに変更する場合のみ）
  IF p_status = 'attending' AND v_current_status != 'attending' THEN
    SELECT capacity INTO v_capacity FROM public.events WHERE id = v_event_id FOR UPDATE;
    IF v_capacity IS NOT NULL THEN
      SELECT COUNT(*) INTO v_current_attendees
      FROM public.attendances
      WHERE event_id = v_event_id AND status = 'attending' AND id != p_attendance_id;

      IF v_current_attendees >= v_capacity THEN
        RAISE EXCEPTION 'Event capacity (%) has been reached. Current attendees: %', v_capacity, v_current_attendees;
      END IF;
    END IF;
  END IF;

  -- 参加ステータスを更新
  UPDATE public.attendances
  SET
    status = p_status
  WHERE id = p_attendance_id;

  -- 決済レコードの処理
  IF p_status = 'attending' AND p_event_fee > 0 AND p_payment_method IS NOT NULL THEN
    -- 既存の決済レコードを確認
    SELECT id INTO v_payment_id
    FROM public.payments
    WHERE attendance_id = p_attendance_id
    ORDER BY updated_at DESC
    LIMIT 1;

    IF v_payment_id IS NOT NULL THEN
      -- 既存の決済レコードを更新
      UPDATE public.payments
      SET
        method = p_payment_method,
        amount = p_event_fee,
        status = 'pending'
      WHERE id = v_payment_id;
    ELSE
      -- 新しい決済レコードを作成
      INSERT INTO public.payments (
        attendance_id,
        amount,
        method,
        status
      ) VALUES (
        p_attendance_id,
        p_event_fee,
        p_payment_method,
        'pending'
      );
    END IF;
  ELSIF p_status != 'attending' THEN
    -- 既存の決済レコードを取得
    SELECT id, status, method INTO v_payment_id, v_payment_status, v_payment_method
    FROM public.payments
    WHERE attendance_id = p_attendance_id
    ORDER BY updated_at DESC
    LIMIT 1;

    IF FOUND THEN
      IF v_payment_status IN ('pending', 'failed') THEN
        -- 未決済は削除（監査ログを記録）
        DELETE FROM public.payments WHERE id = v_payment_id;
        INSERT INTO public.system_logs(operation_type, details)
        VALUES (
          'unpaid_payment_deleted',
          jsonb_build_object('attendanceId', p_attendance_id, 'paymentId', v_payment_id, 'previousStatus', v_payment_status)
        );
      ELSIF v_payment_status IN ('paid', 'received', 'completed') THEN
        -- 決済済みは削除せず、返金フローへ
        IF v_payment_method = 'cash' THEN
          -- 現金は即時にrefundedへ
          UPDATE public.payments
          SET status = 'refunded'
          WHERE id = v_payment_id;
          -- 監査ログ
          INSERT INTO public.system_logs(operation_type, details)
          VALUES (
            'cash_refund_recorded',
            jsonb_build_object('attendanceId', p_attendance_id, 'paymentId', v_payment_id)
          );
        ELSE
          -- Stripeは返金要求をログし、レコードは維持（アプリ層で返金実行後にrefundedへ）
          INSERT INTO public.system_logs(operation_type, details)
          VALUES (
            'stripe_refund_required',
            jsonb_build_object('attendanceId', p_attendance_id, 'paymentId', v_payment_id)
          );
        END IF;
      ELSIF v_payment_status = 'waived' THEN
        -- 免除は維持（必要に応じてログ）
        INSERT INTO public.system_logs(operation_type, details)
        VALUES (
          'waived_payment_kept',
          jsonb_build_object('attendanceId', p_attendance_id, 'paymentId', v_payment_id)
        );
      END IF;
    END IF;
  END IF;

  RETURN;
END;
$$;

COMMENT ON FUNCTION public.update_guest_attendance_with_payment IS 'ゲスト参加状況更新と決済処理（参加キャンセル時の決済処理安全化版）';

-- セキュリティ監査ログのクリーンアップ関数（古いログを削除）
CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER := 0;
    temp_count INTEGER;
BEGIN
    -- 管理者アクセス監査ログのクリーンアップ
    DELETE FROM public.admin_access_audit
    WHERE created_at < NOW() - INTERVAL '1 day' * retention_days;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;

    -- ゲストアクセス監査ログのクリーンアップ
    DELETE FROM public.guest_access_audit
    WHERE created_at < NOW() - INTERVAL '1 day' * retention_days;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;

    -- 疑わしい活動ログのクリーンアップ（調査済みのもののみ）
    DELETE FROM public.suspicious_activity_log
    WHERE created_at < NOW() - INTERVAL '1 day' * retention_days
    AND investigated_at IS NOT NULL;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;

    -- 不正アクセス試行ログのクリーンアップ
    DELETE FROM public.unauthorized_access_log
    WHERE created_at < NOW() - INTERVAL '1 day' * retention_days;
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;

    RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION public.cleanup_old_audit_logs IS '指定した日数より古い監査ログを削除する関数';

-- PayoutSchedulerの古いログを削除する関数
CREATE OR REPLACE FUNCTION public.cleanup_old_scheduler_logs(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- 指定日数より古いログを削除
    DELETE FROM public.payout_scheduler_logs
    WHERE start_time < (now() - (retention_days || ' days')::INTERVAL);

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION public.cleanup_old_scheduler_logs IS 'PayoutSchedulerの古いログを削除する関数';

-- テスト用テーブルのクリーンアップ関数 (開発環境専用)
CREATE OR REPLACE FUNCTION public.cleanup_test_tables_dev_only()
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
    -- 警告: この関数は開発環境専用です。本番環境で実行しないでください。
    RAISE WARNING 'Executing development-only cleanup function. This should not be run in production.';

    DELETE FROM public.payouts;
    DELETE FROM public.payments;
    DELETE FROM public.attendances;
    DELETE FROM public.invite_links;
    DELETE FROM public.events;
    DELETE FROM public.stripe_connect_accounts;
    DELETE FROM public.users;
    -- auth.usersは別途テストコードで管理
    RAISE NOTICE 'Test data cleanup completed for all public tables.';
END;
$$;

COMMENT ON FUNCTION public.cleanup_test_tables_dev_only IS 'テストデータクリーンアップ関数（開発環境専用）';

-- 孤立ユーザー検出関数 (30日以上活動のないユーザー)
CREATE OR REPLACE FUNCTION public.detect_orphaned_users()
RETURNS TABLE(user_id UUID, email TEXT, days_since_creation INTEGER)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT u.id, au.email, EXTRACT(DAYS FROM NOW() - u.created_at)::INTEGER
    FROM public.users u
    JOIN auth.users au ON u.id = au.id
    WHERE u.created_at < NOW() - INTERVAL '30 days'
      AND NOT EXISTS(SELECT 1 FROM public.events WHERE created_by = u.id);
END;
$$;

COMMENT ON FUNCTION public.detect_orphaned_users IS '30日以上活動のない孤立ユーザーを検出する関数';

-- セキュリティイベント記録関数
CREATE OR REPLACE FUNCTION public.log_security_event(p_event_type TEXT, p_details JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.security_audit_log (event_type, details, user_role, ip_address)
    VALUES (p_event_type, p_details, auth.role(), inet_client_addr());
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to log security event: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION public.log_security_event IS 'セキュリティイベントをログに記録する関数';

-- ====================================================================
-- 8. トリガー関数とトリガー
-- ====================================================================

-- updated_at 自動更新関数
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

-- 定員チェック関数
CREATE OR REPLACE FUNCTION public.check_attendance_capacity_limit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE event_capacity INTEGER; current_attending_count INTEGER;
BEGIN
    IF NEW.status = 'attending' THEN
        SELECT capacity INTO event_capacity FROM public.events WHERE id = NEW.event_id;
        IF event_capacity IS NOT NULL THEN
            SELECT COUNT(*) INTO current_attending_count FROM public.attendances WHERE event_id = NEW.event_id AND status = 'attending';
            IF current_attending_count >= event_capacity THEN RAISE EXCEPTION 'イベントの定員（%名）に達しています。', event_capacity; END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- Payment status rollback prevention function
CREATE OR REPLACE FUNCTION public.prevent_payment_status_rollback()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF public.status_rank(NEW.status) < public.status_rank(OLD.status) THEN
      RAISE EXCEPTION 'Rejecting status rollback: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ユーザープロファイル自動作成関数
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- auth.usersからのメタデータを使用してpublic.usersにプロファイルを作成
  INSERT INTO public.users (id, name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'ユーザー')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.handle_new_user() IS 'auth.usersテーブルに新しいユーザーが作成された際に、自動的にpublic.usersテーブルにプロファイルレコードを作成する関数';

-- ====================================================================
-- 9. トリガー作成
-- ====================================================================

-- updated_at自動更新トリガー
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_attendances_updated_at BEFORE UPDATE ON public.attendances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_stripe_connect_accounts_updated_at BEFORE UPDATE ON public.stripe_connect_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_payouts_updated_at BEFORE UPDATE ON public.payouts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_invite_links_updated_at BEFORE UPDATE ON public.invite_links FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 定員チェックトリガー
CREATE TRIGGER check_attendance_capacity_before_insert_or_update
BEFORE INSERT OR UPDATE ON public.attendances FOR EACH ROW EXECUTE FUNCTION public.check_attendance_capacity_limit();

-- Payment status rollback prevention trigger
CREATE TRIGGER trg_prevent_payment_status_rollback
BEFORE UPDATE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.prevent_payment_status_rollback();

-- ユーザー自動作成トリガー
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ====================================================================
-- 10. Row Level Security (RLS) ポリシー
-- ====================================================================

-- users: 自分の情報のみアクセス可能
CREATE POLICY "Users can view own profile" ON public.users FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- events: 認証済みユーザーは全てのイベントを閲覧可能、作成者のみ管理可能
CREATE POLICY "Authenticated users can view all events" ON public.events FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Creators can manage own events" ON public.events FOR ALL TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

-- 招待リンク経由でのイベント詳細読み取りアクセス
CREATE POLICY "Invite link access to events" ON public.events FOR SELECT TO anon, authenticated USING (
  EXISTS (
    SELECT 1 FROM public.invite_links il
    WHERE il.event_id = events.id
    AND il.expires_at > NOW()
    AND (il.max_uses IS NULL OR il.current_uses < il.max_uses)
  )
);

-- ゲストが参加するイベント情報への読み取り専用アクセス
CREATE POLICY "Guest token read event details" ON public.events FOR SELECT TO anon, authenticated USING (
  EXISTS (
    SELECT 1 FROM public.attendances a
    WHERE a.event_id = events.id
    AND a.guest_token IS NOT NULL
    AND a.guest_token = public.get_guest_token()
  )
);

-- attendances: 関係者のみ閲覧可能、書き込みはサーバーサイドのみ
CREATE POLICY "Related parties can view attendances" ON public.attendances FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.events WHERE id = attendances.event_id AND created_by = auth.uid())
);

-- ゲストトークンによる読み取りアクセス
CREATE POLICY "Guest token read access for attendances" ON public.attendances FOR SELECT TO anon, authenticated USING (
  guest_token IS NOT NULL
  AND guest_token = public.get_guest_token()
);

-- ゲストトークンによる更新アクセス（期限内のみ）
CREATE POLICY "Guest token update for attendances" ON public.attendances FOR UPDATE TO anon, authenticated
USING (
  guest_token IS NOT NULL
  AND guest_token = public.get_guest_token()
  AND EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = attendances.event_id
    AND e.status = 'upcoming'
    AND (e.registration_deadline IS NULL OR e.registration_deadline > NOW())
    AND e.date > NOW()
  )
)
WITH CHECK (
  guest_token IS NOT NULL
  AND guest_token = public.get_guest_token()
  AND EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = attendances.event_id
    AND e.status = 'upcoming'
    AND (e.registration_deadline IS NULL OR e.registration_deadline > NOW())
    AND e.date > NOW()
  )
);

-- Service role can manage attendances (Server Actions用)
CREATE POLICY "Service role can manage attendances" ON public.attendances FOR ALL TO service_role USING (true) WITH CHECK (true);

-- payments: 関係者のみ閲覧可能、書き込みはサーバーサイドのみ
CREATE POLICY "Creators can view payments" ON public.payments FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.attendances a JOIN public.events e ON a.event_id = e.id WHERE a.id = payments.attendance_id AND e.created_by = auth.uid())
);

-- 主催者は自分のイベントの決済情報のみ閲覧可能
CREATE POLICY "event_creators_can_view_payments" ON public.payments FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.attendances a
        JOIN public.events e ON a.event_id = e.id
        WHERE a.id = payments.attendance_id
        AND e.created_by = auth.uid()
    )
);

-- ゲストが自分の決済情報を確認するための読み取り専用アクセス
CREATE POLICY "Guest token read payment details" ON public.payments FOR SELECT TO anon, authenticated USING (
  EXISTS (
    SELECT 1 FROM public.attendances a
    WHERE a.id = payments.attendance_id
    AND a.guest_token IS NOT NULL
    AND a.guest_token = public.get_guest_token()
  )
);

-- ゲストトークンによる決済情報の更新（支払い方法変更など）
CREATE POLICY "Guest token update payment details" ON public.payments FOR UPDATE TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.attendances a
    JOIN public.events e ON a.event_id = e.id
    WHERE a.id = payments.attendance_id
    AND a.guest_token IS NOT NULL
    AND a.guest_token = public.get_guest_token()
    AND e.status = 'upcoming'
    AND (e.payment_deadline IS NULL OR e.payment_deadline > NOW())
    AND e.date > NOW()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.attendances a
    JOIN public.events e ON a.event_id = e.id
    WHERE a.id = payments.attendance_id
    AND a.guest_token IS NOT NULL
    AND a.guest_token = public.get_guest_token()
    AND e.status = 'upcoming'
    AND (e.payment_deadline IS NULL OR e.payment_deadline > NOW())
    AND e.date > NOW()
  )
);

CREATE POLICY "Service role can manage payments" ON public.payments FOR ALL TO service_role USING (true) WITH CHECK (true);

-- stripe_connect_accounts & payouts: 自分 or service_roleのみ管理可能
CREATE POLICY "Users can manage own stripe accounts" ON public.stripe_connect_accounts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_can_view_own_stripe_accounts" ON public.stripe_connect_accounts FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ユーザーは自分の送金情報のみ閲覧可能
CREATE POLICY "Users can view own payouts" ON public.payouts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users_can_view_own_payouts" ON public.payouts FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 主催者は自分のイベントの送金情報のみ閲覧可能
CREATE POLICY "event_creators_can_view_payouts" ON public.payouts FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = payouts.event_id
        AND e.created_by = auth.uid()
    )
);

-- Settlement reports: イベント主催者は自分のイベントの清算レポートを閲覧可能
CREATE POLICY "event_creators_can_view_settlement_reports" ON public.payouts FOR SELECT TO authenticated USING (
    settlement_mode = 'destination_charge' AND
    EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = payouts.event_id
        AND e.created_by = auth.uid()
    )
);

CREATE POLICY "Service role can manage stripe/payout info" ON public.stripe_connect_accounts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage payouts" ON public.payouts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- invite_links: 作成者のみ管理可能、誰でも有効なリンクは閲覧可能
CREATE POLICY "Creators can manage invite links" ON public.invite_links FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.events WHERE id = invite_links.event_id AND created_by = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.events WHERE id = invite_links.event_id AND created_by = auth.uid()));
CREATE POLICY "Anyone can view valid invite links" ON public.invite_links FOR SELECT TO anon, authenticated
    USING (expires_at > NOW() AND (max_uses IS NULL OR current_uses < max_uses));

-- webhook_events: 管理者のみアクセス可能
CREATE POLICY "webhook_events_admin_only" ON public.webhook_events FOR ALL TO authenticated USING (false);
CREATE POLICY "webhook_events_service_role" ON public.webhook_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- scheduler_locks: サービスロールのみアクセス可能
CREATE POLICY "Allow service role access to scheduler_locks" ON public.scheduler_locks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- payout_scheduler_logs: 管理者のみアクセス可能
CREATE POLICY "admin_can_view_scheduler_logs" ON public.payout_scheduler_logs FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM auth.users
        WHERE auth.users.id = auth.uid()
        AND auth.users.email IN (
            'admin@eventpay.com',
            'support@eventpay.com'
        )
    )
);
CREATE POLICY "system_can_manage_scheduler_logs" ON public.payout_scheduler_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- システム・セキュリティログ: service_roleのみアクセス可能
CREATE POLICY "Service role can access system logs" ON public.system_logs FOR ALL TO service_role USING (true);
CREATE POLICY "Service role can access security logs" ON public.security_audit_log FOR ALL TO service_role USING (true);

-- セキュリティ監査テーブル: service_roleのみアクセス可能
CREATE POLICY "Service role can access admin audit logs" ON public.admin_access_audit FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can view own admin audit logs" ON public.admin_access_audit FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Service role can access guest audit logs" ON public.guest_access_audit FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can access suspicious activity logs" ON public.suspicious_activity_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can access unauthorized access logs" ON public.unauthorized_access_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ====================================================================
-- 11. 権限設定
-- ====================================================================

-- 基本権限
GRANT ALL ON public.system_logs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.system_logs_id_seq TO service_role;
GRANT ALL ON public.security_audit_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.security_audit_log_id_seq TO service_role;

-- セキュリティ監査テーブル権限
GRANT ALL ON public.admin_access_audit TO service_role;
GRANT ALL ON public.guest_access_audit TO service_role;
GRANT ALL ON public.suspicious_activity_log TO service_role;
GRANT ALL ON public.unauthorized_access_log TO service_role;

-- 関数実行権限
GRANT EXECUTE ON FUNCTION public.get_event_creator_name(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_guest_token() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_test_guest_token(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clear_test_guest_token() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hash_guest_token(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_audit_logs(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_scheduler_logs(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_test_tables_dev_only() TO service_role;
GRANT EXECUTE ON FUNCTION public.detect_orphaned_users() TO service_role;
GRANT EXECUTE ON FUNCTION public.log_security_event(TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_settlement_aggregations(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_payment_record(UUID, public.payment_method_enum, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.force_release_payout_scheduler_lock() TO service_role;

-- ユーザープロファイル自動作成関数の権限
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated, anon, public;

-- ====================================================================
-- 12. コメント追加
-- ====================================================================

-- テーブルコメント
COMMENT ON TABLE public.users IS '運営者情報（Supabase auth.usersと同期）';
COMMENT ON TABLE public.events IS 'イベント情報';
COMMENT ON TABLE public.attendances IS 'イベントへの出欠情報';
COMMENT ON TABLE public.payments IS '決済情報（Destination charges対応）';
COMMENT ON TABLE public.stripe_connect_accounts IS 'Stripe Connectアカウント情報';
COMMENT ON TABLE public.payouts IS '運営者への売上送金履歴（レポート・スナップショット用途）';
COMMENT ON TABLE public.invite_links IS 'イベント招待リンク';
COMMENT ON TABLE public.webhook_events IS 'Webhook処理の冪等性を保証するためのテーブル';
COMMENT ON TABLE public.fee_config IS '手数料設定テーブル（シングルトン）';
COMMENT ON TABLE public.scheduler_locks IS 'スケジューラー排他制御用テーブル。行ロックによる確実な単一実行を保証する';
COMMENT ON TABLE public.payout_scheduler_logs IS 'PayoutScheduler実行ログテーブル - 自動送金処理の実行履歴を記録';
COMMENT ON TABLE public.system_logs IS 'システムログテーブル';
COMMENT ON TABLE public.security_audit_log IS 'セキュリティ監査ログテーブル';
COMMENT ON TABLE public.admin_access_audit IS '管理者権限を使用したデータベースアクセスの監査ログ';
COMMENT ON TABLE public.guest_access_audit IS 'ゲストトークンを使用したアクセスの監査ログ';
COMMENT ON TABLE public.suspicious_activity_log IS '疑わしい活動やセキュリティ違反の可能性がある操作のログ';
COMMENT ON TABLE public.unauthorized_access_log IS '不正なアクセス試行や権限違反の記録';

-- カラムコメント（主要なもの）
COMMENT ON COLUMN public.payments.application_fee_amount IS 'プラットフォーム手数料（円）';
COMMENT ON COLUMN public.payments.stripe_checkout_session_id IS 'Stripe Checkout Session ID';
COMMENT ON COLUMN public.payments.transfer_group IS 'イベント単位の送金グループ識別子';
COMMENT ON COLUMN public.payments.stripe_charge_id IS 'Stripe Charge ID（確定時に保存）';
COMMENT ON COLUMN public.payments.stripe_balance_transaction_id IS 'Stripe Balance Transaction ID';
COMMENT ON COLUMN public.payments.stripe_customer_id IS 'Stripe Customer ID（将来の継続課金用）';
COMMENT ON COLUMN public.payments.stripe_transfer_id IS 'Stripe Transfer ID（自動Transfer相関用）';
COMMENT ON COLUMN public.payments.refunded_amount IS '返金累積額（円）';
COMMENT ON COLUMN public.payments.destination_account_id IS 'Stripe Connect宛先アカウントID';
COMMENT ON COLUMN public.payments.application_fee_id IS 'Stripe Application Fee ID';
COMMENT ON COLUMN public.payments.application_fee_refund_id IS 'Stripe Application Fee Refund ID';
COMMENT ON COLUMN public.payments.application_fee_refunded_amount IS 'プラットフォーム手数料返金額（円）';
COMMENT ON COLUMN public.payments.application_fee_tax_rate IS 'Tax rate applied to application fee (e.g., 10.00 for 10%)';
COMMENT ON COLUMN public.payments.application_fee_tax_amount IS 'Tax amount in yen (integer)';
COMMENT ON COLUMN public.payments.application_fee_excl_tax IS 'Application fee excluding tax in yen (integer)';
COMMENT ON COLUMN public.payments.tax_included IS 'Whether the application_fee_amount includes tax (true=tax included, false=tax excluded)';

COMMENT ON COLUMN public.payouts.settlement_mode IS '送金モード（destination_charge固定）';
COMMENT ON COLUMN public.payouts.generated_at IS 'レポート生成日時';
COMMENT ON COLUMN public.payouts.transfer_group IS 'イベント単位の送金グループ識別子';
COMMENT ON COLUMN public.payouts.stripe_account_id IS 'Stripe Connect Account ID';
COMMENT ON COLUMN public.payouts.retry_count IS '送金処理のリトライ回数';
COMMENT ON COLUMN public.payouts.last_error IS '最後に発生したエラーメッセージ';

COMMENT ON COLUMN public.fee_config.stripe_base_rate IS 'Stripe 決済手数料の割合 (0.039 = 3.9%)';
COMMENT ON COLUMN public.fee_config.stripe_fixed_fee IS 'Stripe 決済手数料の固定額 (円)';
COMMENT ON COLUMN public.fee_config.min_payout_amount IS '最小送金金額 (円)';
COMMENT ON COLUMN public.fee_config.platform_tax_rate IS 'Platform consumption tax rate (e.g., 10.00 for 10%)';
COMMENT ON COLUMN public.fee_config.is_tax_included IS 'Whether platform fees are calculated as tax-included (true=内税, false=外税)';

COMMENT ON COLUMN public.webhook_events.stripe_account_id IS 'Stripe Connect Account ID（Connect イベント相関用）';
COMMENT ON COLUMN public.webhook_events.retry_count IS 'Webhook再試行回数';
COMMENT ON COLUMN public.webhook_events.last_retry_at IS '最終再試行日時';
COMMENT ON COLUMN public.webhook_events.status IS 'Webhook処理状態（processed/failed）';
COMMENT ON COLUMN public.webhook_events.processing_error IS 'Webhook処理エラー詳細';
COMMENT ON COLUMN public.webhook_events.stripe_event_created IS 'Stripe event.created (epoch seconds). Used for FIFO ordering to reduce out-of-order processing.';
COMMENT ON COLUMN public.webhook_events.object_id IS 'Stripe data.object.id captured for duplicate detection across separate events of the same type.';

COMMENT ON COLUMN public.guest_access_audit.guest_token_hash IS 'セキュリティのためSHA-256でハッシュ化されたゲストトークン';
COMMENT ON COLUMN public.suspicious_activity_log.false_positive IS '誤検知フラグ - 調査の結果、問題なしと判定された場合にTRUEに設定';
COMMENT ON COLUMN public.unauthorized_access_log.blocked_by_rls IS 'RLSポリシーによってアクセスがブロックされた場合にTRUE';

-- 完了通知
DO $$ BEGIN
    RAISE NOTICE '✅ EventPay統合スキーマが正常に作成されました。';
    RAISE NOTICE '   - 全てのテーブル、インデックス、関数が作成されました';
    RAISE NOTICE '   - トリガーとRLSポリシーが設定されました';
    RAISE NOTICE '   - 権限が適切に付与されました';
    RAISE NOTICE '   - Destination charges対応が完了しました';
    RAISE NOTICE '   - セキュリティ監査機能が有効になりました';
END $$;

COMMIT;
