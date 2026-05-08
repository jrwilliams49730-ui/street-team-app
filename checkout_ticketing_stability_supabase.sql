-- Checkout/ticketing stability pass.
-- Run after ticket_system_supabase.sql, stripe_ticket_checkout_supabase.sql,
-- ticket_confirmation_qr_supabase.sql, and referral_signup_points_supabase.sql.

create or replace function public.generate_ticket_check_in_token()
returns text
language plpgsql
set search_path = public
as $$
declare
  v_token text;
begin
  loop
    v_token := 'st_' || md5(random()::text || clock_timestamp()::text || random()::text);

    exit when not exists (
      select 1
      from public.ticket_reservations
      where check_in_token = v_token
    );
  end loop;

  return v_token;
end;
$$;

alter table public.ticket_reservations
add column if not exists check_in_token text,
add column if not exists original_amount_total integer,
add column if not exists discount_amount integer not null default 0,
add column if not exists applied_redemption_id text;

alter table public.ticket_reservations
alter column check_in_token set default public.generate_ticket_check_in_token();

update public.ticket_reservations
set check_in_token = public.generate_ticket_check_in_token()
where check_in_token is null
  or btrim(check_in_token) = '';

alter table public.ticket_reservations
alter column check_in_token set not null;

create unique index if not exists ticket_reservations_check_in_token_key
on public.ticket_reservations(check_in_token);

alter table public.reward_redemptions
add column if not exists used_at timestamptz,
add column if not exists used_ticket_reservation_id uuid references public.ticket_reservations(id),
add column if not exists stripe_session_id text;

-- Repair old duplicate +75 rows for the same paid order before adding the guard.
with ranked_referrer_rewards as (
  select
    id,
    row_number() over (
      partition by ticket_reservation_id
      order by
        case when source = 'share_ticket_purchase' then 0 else 1 end,
        created_at asc
    ) as keep_rank
  from public.point_transactions
  where ticket_reservation_id is not null
    and points = 75
    and source in ('share_ticket_purchase', 'referred_user_ticket_purchase')
)
delete from public.point_transactions transactions
using ranked_referrer_rewards ranked
where transactions.id = ranked.id
  and ranked.keep_rank > 1;

create unique index if not exists point_transactions_one_referrer_ticket_reward_per_order
on public.point_transactions(ticket_reservation_id)
where ticket_reservation_id is not null
  and points = 75
  and source in ('share_ticket_purchase', 'referred_user_ticket_purchase');

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
      check_in_token = coalesce(check_in_token, public.generate_ticket_check_in_token()),
      paid_at = now(),
      updated_at = now()
  where id = p_reservation_id
  returning * into v_reservation;

  return v_reservation;
end;
$$;

create or replace function public.mark_ticket_discount_used(
  p_redemption_id text,
  p_reservation_id uuid,
  p_stripe_session_id text
)
returns public.reward_redemptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_redemption public.reward_redemptions%rowtype;
begin
  if p_redemption_id is null then
    return null;
  end if;

  update public.reward_redemptions
  set status = 'fulfilled',
      used_at = coalesce(used_at, now()),
      used_ticket_reservation_id = coalesce(used_ticket_reservation_id, p_reservation_id),
      stripe_session_id = coalesce(stripe_session_id, p_stripe_session_id)
  where id::text = p_redemption_id
    and used_at is null
    and status = 'approved'
  returning * into v_redemption;

  if not found then
    select *
    into v_redemption
    from public.reward_redemptions
    where id::text = p_redemption_id;
  end if;

  return v_redemption;
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
  v_referrer_id uuid;
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

  if exists (
    select 1
    from public.point_transactions
    where ticket_reservation_id = v_reservation.id
      and points = 75
      and source in ('share_ticket_purchase', 'referred_user_ticket_purchase')
  ) then
    return v_awarded_count;
  end if;

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
  end if;

  select user_id
  into v_referral_referrer_id
  from public.point_transactions
  where source = 'referral_signup'
    and referred_user_id = v_reservation.user_id
    and points > 0
  order by created_at asc
  limit 1;

  v_referrer_id := coalesce(v_share_referrer_id, v_referral_referrer_id);

  if v_referrer_id is not null
    and v_referrer_id <> v_reservation.user_id
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
      v_referrer_id,
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
        'buyerUserId', v_reservation.user_id,
        'referralReferrerId', v_referral_referrer_id
      )
    )
    on conflict do nothing;

    get diagnostics v_inserted_count = row_count;
    v_awarded_count := v_awarded_count + v_inserted_count;
  end if;

  return v_awarded_count;
end;
$$;

grant execute on function public.mark_ticket_discount_used(text, uuid, text)
to service_role;

grant execute on function public.mark_ticket_reservation_paid(uuid, text, text, integer, text)
to service_role;

grant execute on function public.award_paid_ticket_points(uuid, text)
to service_role;
