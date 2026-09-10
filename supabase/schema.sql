create extension if not exists pgcrypto;

create type public.room_status as enum ('waiting', 'answering', 'revealing', 'finished');
create type public.round_status as enum ('answering', 'revealing');

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique check (room_code ~ '^[A-Z0-9]{5}$'),
  host_participant_id uuid,
  status public.room_status not null default 'waiting',
  seconds_per_round smallint not null check (seconds_per_round between 5 and 60),
  round_count smallint not null check (round_count between 5 and 20),
  category text not null default 'Todas',
  current_round smallint not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '12 hours'
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  session_id uuid not null,
  nickname text not null check (char_length(nickname) between 1 and 20),
  is_host boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(room_id, session_id)
);
alter table public.rooms add constraint rooms_host_fk foreign key (host_participant_id) references public.participants(id) on delete set null;

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  category text not null,
  difficulty text not null default 'normal',
  active boolean not null default true
);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  question_id uuid not null references public.questions(id),
  round_number smallint not null,
  status public.round_status not null default 'answering',
  started_at timestamptz not null,
  ends_at timestamptz not null,
  revealed_at timestamptz,
  unique(room_id, round_number),
  unique(room_id, question_id)
);

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  round_id uuid not null references public.rounds(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  answer_text text not null check (char_length(answer_text) <= 300),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(round_id, participant_id)
);

create index rooms_code_idx on public.rooms(room_code);
create index participants_room_idx on public.participants(room_id);
create index rounds_room_idx on public.rounds(room_id, round_number);
create index answers_round_idx on public.answers(round_id);

alter table public.rooms enable row level security;
alter table public.participants enable row level security;
alter table public.questions enable row level security;
alter table public.rounds enable row level security;
alter table public.answers enable row level security;

-- The browser only receives the public anon key. These policies allow the public
-- game shell to read a room and subscribe to changes. Writes should go through
-- the server-side game actions/RPCs below, where expiry, host ownership and
-- round timestamps are checked again.
create policy "public can read active rooms" on public.rooms for select using (expires_at > now());
create policy "public can read participants" on public.participants for select using (exists (select 1 from public.rooms r where r.id = room_id and r.expires_at > now()));
create policy "public can read questions" on public.questions for select using (active = true);
create policy "public can read rounds" on public.rounds for select using (exists (select 1 from public.rooms r where r.id = room_id and r.expires_at > now()));
create policy "answers are never broadly readable" on public.answers for select using (exists (select 1 from public.rounds rd join public.rooms r on r.id = rd.room_id where rd.id = round_id and rd.status = 'revealing' and r.expires_at > now()));

-- Anonymous Auth users receive an authenticated JWT. These policies keep the
-- relational model writable without exposing service_role_key in the browser.
create policy "authenticated can create rooms" on public.rooms for insert to authenticated with check (auth.uid() is not null);
create policy "host can update room" on public.rooms for update to authenticated using (exists (select 1 from public.participants p where p.id = host_participant_id and p.session_id = auth.uid())) with check (exists (select 1 from public.participants p where p.id = host_participant_id and p.session_id = auth.uid()));
create policy "session can join room" on public.participants for insert to authenticated with check (session_id = auth.uid());
create policy "session can update itself" on public.participants for update to authenticated using (session_id = auth.uid()) with check (session_id = auth.uid());
create policy "host can create rounds" on public.rounds for insert to authenticated with check (exists (select 1 from public.rooms r join public.participants p on p.id = r.host_participant_id where r.id = room_id and p.session_id = auth.uid()));
create policy "host can update rounds" on public.rounds for update to authenticated using (exists (select 1 from public.rooms r join public.participants p on p.id = r.host_participant_id where r.id = room_id and p.session_id = auth.uid()));
drop policy if exists "answers are never broadly readable" on public.answers;
create policy "players can read own or revealed answers" on public.answers for select to authenticated using (participant_id in (select p.id from public.participants p where p.session_id = auth.uid()) or exists (select 1 from public.rounds rd where rd.id = round_id and rd.status = 'revealing'));
create policy "players can submit own answers" on public.answers for insert to authenticated with check (participant_id in (select p.id from public.participants p where p.session_id = auth.uid()));
create policy "players can edit own answers" on public.answers for update to authenticated using (participant_id in (select p.id from public.participants p where p.session_id = auth.uid())) with check (participant_id in (select p.id from public.participants p where p.session_id = auth.uid()));
create policy "authenticated can add questions" on public.questions for insert to authenticated with check (active = true);

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms') then alter publication supabase_realtime add table public.rooms; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'participants') then alter publication supabase_realtime add table public.participants; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rounds') then alter publication supabase_realtime add table public.rounds; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'answers') then alter publication supabase_realtime add table public.answers; end if;
end $$;

-- Use a scheduled Supabase Edge Function/pg_cron job to keep the database tidy.
-- delete from public.rooms where expires_at < now();
