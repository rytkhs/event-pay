-- =============================================================
-- Migration: user_soft_delete
-- Description: Add logical deletion columns to public.users and
--              update public_profiles view to exclude deleted users
-- =============================================================

set statement_timeout = 0;
set lock_timeout = 0;
set idle_in_transaction_session_timeout = 0;
set client_encoding = 'UTF8';
set standard_conforming_strings = on;
select pg_catalog.set_config('search_path', '', false);
set check_function_bodies = false;
set xmloption = content;
set client_min_messages = warning;
set row_security = off;

-- 1) Add soft-delete columns to public.users
alter table if exists public.users
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz;

-- Optional partial index for deleted users
create index if not exists idx_users_is_deleted on public.users(is_deleted) where is_deleted;

-- 2) Add consistency constraint to prevent is_deleted and deleted_at from being out of sync
alter table public.users
  add constraint users_soft_delete_consistency
  check (is_deleted = (deleted_at is not null));

-- 3) Update public_profiles view to exclude deleted users
create or replace view public.public_profiles as
select id, name, created_at
from public.users
where is_deleted = false;

comment on column public.users.is_deleted is '論理削除フラグ（trueの場合、公開プロフィール等から除外）';
comment on column public.users.deleted_at is '論理削除の実行日時（タイムスタンプ）';
comment on constraint users_soft_delete_consistency on public.users is 'is_deletedとdeleted_atの整合性を保証（is_deleted=true ⇔ deleted_at is not null）';
