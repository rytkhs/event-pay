-- お問い合わせテーブル（MVP）
-- 要件: docs/spec/contact/required.md

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  fingerprint_hash text not null,
  user_agent text null,
  ip_hash text null,
  created_at timestamptz not null default now()
);

-- インデックス
create index if not exists idx_contacts_created_at on public.contacts(created_at desc);
create unique index if not exists ux_contacts_fingerprint on public.contacts(fingerprint_hash);

-- RLS有効化
alter table public.contacts enable row level security;

-- ポリシー: 匿名/公開からの読み取りを禁止（MVPでは管理者UIなし）
create policy contacts_no_select on public.contacts
  for select
  using (false);

-- ポリシー: 匿名/公開からの挿入を許可（お問い合わせフォーム用）
create policy contacts_insert_public on public.contacts
  for insert
  with check (true);
