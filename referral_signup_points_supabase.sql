-- Referral signup points for Street Team.
-- Finalized points ledger support.
-- Run after the share/points/ticket tables exist.

alter table public.point_transactions
add column if not exists type text,
add column if not exists source text,
add column if not exists description text,
add column if not exists referred_user_id uuid references auth.users(id),
add column if not exists ticket_reservation_id uuid references public.ticket_reservations(id);

alter table public.ticket_reservations
add column if not exists checkout_share_code text;

create unique index if not exists point_transactions_one_account_creation_per_user
on public.point_transactions (user_id)
where source = 'account_creation'
  and points > 0;

create unique index if not exists point_transactions_one_referral_signup_per_user
on public.point_transactions (referred_user_id)
where source = 'referral_signup'
  and referred_user_id is not null
  and points > 0;

create unique index if not exists point_transactions_one_source_per_paid_order
on public.point_transactions (source, ticket_reservation_id, user_id)
where source in (
    'own_paid_ticket_purchase',
    'share_ticket_purchase',
    'referred_user_ticket_purchase'
  )
  and ticket_reservation_id is not null
  and points > 0;

create or replace function public.award_account_creation_points()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_created_at timestamptz;
  v_inserted_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Log in before account points can be awarded.';
  end if;

  select created_at
  into v_created_at
  from auth.users
  where id = v_user_id;

  if v_created_at is null
    or v_created_at < now() - interval '14 days'
  then
    return false;
  end if;

  insert into public.point_transactions (
    user_id,
    points,
    type,
    transaction_type,
    source,
    description,
    metadata
  )
  values (
    v_user_id,
    5,
    'earned',
    'earned',
    'account_creation',
    'Account created',
    jsonb_build_object('userId', v_user_id)
  )
  on conflict do nothing;

  get diagnostics v_inserted_count = row_count;

  return v_inserted_count = 1;
end;
$$;

create or replace function public.award_referral_signup_points(
  p_share_code text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return false;
end;
$$;

create or replace function public.award_paid_ticket_points(
  p_reservation_id uuid,
  p_share_code text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.ticket_reservations%rowtype;
  v_share_code text;
  v_share_referrer_id uuid;
  v_referral_referrer_id uuid;
  v_inserted_count integer := 0;
  v_awarded_count integer := 0;
begin
  select *
  into v_reservation
  from public.ticket_reservations
  where id = p_reservation_id
    and reservation_type = 'paid'
    and status = 'paid'
  for update;

  if not found then
    raise exception 'Paid ticket reservation was not found.';
  end if;

  insert into public.point_transactions (
    user_id,
    points,
    type,
    transaction_type,
    source,
    description,
    event_id,
    reference_id,
    ticket_reservation_id,
    metadata
  )
  values (
    v_reservation.user_id,
    25,
    'earned',
    'earned',
    'own_paid_ticket_purchase',
    'Bought paid ticket',
    v_reservation.event_id,
    v_reservation.id::text,
    v_reservation.id,
    jsonb_build_object(
      'reservationId', v_reservation.id,
      'quantity', v_reservation.quantity,
      'stripeSessionId', v_reservation.stripe_session_id
    )
  )
  on conflict do nothing;

  get diagnostics v_inserted_count = row_count;
  v_awarded_count := v_awarded_count + v_inserted_count;

  v_share_code := coalesce(nullif(trim(p_share_code), ''), v_reservation.checkout_share_code);

  if v_share_code is not null then
    select fan_user_id
    into v_share_referrer_id
    from public.event_share_actions
    where share_code = v_share_code
      and action = 'share'
      and fan_user_id is not null
    order by created_at asc
    limit 1;

    if v_share_referrer_id is not null
      and v_share_referrer_id <> v_reservation.user_id
    then
      insert into public.point_transactions (
        user_id,
        points,
        type,
        transaction_type,
        source,
        description,
        event_id,
        reference_id,
        referred_user_id,
        ticket_reservation_id,
        metadata
      )
      values (
        v_share_referrer_id,
        75,
        'earned',
        'earned',
        'share_ticket_purchase',
        'Ticket bought from your link',
        v_reservation.event_id,
        v_reservation.id::text,
        v_reservation.user_id,
        v_reservation.id,
        jsonb_build_object(
          'reservationId', v_reservation.id,
          'shareCode', v_share_code,
          'buyerUserId', v_reservation.user_id
        )
      )
      on conflict do nothing;

      get diagnostics v_inserted_count = row_count;
      v_awarded_count := v_awarded_count + v_inserted_count;
    end if;
  end if;

  select user_id
  into v_referral_referrer_id
  from public.point_transactions
  where source = 'referral_signup'
    and referred_user_id = v_reservation.user_id
    and points > 0
  order by created_at asc
  limit 1;

  if v_referral_referrer_id is not null
    and v_referral_referrer_id <> v_reservation.user_id
  then
    insert into public.point_transactions (
      user_id,
      points,
      type,
      transaction_type,
      source,
      description,
      event_id,
      reference_id,
      referred_user_id,
      ticket_reservation_id,
      metadata
    )
    values (
      v_referral_referrer_id,
      75,
      'earned',
      'earned',
      'referred_user_ticket_purchase',
      'Referred user bought a ticket',
      v_reservation.event_id,
      v_reservation.id::text,
      v_reservation.user_id,
      v_reservation.id,
      jsonb_build_object(
        'reservationId', v_reservation.id,
        'buyerUserId', v_reservation.user_id
      )
    )
    on conflict do nothing;

    get diagnostics v_inserted_count = row_count;
    v_awarded_count := v_awarded_count + v_inserted_count;
  end if;

  return v_awarded_count;
end;
$$;

grant execute on function public.award_account_creation_points()
to authenticated;

grant execute on function public.award_referral_signup_points(text)
to authenticated;

grant execute on function public.award_paid_ticket_points(uuid, text)
to service_role;
