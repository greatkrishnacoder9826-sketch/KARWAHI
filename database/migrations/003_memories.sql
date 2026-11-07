-- KARWAHE personal memories (run in the Supabase SQL editor after 002).
create table if not exists public.personal_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 500),
  category text not null default 'general'
    check (category in ('general','preference','education','skill','project','goal','date','profile')),
  sensitivity text not null default 'normal' check (sensitivity in ('normal','sensitive')),
  source text not null default 'user' check (source in ('user','chat','seed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_confirmed_at timestamptz
);
create index if not exists idx_memories_user_time on public.personal_memories (user_id, created_at);

alter table public.personal_memories enable row level security;
create policy "own memories" on public.personal_memories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
