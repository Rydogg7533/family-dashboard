-- Mail (stage 1: read-only Inbox + Drafts). The Mac mini copies each connected mailbox's inbox and drafts here
-- (scripts/mail-sync.mjs, Gmail read-only token). The app only reads. Mail that leaves the inbox is marked
-- left_inbox_at, never deleted. Each person sees only their own mail (person = auth.uid()).
create table if not exists public.mail_accounts (
  id uuid primary key default gen_random_uuid(),
  person uuid not null references public.profiles(id),
  address text not null,
  kind text not null default 'gmail' check (kind in ('gmail','icloud')),
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (person, address)
);
create table if not exists public.mail_messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.mail_accounts(id),
  person uuid not null references public.profiles(id),
  ext_id text not null,
  thread_id text,
  folder text not null check (folder in ('inbox','draft')),
  from_name text,
  from_addr text,
  to_addrs jsonb not null default '[]',
  cc_addrs jsonb not null default '[]',
  subject text,
  snippet text,
  body_text text,
  sent_at timestamptz,
  unread boolean not null default false,
  attachments jsonb not null default '[]',
  web_url text,
  synced_at timestamptz not null default now(),
  left_inbox_at timestamptz,
  unique (account_id, folder, ext_id)
);
create index if not exists mail_messages_list_idx on public.mail_messages (person, folder, sent_at desc) where left_inbox_at is null;
alter table public.mail_accounts enable row level security;
alter table public.mail_messages enable row level security;
create policy "own reads mail accounts" on public.mail_accounts for select to authenticated using (is_member() and person = auth.uid());
create policy "own reads mail" on public.mail_messages for select to authenticated using (is_member() and person = auth.uid());
revoke all on public.mail_accounts, public.mail_messages from anon, authenticated;
grant select on public.mail_accounts, public.mail_messages to authenticated;
alter table public.mail_messages add column if not exists rfc_message_id text;  -- the Message-ID header, so a message can be opened in Apple Mail (message://)
