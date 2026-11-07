-- KARWAHE relationships (run in the Supabase SQL editor after schema.sql).
create table if not exists public.relationships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  relation text not null default '' check (char_length(relation) <= 120),
  description text not null default '' check (char_length(description) <= 1000),
  my_feelings text not null default '' check (char_length(my_feelings) <= 1000),
  aliases text[] not null default '{}',
  facts jsonb not null default '[]'::jsonb,        -- user-defined details: [{"key":"Birthday","value":"..."}]
  source text not null default 'user' check (source in ('user','seed','chat')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_confirmed_at timestamptz
);
create index if not exists idx_relationships_user on public.relationships (user_id, name);

create table if not exists public.relationship_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  relationship_id uuid not null references public.relationships(id) on delete cascade,
  event_text text not null check (char_length(event_text) between 1 and 500),
  happened_on date,
  created_at timestamptz not null default now()
);
create index if not exists idx_rel_events_rel on public.relationship_events (relationship_id, created_at desc);

alter table public.relationships enable row level security;
alter table public.relationship_events enable row level security;

create policy "own relationships" on public.relationships
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own relationship events" on public.relationship_events
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (
    select 1 from public.relationships r where r.id = relationship_id and r.user_id = auth.uid()));
