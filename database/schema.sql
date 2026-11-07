-- KARWAHE schema, stage 1-3. Run in the Supabase SQL editor.
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null check (char_length(content) <= 8000),
  created_at timestamptz not null default now()
);
create index if not exists idx_messages_conv_time on public.conversation_messages (conversation_id, created_at desc);
create index if not exists idx_conversations_user on public.conversations (user_id, created_at desc);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  auto_save_memories boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Row Level Security: every row is visible/changeable only by its owner.
alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.user_preferences enable row level security;

create policy "own conversations" on public.conversations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own messages" on public.conversation_messages
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (
    select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()));

create policy "own preferences" on public.user_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

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
