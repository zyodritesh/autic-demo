create extension if not exists pgcrypto;

create type public.user_role as enum ('parent','child','therapist','teacher','school_admin','platform_admin');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  role public.user_role not null default 'parent',
  created_at timestamptz not null default now()
);

create table if not exists public.children (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles(id) on delete cascade,
  full_name text not null,
  date_of_birth date,
  grade text,
  school_name text,
  interests text,
  sensory_profile text,
  created_at timestamptz not null default now()
);

create table if not exists public.mood_entries (
  id uuid primary key default gen_random_uuid(),
  child_id uuid references public.children(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  emotion text not null check (emotion in ('Happy','Calm','Okay','Worried','Sad','Angry','Overwhelmed','Tired')),
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  child_id uuid references public.children(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.observations (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  observation_type text not null default 'teacher',
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  body text not null,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.children enable row level security;
alter table public.mood_entries enable row level security;
alter table public.appointments enable row level security;
alter table public.observations enable row level security;
alter table public.resources enable row level security;

create policy "profiles own row" on public.profiles for select to authenticated using (id = auth.uid());
create policy "parents manage children" on public.children for all to authenticated using (parent_id = auth.uid()) with check (parent_id = auth.uid());
create policy "parents read child moods" on public.mood_entries for select to authenticated using (exists(select 1 from public.children c where c.id=child_id and c.parent_id=auth.uid()));
create policy "parents create child moods" on public.mood_entries for insert to authenticated with check (created_by=auth.uid() and exists(select 1 from public.children c where c.id=child_id and c.parent_id=auth.uid()));
create policy "parents manage appointments" on public.appointments for all to authenticated using (created_by=auth.uid()) with check (created_by=auth.uid());
create policy "parents read observations" on public.observations for select to authenticated using (exists(select 1 from public.children c where c.id=child_id and c.parent_id=auth.uid()));
create policy "published resources readable" on public.resources for select to authenticated using (is_published = true);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,full_name,phone,role)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name','AUTIC User'),new.phone,'parent');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

insert into public.resources(title,category,body,is_published) values
('Understanding Autism','Understanding Autism','A plain-language introduction to autism and neurodiversity.',true),
('Sensory Support at School','School Support','Practical ideas for creating calmer school environments.',true),
('Using Visual Schedules','Daily Tips','How visual schedules can support predictable transitions.',true)
on conflict do nothing;
