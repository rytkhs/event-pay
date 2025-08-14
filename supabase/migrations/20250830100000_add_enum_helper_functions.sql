-- ====================================================================
-- 20250830100000 add enum helper functions
-- Enum型の整合性チェック用のヘルパー関数を追加
-- ====================================================================

-- +goose Up
-- +goose StatementBegin

-- Enum型の値を取得するヘルパー関数
CREATE OR REPLACE FUNCTION public.get_enum_values(enum_name TEXT)
RETURNS TEXT[]
LANGUAGE sql
STABLE
AS $$
    SELECT array_agg(enumlabel ORDER BY enumlabel)
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public' AND t.typname = enum_name;
$$;

COMMENT ON FUNCTION public.get_enum_values(TEXT) IS 'Enum型の値一覧を取得するヘルパー関数（CI用）';

-- 使用例確認用のヘルパー関数
CREATE OR REPLACE FUNCTION public.list_all_enums()
RETURNS TABLE(
    enum_name TEXT,
    enum_values TEXT[]
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        t.typname AS enum_name,
        array_agg(e.enumlabel ORDER BY e.enumlabel) AS enum_values
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public'
    GROUP BY t.typname
    ORDER BY t.typname;
$$;

COMMENT ON FUNCTION public.list_all_enums() IS '全Enum型とその値を一覧表示（開発用）';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP FUNCTION IF EXISTS public.get_enum_values(TEXT);
DROP FUNCTION IF EXISTS public.list_all_enums();

-- +goose StatementEnd
