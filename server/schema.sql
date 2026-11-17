-- MODI ELECTRICALS — local Postgres on the office server PC
-- Data is stored on this machine's disk. Run once against database modi_electricals.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Sync revision for live clients (monotonic)
CREATE TABLE IF NOT EXISTS public.sync_meta (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  revision bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.sync_meta (id, revision)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

-- Local staff accounts (no cloud auth)
CREATE TABLE IF NOT EXISTS public.app_users (
  id text PRIMARY KEY,
  username text NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'user')),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_users_username_key UNIQUE (username),
  CONSTRAINT app_users_username_format CHECK (username ~ '^[A-Za-z0-9._-]{3,32}$')
);

CREATE INDEX IF NOT EXISTS app_users_role_idx ON public.app_users (role);

CREATE TABLE IF NOT EXISTS public.auth_sessions (
  token text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public.app_users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON public.auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx ON public.auth_sessions (expires_at);

CREATE TABLE IF NOT EXISTS public.parties (
  id text PRIMARY KEY,
  name text NOT NULL,
  address text,
  gstin text,
  phone text,
  credit_limit numeric(14, 2) NOT NULL DEFAULT 50000,
  photo text,
  -- Local app user id (text)
  assigned_to text,
  created_at date NOT NULL DEFAULT (CURRENT_DATE)
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id text PRIMARY KEY,
  party_id text NOT NULL REFERENCES public.parties (id) ON DELETE CASCADE,
  bill_no text,
  invoice_date date NOT NULL,
  due_date date NOT NULL,
  amount numeric(14, 2) NOT NULL CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN (
      'open',
      'paid',
      'in_progress',
      'pending_approval',
      'awaiting_payment_confirm'
    )),
  pdf_name text,
  notes text,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  submitted_by text,
  collection_assigned_to text,
  created_at date NOT NULL DEFAULT (CURRENT_DATE),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id text PRIMARY KEY,
  party_id text NOT NULL REFERENCES public.parties (id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('opening', 'sale', 'receipt', 'journal')),
  voucher_no text,
  particular text NOT NULL,
  debit numeric(14, 2) NOT NULL DEFAULT 0,
  credit numeric(14, 2) NOT NULL DEFAULT 0,
  invoice_id text REFERENCES public.invoices (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoices_party_id_idx ON public.invoices (party_id);
CREATE INDEX IF NOT EXISTS invoices_due_date_idx ON public.invoices (due_date);

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS submitted_by text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS collection_assigned_to text;

DO $$
BEGIN
  ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
  ALTER TABLE public.invoices
    ADD CONSTRAINT invoices_status_check
    CHECK (status IN (
      'open',
      'paid',
      'in_progress',
      'pending_approval',
      'awaiting_payment_confirm'
    ));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS ledger_party_id_idx ON public.ledger_entries (party_id);
CREATE INDEX IF NOT EXISTS ledger_entry_date_idx ON public.ledger_entries (entry_date);

-- Party photos / PDFs (separate from invoices) — files on disk, metadata here
CREATE TABLE IF NOT EXISTS public.party_files (
  id text PRIMARY KEY,
  party_id text NOT NULL REFERENCES public.parties (id) ON DELETE CASCADE,
  title text NOT NULL,
  original_name text,
  mime_type text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('image', 'pdf', 'other')),
  storage_path text NOT NULL,
  file_date date NOT NULL DEFAULT (CURRENT_DATE),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS party_files_party_id_idx ON public.party_files (party_id);
CREATE INDEX IF NOT EXISTS party_files_file_date_idx ON public.party_files (file_date);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_set_updated_at ON public.invoices;
CREATE TRIGGER invoices_set_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
