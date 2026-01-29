-- Supabase schema for Swarolipi AI notes
-- You can paste this into the Supabase SQL editor.

create extension if not exists "uuid-ossp";

-- Users table (one row per authenticated Supabase user)
create table if not exists public.users (
  id uuid primary key default uuid_generate_v4(),
  auth_user_id uuid not null unique,
  created_at timestamptz default now()
);

-- Notes table storing all transcribed notes for a user
create table if not exists public.notes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null default '',
  paragraphs jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Keep updated_at fresh on every update
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_updated_at on public.notes;
create trigger trg_set_updated_at
before update on public.notes
for each row
execute procedure public.set_updated_at();

-- Enable Row Level Security
alter table public.users enable row level security;
alter table public.notes enable row level security;

-- Policies: each authenticated user can only access their own data

create policy "Users can manage their own user row"
on public.users
for all
using (auth.uid() = auth_user_id)
with check (auth.uid() = auth_user_id);

create policy "Users can read their notes"
on public.notes
for select
using (
  exists (
    select 1 from public.users u
    where u.id = notes.user_id and u.auth_user_id = auth.uid()
  )
);

create policy "Users can insert their notes"
on public.notes
for insert
with check (
  exists (
    select 1 from public.users u
    where u.id = notes.user_id and u.auth_user_id = auth.uid()
  )
);

create policy "Users can update their notes"
on public.notes
for update
using (
  exists (
    select 1 from public.users u
    where u.id = notes.user_id and u.auth_user_id = auth.uid()
  )
);

create policy "Users can delete their notes"
on public.notes
for delete
using (
  exists (
    select 1 from public.users u
    where u.id = notes.user_id and u.auth_user_id = auth.uid()
  )
);

