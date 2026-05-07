-- Street Team ticket system foundation.
-- Run in Supabase SQL Editor before testing tickets.
-- This assumes public.events.id is bigint. If your events.id is uuid, change
-- event_id columns/function args from bigint to uuid before running.

alter table public.events
add column if not exists is_ticketed boolean not null default false;

create table if not exists public.ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id bigint not null references public.events(id) on delete cascade,
  producer_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  price numeric(10, 2) not null default 0,
  quantity_available integer not null default 0,
  quantity_reserved integer not null default 0,
  sale_status text not null default 'on_sale',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ticket_types_price_nonnegative check (price >= 0),
  constraint ticket_types_quantity_nonnegative check (quantity_available >= 0),
  constraint ticket_types_reserved_nonnegative check (quantity_reserved >= 0),
  constraint ticket_types_not_oversold check (quantity_reserved <= quantity_available),
  constraint ticket_types_sale_status_valid check (
    sale_status in ('on_sale', 'paused', 'sold_out')
  )
);

create table if not exists public.ticket_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id bigint not null references public.events(id) on delete cascade,
  ticket_type_id uuid not null references public.ticket_types(id) on delete cascade,
  quantity integer not null default 1,
  status text not null default 'reserved',
  confirmation_code text not null default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10)),
  fan_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ticket_reservations_quantity_positive check (quantity > 0),
  constraint ticket_reservations_status_valid check (
    status in ('reserved', 'pending_payment', 'paid', 'cancelled', 'refunded')
  )
);

create index if not exists ticket_types_event_id_idx
on public.ticket_types(event_id);

create index if not exists ticket_reservations_event_id_idx
on public.ticket_reservations(event_id);

create index if not exists ticket_reservations_user_id_idx
on public.ticket_reservations(user_id);

-- One active reservation per user per ticket type.
create unique index if not exists ticket_reservations_one_active_per_user_ticket
on public.ticket_reservations(user_id, ticket_type_id)
where status in ('reserved', 'pending_payment', 'paid');

-- One active reservation per user per event for the MVP free-ticket flow.
-- If this query returns rows, cancel/refund duplicates before creating the index.
select
  user_id,
  event_id,
  count(*) as active_reservations
from public.ticket_reservations
where status in ('reserved', 'pending_payment', 'paid')
group by user_id, event_id
having count(*) > 1;

create unique index if not exists ticket_reservations_one_active_per_user_event
on public.ticket_reservations(user_id, event_id)
where status in ('reserved', 'pending_payment', 'paid');

alter table public.ticket_types enable row level security;
alter table public.ticket_reservations enable row level security;

drop policy if exists "Anyone can read ticket types" on public.ticket_types;
create policy "Anyone can read ticket types"
on public.ticket_types
for select
to anon, authenticated
using (true);

drop policy if exists "Producers can create ticket types for own events" on public.ticket_types;
create policy "Producers can create ticket types for own events"
on public.ticket_types
for insert
to authenticated
with check (
  auth.uid() = producer_id
  and auth.uid() = created_by
  and exists (
    select 1
    from public.events
    where events.id = ticket_types.event_id
      and events.owner_id = auth.uid()
  )
);

drop policy if exists "Producers can update own ticket types" on public.ticket_types;
create policy "Producers can update own ticket types"
on public.ticket_types
for update
to authenticated
using (auth.uid() = producer_id)
with check (auth.uid() = producer_id);

drop policy if exists "Producers can delete unsold own ticket types" on public.ticket_types;
create policy "Producers can delete unsold own ticket types"
on public.ticket_types
for delete
to authenticated
using (
  auth.uid() = producer_id
  and quantity_reserved = 0
);

drop policy if exists "Fans can read own ticket reservations" on public.ticket_reservations;
create policy "Fans can read own ticket reservations"
on public.ticket_reservations
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Producers can read reservations for own events" on public.ticket_reservations;
create policy "Producers can read reservations for own events"
on public.ticket_reservations
for select
to authenticated
using (
  exists (
    select 1
    from public.events
    where events.id = ticket_reservations.event_id
      and events.owner_id = auth.uid()
  )
);

create or replace function public.reserve_free_ticket(
  p_ticket_type_id uuid,
  p_event_id bigint,
  p_quantity integer default 1
)
returns public.ticket_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.ticket_types%rowtype;
  v_reservation public.ticket_reservations%rowtype;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Log in before reserving tickets.';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 4 then
    raise exception 'You can reserve 1 to 4 tickets at a time.';
  end if;

  select *
  into v_ticket
  from public.ticket_types
  where id = p_ticket_type_id
    and event_id = p_event_id
  for update;

  if not found then
    raise exception 'Ticket type was not found.';
  end if;

  if v_ticket.price > 0 then
    raise exception 'Paid checkout is coming next.';
  end if;

  if v_ticket.sale_status <> 'on_sale' then
    raise exception 'This ticket type is not on sale.';
  end if;

  if v_ticket.quantity_reserved + p_quantity > v_ticket.quantity_available then
    raise exception 'Not enough tickets remain.';
  end if;

  if exists (
    select 1
    from public.ticket_reservations
    where user_id = v_user_id
      and event_id = p_event_id
      and status in ('reserved', 'pending_payment', 'paid')
  ) then
    raise exception 'You already have a reservation for this event.';
  end if;

  update public.ticket_types
  set quantity_reserved = quantity_reserved + p_quantity,
      updated_at = now()
  where id = p_ticket_type_id;

  insert into public.ticket_reservations (
    user_id,
    event_id,
    ticket_type_id,
    quantity,
    status,
    fan_email
  )
  values (
    v_user_id,
    p_event_id,
    p_ticket_type_id,
    p_quantity,
    'reserved',
    auth.jwt() ->> 'email'
  )
  returning * into v_reservation;

  return v_reservation;
end;
$$;

grant execute on function public.reserve_free_ticket(uuid, bigint, integer)
to authenticated;
