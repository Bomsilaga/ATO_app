-- ATO Tax Triage App — Supabase schema
-- Run this in the Supabase SQL editor (or via `supabase db push`) after
-- creating your project. Auth uses Supabase's built-in auth.users table.

create table if not exists tax_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled filing',
  financial_year text not null,
  occupation text,
  triage_state jsonb not null default '[]'::jsonb,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'guidance_pending', 'ready_for_output', 'complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists tax_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references tax_sessions(id) on delete cascade,
  source text not null check (source in ('text', 'file', 'csv', 'api', 'manual')),
  raw_input text not null,
  extracted jsonb not null default '{}'::jsonb,
  category_code text,
  record_type text check (record_type in ('income', 'expense')),
  status text not null default 'unknown'
    check (status in ('unknown', 'candidate', 'confirmed', 'excluded')),
  evidence_ref text,
  confidence numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists crypto_lots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references tax_sessions(id) on delete cascade,
  asset text not null,
  acquired_date date not null,
  quantity numeric not null,
  cost_base_aud numeric not null,
  remaining_quantity numeric not null,
  source_record_id uuid references tax_records(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists crypto_disposals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references tax_sessions(id) on delete cascade,
  asset text not null,
  disposal_date date not null,
  quantity numeric not null,
  proceeds_aud numeric not null,
  matched_lots jsonb not null default '[]'::jsonb,
  discount_eligible boolean not null default false,
  gain_or_loss_aud numeric not null,
  treatment text not null check (treatment in ('capital', 'income')),
  source_record_id uuid references tax_records(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists guidance_cache (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references tax_sessions(id) on delete cascade,
  category_codes text[] not null,
  financial_year text not null,
  fetched_at timestamptz not null default now(),
  summary text,
  thresholds jsonb not null default '{}'::jsonb,
  rulings_in_force text[] not null default '{}',
  citations jsonb not null default '[]'::jsonb
);

create table if not exists prefill_outputs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references tax_sessions(id) on delete cascade,
  generated_at timestamptz not null default now(),
  labels jsonb not null default '[]'::jsonb,
  plain_english_summary text,
  agent_review_flags text[] not null default '{}',
  disclaimer text,
  tax_estimate jsonb
);

-- Row Level Security: every table scoped to the owning user via session_id.
alter table tax_sessions enable row level security;
alter table tax_records enable row level security;
alter table crypto_lots enable row level security;
alter table crypto_disposals enable row level security;
alter table guidance_cache enable row level security;
alter table prefill_outputs enable row level security;

create policy "own sessions" on tax_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own records" on tax_records
  for all using (
    session_id in (select id from tax_sessions where user_id = auth.uid())
  ) with check (
    session_id in (select id from tax_sessions where user_id = auth.uid())
  );

create policy "own crypto lots" on crypto_lots
  for all using (
    session_id in (select id from tax_sessions where user_id = auth.uid())
  ) with check (
    session_id in (select id from tax_sessions where user_id = auth.uid())
  );

create policy "own crypto disposals" on crypto_disposals
  for all using (
    session_id in (select id from tax_sessions where user_id = auth.uid())
  ) with check (
    session_id in (select id from tax_sessions where user_id = auth.uid())
  );

create policy "own guidance cache" on guidance_cache
  for all using (
    session_id in (select id from tax_sessions where user_id = auth.uid())
  ) with check (
    session_id in (select id from tax_sessions where user_id = auth.uid())
  );

create policy "own prefill outputs" on prefill_outputs
  for all using (
    session_id in (select id from tax_sessions where user_id = auth.uid())
  ) with check (
    session_id in (select id from tax_sessions where user_id = auth.uid())
  );
