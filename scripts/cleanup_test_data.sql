-- ====================================================================================================
-- UIテスト用テストデータクリーンアップスクリプト
-- ====================================================================================================
-- create_test_data.sql で作成したテストデータを安全に削除します
--
-- 実行前の準備:
-- 1. テストユーザーのUUIDを確認・更新してください
-- 2. 本番環境では実行しないでください
-- 3. バックアップを取ってから実行することを強く推奨します
-- ====================================================================================================

DO $$
DECLARE
    -- ⚠️ ここに実際のテストユーザーのUUIDを設定してください
    test_user_id UUID := '00000000-0000-0000-0000-000000000001'; -- PLACEHOLDER: 実際のUUIDに変更

    -- カウンター
    deleted_settlements INTEGER := 0;
    deleted_payments INTEGER := 0;
    deleted_attendances INTEGER := 0;
    deleted_events INTEGER := 0;
    deleted_stripe_accounts INTEGER := 0;
BEGIN
    RAISE NOTICE 'テストデータクリーンアップ開始...';
    RAISE NOTICE 'テストユーザーID: %', test_user_id;

    -- ユーザー存在確認
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = test_user_id) THEN
        RAISE NOTICE 'ユーザーが見つかりません: %', test_user_id;
        RETURN;
    END IF;

    -- ====================================================================================================
    -- 1. 清算データ（settlements）削除
    -- ====================================================================================================

    WITH deleted AS (
        DELETE FROM public.settlements
        WHERE user_id = test_user_id
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_settlements FROM deleted;

    RAISE NOTICE '削除された清算データ数: %', deleted_settlements;

    -- ====================================================================================================
    -- 2. 決済データ（payments）削除
    -- ====================================================================================================

    WITH deleted AS (
        DELETE FROM public.payments
        WHERE attendance_id IN (
            SELECT a.id FROM public.attendances a
            JOIN public.events e ON a.event_id = e.id
            WHERE e.created_by = test_user_id
        )
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_payments FROM deleted;

    RAISE NOTICE '削除された決済データ数: %', deleted_payments;

    -- ====================================================================================================
    -- 3. 参加者データ（attendances）削除
    -- ====================================================================================================

    WITH deleted AS (
        DELETE FROM public.attendances
        WHERE event_id IN (
            SELECT id FROM public.events WHERE created_by = test_user_id
        )
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_attendances FROM deleted;

    RAISE NOTICE '削除された参加者データ数: %', deleted_attendances;

    -- ====================================================================================================
    -- 4. イベントデータ（events）削除
    -- ====================================================================================================

    WITH deleted AS (
        DELETE FROM public.events
        WHERE created_by = test_user_id
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_events FROM deleted;

    RAISE NOTICE '削除されたイベントデータ数: %', deleted_events;

    -- ====================================================================================================
    -- 5. Stripe Connectアカウント削除
    -- ====================================================================================================

    WITH deleted AS (
        DELETE FROM public.stripe_connect_accounts
        WHERE user_id = test_user_id
        RETURNING user_id
    )
    SELECT COUNT(*) INTO deleted_stripe_accounts FROM deleted;

    RAISE NOTICE '削除されたStripe Connectアカウント数: %', deleted_stripe_accounts;

    -- ====================================================================================================
    -- 6. テストユーザー削除（オプション）
    -- ====================================================================================================
    -- テストユーザー自体を削除する場合は、以下のコメントアウトを外してください
    /*
    DELETE FROM public.users WHERE id = test_user_id;
    RAISE NOTICE 'テストユーザーを削除しました: %', test_user_id;
    */

    -- ====================================================================================================
    -- 完了メッセージ
    -- ====================================================================================================

    RAISE NOTICE '====================================================================================================';
    RAISE NOTICE 'テストデータクリーンアップが完了しました！';
    RAISE NOTICE '====================================================================================================';
    RAISE NOTICE '削除サマリー:';
    RAISE NOTICE '  清算データ: % 件', deleted_settlements;
    RAISE NOTICE '  決済データ: % 件', deleted_payments;
    RAISE NOTICE '  参加者データ: % 件', deleted_attendances;
    RAISE NOTICE '  イベントデータ: % 件', deleted_events;
    RAISE NOTICE '  Stripe Connectアカウント: % 件', deleted_stripe_accounts;
    RAISE NOTICE '====================================================================================================';
    RAISE NOTICE 'クリーンアップが完了しました！';
    RAISE NOTICE '====================================================================================================';

EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'エラーが発生しました: %', SQLERRM;
        RAISE;
END $$;
