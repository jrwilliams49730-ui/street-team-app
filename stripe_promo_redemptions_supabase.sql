-- Deprecated for the locked-in MVP.
-- Ticket discounts, coupon codes, and Stripe promotion-code rewards are disabled.
-- Use mvp_lock_supabase.sql for gift-card-only reward redemptions.

alter table public.reward_redemptions
add column if not exists reward_id text,
add column if not exists reward_type text not null default 'gift_card',
add column if not exists points_spent integer,
add column if not exists dollar_amount integer,
add column if not exists selected_reward_type text,
add column if not exists tremendous_order_id text,
add column if not exists tremendous_reward_id text,
add column if not exists tremendous_external_id text,
add column if not exists stripe_enabled boolean not null default false,
add column if not exists status text not null default 'pending',
add column if not exists admin_notes text,
add column if not exists error_message text,
add column if not exists approved_at timestamptz,
add column if not exists sent_at timestamptz,
add column if not exists updated_at timestamptz not null default now();

update public.reward_redemptions
set reward_type = 'gift_card',
    stripe_enabled = false,
    updated_at = now()
where true;

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
begin
  return null;
end;
$$;

grant execute on function public.mark_ticket_discount_used(text, text, text, uuid, text) to service_role;
