-- フィードバックテーブル
-- 機能要望・不具合報告など、返信を前提にしない軽量な投稿を保存する。

create table if not exists public.feedbacks (
  id uuid primary key default gen_random_uuid(),
  category text not null check (
    category in ('feature_request', 'bug_report', 'usability', 'other')
  ),
  message text not null,
  page_context text null,
  name text null,
  email text null,
  fingerprint_hash text not null,
  user_agent text null,
  ip_hash text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_feedbacks_created_at on public.feedbacks(created_at desc);
create index if not exists idx_feedbacks_category_created_at
  on public.feedbacks(category, created_at desc);
create unique index if not exists ux_feedbacks_fingerprint on public.feedbacks(fingerprint_hash);

alter table public.feedbacks enable row level security;

drop policy if exists feedbacks_no_select on public.feedbacks;
create policy feedbacks_no_select on public.feedbacks
  for select
  using (false);

drop policy if exists feedbacks_insert_public on public.feedbacks;
create policy feedbacks_insert_public on public.feedbacks
  for insert
  to anon, authenticated
  with check (true);
