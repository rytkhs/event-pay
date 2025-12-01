create table public.line_accounts (
  id uuid not null default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  channel_id text not null,
  line_sub text not null,
  email text,
  display_name text,
  picture_url text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint line_accounts_pkey primary key (id),
  constraint line_accounts_channel_id_line_sub_key unique (channel_id, line_sub)
);

comment on table public.line_accounts is 'Supabaseユーザーに紐付くLINEアカウント情報を格納する';

alter table public.line_accounts enable row level security;

grant all on table public.line_accounts to service_role;

create index line_accounts_auth_user_id_idx on public.line_accounts (auth_user_id);
create index line_accounts_channel_id_line_sub_idx on public.line_accounts (channel_id, line_sub);
