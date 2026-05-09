-- Stripe promotion-code support for ticket reward redemptions.
-- Run after admin_control_center_supabase.sql and checkout_ticketing_stability_supabase.sql.

alter table public.reward_redemptions
add column if not exists reward_id text,
add column if not exists reward_type text,
add column if not exists coupon_code text,
add column if not exists stripe_coupon_id text,
add column if not exists stripe_promotion_code_id text,
add column if not exists discount_amount_cents integer,
add column if not exists percent_off integer,
add column if not exists eligible_ticket_type text,
add column if not exists stripe_enabled boolean not null default false,
add column if not exists approved_at timestamptz,
add column if not exists denied_at timestamptz,
add column if not exists used_at timestamptz,
add column if not exists used_ticket_reservation_id uuid references public.ticket_reservations(id),
add column if not exists stripe_session_id text;

create unique index if not exists reward_redemptions_stripe_promotion_code_id_key
on public.reward_redemptions(stripe_promotion_code_id)
where stripe_promotion_code_id is not null;

create unique index if not exists reward_redemptions_coupon_code_key
on public.reward_redemptions(upper(coupon_code))
where coupon_code is not null;

create or replace function public.admin_update_redemption_status(
  p_redemption_id text,
  p_status text
)
returns public.reward_redemptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_redemption public.reward_redemptions%rowtype;
begin
  if not public.is_owner_admin() then
    raise exception 'Not authorized.';
  end if;

  if p_status not in ('pending', 'approved', 'denied', 'used', 'fulfilled', 'rejected', 'failed') then
    raise exception 'Invalid redemption status.';
  end if;

  update public.reward_redemptions
  set status = p_status,
      approved_at = case when p_status = 'approved' then coalesce(approved_at, now()) else approved_at end,
      denied_at = case when p_status in ('denied', 'rejected', 'failed') then coalesce(denied_at, now()) else denied_at end,
      used_at = case when p_status in ('used', 'fulfilled') then coalesce(used_at, now()) else used_at end
  where id::text = p_redemption_id
  returning * into v_redemption;

  if not found then
    raise exception 'Reward request was not found.';
  end if;

  return v_redemption;
end;
$$;

create or replace function public.mark_ticket_discount_used(
  p_stripe_promotion_code_id text,
  p_stripe_coupon_id text,
  p_coupon_code text,
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
  if nullif(trim(coalesce(p_stripe_promotion_code_id, '')), '') is null
    and nullif(trim(coalesce(p_stripe_coupon_id, '')), '') is null
    and nullif(trim(coalesce(p_coupon_code, '')), '') is null
  then
    return null;
  end if;

  update public.reward_redemptions
  set status = 'used',
      used_at = coalesce(used_at, now()),
      used_ticket_reservation_id = coalesce(used_ticket_reservation_id, p_reservation_id),
      stripe_session_id = coalesce(stripe_session_id, p_stripe_session_id)
  where status = 'approved'
    and used_at is null
    and (
      (p_stripe_promotion_code_id is not null and stripe_promotion_code_id = p_stripe_promotion_code_id)
      or (p_stripe_coupon_id is not null and stripe_coupon_id = p_stripe_coupon_id)
      or (p_coupon_code is not null and upper(coupon_code) = upper(p_coupon_code))
    )
  returning * into v_redemption;

  if not found then
    select *
    into v_redemption
    from public.reward_redemptions
    where (p_stripe_promotion_code_id is not null and stripe_promotion_code_id = p_stripe_promotion_code_id)
      or (p_stripe_coupon_id is not null and stripe_coupon_id = p_stripe_coupon_id)
      or (p_coupon_code is not null and upper(coupon_code) = upper(p_coupon_code))
    order by created_at desc
    limit 1;
  end if;

  return v_redemption;
end;
$$;

grant execute on function public.admin_update_redemption_status(text, text) to authenticated;
grant execute on function public.mark_ticket_discount_used(text, text, text, uuid, text) to service_role;
