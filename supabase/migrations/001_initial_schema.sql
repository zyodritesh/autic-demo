create extension if not exists pgcrypto;

create type public.app_role as enum ('parent','child','therapist','teacher','school_admin','platform_admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text unique,
  role public.app_role not null default 'parent',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  status text not null default 'pilot' check (status in ('pilot','active','suspended')),
  created_at timestamptz not null default now()
);

create table public.children (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  date_of_birth date,
  grade text,
  school_id uuid references public.schools(id) on delete set null,
  interests text,
  sensory_profile text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.parent_children (
  parent_id uuid not null references public.profiles(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  relationship text not null default 'parent',
  primary key (parent_id, child_id)
);

create table public.professional_children (
  professional_id uuid not null references public.profiles(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  assignment_type text not null check (assignment_type in ('therapist','teacher')),
  primary key (professional_id, child_id, assignment_type)
);

create table public.mood_entries (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  emotion text not null check (emotion in ('Happy','Calm','Okay','Worried','Sad','Angry','Overwhelmed','Tired')),
  intensity smallint check (intensity between 1 and 10),
  note text not null default '',
  created_at timestamptz not null default now()
);

create table public.calm_sessions (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  activity text not null,
  duration_seconds integer not null check (duration_seconds > 0),
  completed boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  notes text not null default '',
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  created_at timestamptz not null default now()
);

create table public.session_notes (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  therapist_id uuid not null references public.profiles(id) on delete cascade,
  note text not null,
  shared_with_parent boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.classroom_observations (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  observation text not null,
  mood text,
  shared_with_parent boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  summary text not null default '',
  content text not null default '',
  published boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.marketplace_products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  creator_name text not null,
  description text not null default '',
  price_paise integer not null check (price_paise >= 0),
  status text not null default 'review' check (status in ('review','active','rejected')),
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    new.phone,
    coalesce((new.raw_user_meta_data->>'role')::public.app_role,'parent')
  ) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.schools enable row level security;
alter table public.children enable row level security;
alter table public.parent_children enable row level security;
alter table public.professional_children enable row level security;
alter table public.mood_entries enable row level security;
alter table public.calm_sessions enable row level security;
alter table public.appointments enable row level security;
alter table public.session_notes enable row level security;
alter table public.classroom_observations enable row level security;
alter table public.resources enable row level security;
alter table public.notifications enable row level security;
alter table public.marketplace_products enable row level security;
alter table public.audit_logs enable row level security;

create or replace function public.current_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create policy "profile self read" on public.profiles for select using (id = auth.uid() or public.current_role() = 'platform_admin');
create policy "profile self update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "admins manage profiles" on public.profiles for all using (public.current_role() = 'platform_admin') with check (public.current_role() = 'platform_admin');

create policy "schools readable" on public.schools for select using (auth.uid() is not null);
create policy "admins manage schools" on public.schools for all using (public.current_role() in ('school_admin','platform_admin')) with check (public.current_role() in ('school_admin','platform_admin'));

create policy "parents read linked children" on public.children for select using (
  exists(select 1 from public.parent_children pc where pc.child_id=id and pc.parent_id=auth.uid())
  or exists(select 1 from public.professional_children ac where ac.child_id=id and ac.professional_id=auth.uid())
  or public.current_role() in ('school_admin','platform_admin')
);
create policy "admins manage children" on public.children for all using (public.current_role() in ('school_admin','platform_admin')) with check (public.current_role() in ('school_admin','platform_admin'));

create policy "parent links visible" on public.parent_children for select using (parent_id=auth.uid() or public.current_role() in ('school_admin','platform_admin'));
create policy "professional links visible" on public.professional_children for select using (professional_id=auth.uid() or public.current_role() in ('school_admin','platform_admin'));

create policy "moods linked read" on public.mood_entries for select using (
  exists(select 1 from public.parent_children pc where pc.child_id=child_id and pc.parent_id=auth.uid())
  or exists(select 1 from public.professional_children ac where ac.child_id=child_id and ac.professional_id=auth.uid())
  or public.current_role() in ('school_admin','platform_admin')
);
create policy "moods linked insert" on public.mood_entries for insert with check (
  created_by=auth.uid() and (
    exists(select 1 from public.parent_children pc where pc.child_id=child_id and pc.parent_id=auth.uid())
    or exists(select 1 from public.professional_children ac where ac.child_id=child_id and ac.professional_id=auth.uid())
    or public.current_role() in ('school_admin','platform_admin')
  )
);

create policy "appointments linked read" on public.appointments for select using (
  exists(select 1 from public.parent_children pc where pc.child_id=child_id and pc.parent_id=auth.uid())
  or exists(select 1 from public.professional_children ac where ac.child_id=child_id and ac.professional_id=auth.uid())
  or public.current_role() in ('school_admin','platform_admin')
);
create policy "appointments linked write" on public.appointments for all using (created_by=auth.uid() or public.current_role() in ('school_admin','platform_admin')) with check (created_by=auth.uid() or public.current_role() in ('school_admin','platform_admin'));

create policy "resources public read" on public.resources for select using (published=true or public.current_role()='platform_admin');
create policy "admins manage resources" on public.resources for all using (public.current_role()='platform_admin') with check (public.current_role()='platform_admin');

create policy "own notifications" on public.notifications for select using (recipient_id=auth.uid());
create policy "own notifications update" on public.notifications for update using (recipient_id=auth.uid()) with check (recipient_id=auth.uid());

create policy "active products read" on public.marketplace_products for select using (status='active' or public.current_role()='platform_admin');
create policy "admins manage products" on public.marketplace_products for all using (public.current_role()='platform_admin') with check (public.current_role()='platform_admin');

create policy "therapist notes read" on public.session_notes for select using (
  therapist_id=auth.uid()
  or (shared_with_parent and exists(select 1 from public.parent_children pc where pc.child_id=child_id and pc.parent_id=auth.uid()))
  or public.current_role() in ('school_admin','platform_admin')
);
create policy "therapists write notes" on public.session_notes for insert with check (therapist_id=auth.uid() and public.current_role()='therapist');

create policy "observations read" on public.classroom_observations for select using (
  teacher_id=auth.uid()
  or (shared_with_parent and exists(select 1 from public.parent_children pc where pc.child_id=child_id and pc.parent_id=auth.uid()))
  or public.current_role() in ('school_admin','platform_admin')
);
create policy "teachers write observations" on public.classroom_observations for insert with check (teacher_id=auth.uid() and public.current_role()='teacher');

create policy "calm sessions linked" on public.calm_sessions for select using (
  exists(select 1 from public.parent_children pc where pc.child_id=child_id and pc.parent_id=auth.uid())
  or exists(select 1 from public.professional_children ac where ac.child_id=child_id and ac.professional_id=auth.uid())
  or public.current_role() in ('school_admin','platform_admin')
);
create policy "calm sessions create" on public.calm_sessions for insert with check (created_by=auth.uid());

create policy "audit admin only" on public.audit_logs for select using (public.current_role()='platform_admin');
