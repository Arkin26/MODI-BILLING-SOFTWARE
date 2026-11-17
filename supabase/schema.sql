-- MODI ELECTRICALS — Auth + party / invoice / ledger (Postgres / Supabase)
-- Applied on project modi-electricals. Re-run safely with IF NOT EXISTS / DROP POLICY IF EXISTS.

create extension if not exists "pgcrypto";

-- Profiles linked to Supabase Auth (passwords live only in auth.users)
create table if not exists public.app_users (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  name text not null,
  email text not null,
  role text not null check (role in ('admin', 'user')),
  created_at timestamptz not null default now(),
  constraint app_users_username_key unique (username),
  constraint app_users_email_key unique (email),
  constraint app_users_username_format check (username ~ '^[A-Za-z0-9._-]{3,32}$')
);

create index if not exists app_users_role_idx on public.app_users (role);

create table if not exists public.parties (
  id text primary key,
  name text not null,
  address text,
  gstin text,
  phone text,
  credit_limit numeric(14, 2) not null default 50000,
  -- Base64 data URL or storage path for party photo
  photo text,
  assigned_to uuid references public.app_users (id) on delete set null,
  created_at date not null default (current_date)
);

-- Existing DBs: add photo column if missing
alter table public.parties add column if not exists photo text;

create table if not exists public.invoices (
  id text primary key,
  party_id text not null references public.parties (id) on delete cascade,
  bill_no text,
  invoice_date date not null,
  due_date date not null,
  amount numeric(14, 2) not null check (amount >= 0),
  status text not null default 'open'
    check (status in ('open', 'paid', 'in_progress')),
  pdf_name text,
  notes text,
  line_items jsonb not null default '[]'::jsonb,
  created_at date not null default (current_date),
  updated_at timestamptz not null default now()
);

create table if not exists public.ledger_entries (
  id text primary key,
  party_id text not null references public.parties (id) on delete cascade,
  entry_date date not null,
  entry_type text not null check (entry_type in ('opening', 'sale', 'receipt', 'journal')),
  voucher_no text,
  particular text not null,
  debit numeric(14, 2) not null default 0,
  credit numeric(14, 2) not null default 0,
  invoice_id text references public.invoices (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists invoices_party_id_idx on public.invoices (party_id);
create index if not exists invoices_due_date_idx on public.invoices (due_date);
create index if not exists ledger_party_id_idx on public.ledger_entries (party_id);
create index if not exists ledger_entry_date_idx on public.ledger_entries (entry_date);

create or replace function public.set_updated_at()
returns trigger language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
before update on public.invoices
for each row execute function public.set_updated_at();

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.app_users where id = auth.uid();
$$;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_users
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.current_app_role() from public;
revoke all on function public.current_app_role() from anon;
revoke all on function public.is_app_admin() from public;
revoke all on function public.is_app_admin() from anon;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_app_admin() to authenticated;

alter table public.app_users enable row level security;
alter table public.parties enable row level security;
alter table public.invoices enable row level security;
alter table public.ledger_entries enable row level security;

drop policy if exists "app_users_all" on public.app_users;
drop policy if exists "parties_all" on public.parties;
drop policy if exists "invoices_all" on public.invoices;
drop policy if exists "ledger_all" on public.ledger_entries;

drop policy if exists "app_users_select" on public.app_users;
create policy "app_users_select" on public.app_users
  for select to authenticated
  using (id = auth.uid() or public.is_app_admin());

drop policy if exists "app_users_update_self" on public.app_users;
create policy "app_users_update_self" on public.app_users
  for update to authenticated
  using (id = auth.uid() or public.is_app_admin())
  with check (id = auth.uid() or public.is_app_admin());

drop policy if exists "parties_select" on public.parties;
create policy "parties_select" on public.parties
  for select to authenticated
  using (public.is_app_admin() or assigned_to = auth.uid());

drop policy if exists "parties_write_admin" on public.parties;
create policy "parties_write_admin" on public.parties
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists "invoices_select" on public.invoices;
create policy "invoices_select" on public.invoices
  for select to authenticated
  using (
    public.is_app_admin()
    or exists (
      select 1 from public.parties p
      where p.id = party_id and p.assigned_to = auth.uid()
    )
  );

drop policy if exists "invoices_write" on public.invoices;
create policy "invoices_write" on public.invoices
  for all to authenticated
  using (
    public.is_app_admin()
    or exists (
      select 1 from public.parties p
      where p.id = party_id and p.assigned_to = auth.uid()
    )
  )
  with check (
    public.is_app_admin()
    or exists (
      select 1 from public.parties p
      where p.id = party_id and p.assigned_to = auth.uid()
    )
  );

drop policy if exists "ledger_select" on public.ledger_entries;
create policy "ledger_select" on public.ledger_entries
  for select to authenticated
  using (
    public.is_app_admin()
    or exists (
      select 1 from public.parties p
      where p.id = party_id and p.assigned_to = auth.uid()
    )
  );

drop policy if exists "ledger_write" on public.ledger_entries;
create policy "ledger_write" on public.ledger_entries
  for all to authenticated
  using (
    public.is_app_admin()
    or exists (
      select 1 from public.parties p
      where p.id = party_id and p.assigned_to = auth.uid()
    )
  )
  with check (
    public.is_app_admin()
    or exists (
      select 1 from public.parties p
      where p.id = party_id and p.assigned_to = auth.uid()
    )
  );

-- Bootstrap first admin (AnmolModi) is created via Auth + app_users, not open signup.
-- Additional users/admins: Dashboard → User access (Edge Function create-app-user).

do $$
begin
  alter publication supabase_realtime add table public.parties;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.invoices;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.ledger_entries;
exception when others then null;
end $$;
