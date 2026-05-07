-- Basic producer ticket check-in support.
-- Run after ticket_system_supabase.sql and stripe_ticket_checkout_supabase.sql.

alter table public.ticket_reservations
add column if not exists checked_in boolean not null default false,
add column if not exists checked_in_at timestamptz,
add column if not exists checked_in_by uuid references auth.users(id);

create index if not exists ticket_reservations_event_checkin_idx
on public.ticket_reservations(event_id, checked_in);

create or replace function public.check_in_ticket_reservation(
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
    raise exception 'Log in as a producer before checking in tickets.';
  end if;

  select *
  into v_reservation
  from public.ticket_reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'Reservation was not found.';
  end if;

  if not exists (
    select 1
    from public.events
    where events.id = v_reservation.event_id
      and events.owner_id = v_user_id
  ) then
    raise exception 'Only the event producer can check in this ticket.';
  end if;

  if v_reservation.checked_in then
    return v_reservation;
  end if;

  if v_reservation.reservation_type = 'paid'
    and v_reservation.status <> 'paid'
  then
    raise exception 'Paid tickets must be paid before check-in.';
  end if;

  if coalesce(v_reservation.reservation_type, 'free') <> 'paid'
    and v_reservation.status <> 'reserved'
  then
    raise exception 'Only active free RSVPs can be checked in.';
  end if;

  if v_reservation.status in ('pending_payment', 'cancelled', 'refunded') then
    raise exception 'This ticket cannot be checked in.';
  end if;

  update public.ticket_reservations
  set checked_in = true,
      checked_in_at = now(),
      checked_in_by = v_user_id,
      updated_at = now()
  where id = p_reservation_id
  returning * into v_reservation;

  return v_reservation;
end;
$$;

grant execute on function public.check_in_ticket_reservation(uuid)
to authenticated;

drop policy if exists "Producers can read attendee fan profiles" on public.fan_profiles;
create policy "Producers can read attendee fan profiles"
on public.fan_profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.ticket_reservations
    join public.events on events.id = ticket_reservations.event_id
    where ticket_reservations.user_id = fan_profiles.id
      and events.owner_id = auth.uid()
  )
);
