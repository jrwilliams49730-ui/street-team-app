-- Stripe Checkout support for Street Team paid tickets.
-- Run after ticket_system_supabase.sql.
-- This assumes public.events.id is bigint. If your events.id is uuid, change
-- event_id args/columns from bigint to uuid before running.

alter table public.ticket_reservations
add column if not exists reservation_type text not null default 'free',
add column if not exists stripe_session_id text,
add column if not exists stripe_payment_intent_id text,
add column if not exists amount_total integer,
add column if not exists currency text not null default 'usd',
add column if not exists paid_at timestamptz,
add column if not exists cancelled_at timestamptz;

alter table public.ticket_reservations
drop constraint if exists ticket_reservations_type_valid;

alter table public.ticket_reservations
add constraint ticket_reservations_type_valid check (
  reservation_type in ('free', 'paid')
);

update public.ticket_reservations
set reservation_type = 'free'
where reservation_type is null;

drop index if exists ticket_reservations_one_active_per_user_ticket;
drop index if exists ticket_reservations_one_active_per_user_event;

create unique index if not exists ticket_reservations_one_active_free_per_user_event
on public.ticket_reservations(user_id, event_id)
where reservation_type = 'free'
  and status in ('reserved', 'pending_payment', 'paid');

create unique index if not exists ticket_reservations_stripe_session_id_key
on public.ticket_reservations(stripe_session_id)
where stripe_session_id is not null;

create table if not exists public.stripe_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  first_seen_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);

alter table public.stripe_webhook_events
add column if not exists first_seen_at timestamptz not null default now(),
add column if not exists processed_at timestamptz,
add column if not exists processing_error text;

alter table public.stripe_webhook_events
alter column processed_at drop not null;

create or replace function public.create_paid_ticket_reservation(
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
  v_existing_quantity integer;
begin
  if v_user_id is null then
    raise exception 'Log in before buying tickets.';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 8 then
    raise exception 'You can buy 1 to 8 paid tickets at a time.';
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

  if v_ticket.price <= 0 then
    raise exception 'Use free RSVP for this ticket type.';
  end if;

  if v_ticket.sale_status <> 'on_sale' then
    raise exception 'This ticket type is not on sale.';
  end if;

  if v_ticket.quantity_reserved + p_quantity > v_ticket.quantity_available then
    raise exception 'Not enough tickets remain.';
  end if;

  select coalesce(sum(quantity), 0)
  into v_existing_quantity
  from public.ticket_reservations
  where user_id = v_user_id
    and event_id = p_event_id
    and reservation_type = 'paid'
    and status in ('reserved', 'pending_payment', 'paid');

  if v_existing_quantity + p_quantity > 8 then
    raise exception 'You can hold up to 8 paid tickets for this event.';
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
    reservation_type,
    fan_email
  )
  values (
    v_user_id,
    p_event_id,
    p_ticket_type_id,
    p_quantity,
    'pending_payment',
    'paid',
    auth.jwt() ->> 'email'
  )
  returning * into v_reservation;

  return v_reservation;
end;
$$;

create or replace function public.cancel_pending_ticket_reservation(
  p_reservation_id uuid
)
returns public.ticket_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.ticket_reservations%rowtype;
begin
  select *
  into v_reservation
  from public.ticket_reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'Reservation was not found.';
  end if;

  if v_reservation.status <> 'pending_payment' then
    return v_reservation;
  end if;

  update public.ticket_types
  set quantity_reserved = greatest(quantity_reserved - v_reservation.quantity, 0),
      updated_at = now()
  where id = v_reservation.ticket_type_id;

  update public.ticket_reservations
  set status = 'cancelled',
      cancelled_at = now(),
      updated_at = now()
  where id = p_reservation_id
  returning * into v_reservation;

  return v_reservation;
end;
$$;

create or replace function public.cancel_own_pending_ticket_reservation(
  p_reservation_id uuid
)
returns public.ticket_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.ticket_reservations%rowtype;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Log in before canceling checkout.';
  end if;

  select *
  into v_reservation
  from public.ticket_reservations
  where id = p_reservation_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Reservation was not found.';
  end if;

  if v_reservation.status <> 'pending_payment' then
    return v_reservation;
  end if;

  update public.ticket_types
  set quantity_reserved = greatest(quantity_reserved - v_reservation.quantity, 0),
      updated_at = now()
  where id = v_reservation.ticket_type_id;

  update public.ticket_reservations
  set status = 'cancelled',
      cancelled_at = now(),
      updated_at = now()
  where id = p_reservation_id
  returning * into v_reservation;

  return v_reservation;
end;
$$;

create or replace function public.expire_stale_pending_ticket_reservations(
  p_older_than interval default interval '30 minutes'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.ticket_reservations%rowtype;
  v_expired_count integer := 0;
begin
  for v_reservation in
    select *
    from public.ticket_reservations
    where status = 'pending_payment'
      and reservation_type = 'paid'
      and created_at < now() - p_older_than
    for update skip locked
  loop
    update public.ticket_types
    set quantity_reserved = greatest(quantity_reserved - v_reservation.quantity, 0),
        updated_at = now()
    where id = v_reservation.ticket_type_id;

    update public.ticket_reservations
    set status = 'cancelled',
        cancelled_at = now(),
        updated_at = now()
    where id = v_reservation.id;

    v_expired_count := v_expired_count + 1;
  end loop;

  return v_expired_count;
end;
$$;

create or replace function public.mark_ticket_reservation_paid(
  p_reservation_id uuid,
  p_stripe_session_id text,
  p_payment_intent_id text,
  p_amount_total integer,
  p_currency text
)
returns public.ticket_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.ticket_reservations%rowtype;
begin
  select *
  into v_reservation
  from public.ticket_reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'Reservation was not found.';
  end if;

  if v_reservation.status = 'paid' then
    return v_reservation;
  end if;

  if v_reservation.status <> 'pending_payment' then
    raise exception 'Reservation is not pending payment.';
  end if;

  update public.ticket_reservations
  set status = 'paid',
      stripe_session_id = p_stripe_session_id,
      stripe_payment_intent_id = p_payment_intent_id,
      amount_total = p_amount_total,
      currency = coalesce(p_currency, 'usd'),
      paid_at = now(),
      updated_at = now()
  where id = p_reservation_id
  returning * into v_reservation;

  return v_reservation;
end;
$$;

grant execute on function public.create_paid_ticket_reservation(uuid, bigint, integer)
to authenticated;

grant execute on function public.cancel_pending_ticket_reservation(uuid)
to service_role;

grant execute on function public.cancel_own_pending_ticket_reservation(uuid)
to authenticated;

grant execute on function public.expire_stale_pending_ticket_reservations(interval)
to service_role;

grant execute on function public.mark_ticket_reservation_paid(uuid, text, text, integer, text)
to service_role;
