-- Street Team locked-in MVP cleanup.
-- Run after the existing ticket, admin, checkout, QR, and referral/points SQL files.
-- Keeps schema intact while disabling non-MVP reward/points behavior.

alter table public.reward_redemptions
add column if not exists points_spent integer,
add column if not exists dollar_amount integer,
add column if not exists selected_reward_type text,
add column if not exists tremendous_order_id text,
add column if not exists tremendous_reward_id text,
add column if not exists tremendous_external_id text,
add column if not exists admin_notes text,
add column if not exists error_message text,
add column if not exists sent_at timestamptz,
add column if not exists updated_at timestamptz not null default now();

update public.reward_redemptions
set points_spent = coalesce(points_spent, points_cost),
    selected_reward_type = coalesce(selected_reward_type, reward_type, 'gift_card'),
    reward_type = 'gift_card',
    stripe_enabled = false,
    updated_at = now()
where true;

alter table public.point_transactions
add column if not exists redemption_id text,
add column if not exists share_link_id text;

create unique index if not exists point_transactions_one_account_creation_per_user
on public.point_transactions (user_id)
where source = 'account_creation'
  and points > 0;

create unique index if not exists point_transactions_one_share_reward_per_event
on public.point_transactions (user_id, event_id, transaction_type)
where transaction_type = 'share_reward'
  and points > 0;

create unique index if not exists point_transactions_one_buyer_ticket_reward_per_order
on public.point_transactions(ticket_reservation_id, user_id)
where ticket_reservation_id is not null
  and source = 'own_paid_ticket_purchase'
  and points > 0;

create unique index if not exists point_transactions_one_referrer_ticket_reward_per_order
on public.point_transactions(ticket_reservation_id)
where ticket_reservation_id is not null
  and points = 75
  and source = 'share_ticket_purchase';

create unique index if not exists reward_redemptions_one_pending_per_user_reward
on public.reward_redemptions(user_id, points_spent, dollar_amount, selected_reward_type)
where status = 'pending';

create unique index if not exists reward_redemptions_tremendous_external_id_key
on public.reward_redemptions(tremendous_external_id)
where tremendous_external_id is not null;

create unique index if not exists point_transactions_one_spend_per_redemption
on public.point_transactions(redemption_id)
where redemption_id is not null
  and transaction_type = 'reward_redemption'
  and points < 0;

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
      and source = 'share_ticket_purchase'
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
      share_link_id,
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
      v_share_code,
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

  return v_awarded_count;
end;
$$;

create or replace function public.admin_update_redemption_status(
  p_redemption_id text,
  p_status text,
  p_admin_notes text default null
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

  if p_status not in ('pending', 'approved', 'sent', 'failed', 'canceled', 'manually_sent') then
    raise exception 'Invalid redemption status.';
  end if;

  update public.reward_redemptions
  set status = p_status,
      admin_notes = coalesce(nullif(trim(p_admin_notes), ''), admin_notes),
      sent_at = case when p_status in ('sent', 'manually_sent') then coalesce(sent_at, now()) else sent_at end,
      error_message = case when p_status in ('sent', 'manually_sent') then null else error_message end,
      updated_at = now()
  where id::text = p_redemption_id
  returning * into v_redemption;

  if not found then
    raise exception 'Reward request was not found.';
  end if;

  return v_redemption;
end;
$$;

create or replace function public.reset_mvp_test_data(
  p_admin_email text default 'staticentertainmentsc@gmail.com'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_ids uuid[];
  v_uploaded_files_deleted integer := 0;
  v_reward_redemptions_deleted integer := 0;
  v_points_history_deleted integer := 0;
  v_referrals_deleted integer := 0;
  v_share_links_deleted integer := 0;
  v_check_ins_deleted integer := 0;
  v_reservations_deleted integer := 0;
  v_pending_reservations_deleted integer := 0;
  v_tickets_deleted integer := 0;
  v_stripe_records_deleted integer := 0;
  v_events_deleted integer := 0;
  v_profiles_deleted integer := 0;
  v_admin_status_deleted integer := 0;
  v_roles_deleted integer := 0;
  v_auth_users_deleted integer := 0;
begin
  if not public.is_owner_admin() then
    raise exception 'Not authorized.';
  end if;

  select coalesce(array_agg(id), array[]::uuid[])
  into v_admin_ids
  from auth.users
  where lower(email) = lower(p_admin_email);

  if coalesce(array_length(v_admin_ids, 1), 0) = 0 then
    raise exception 'No admin account found to preserve.';
  end if;

  if to_regclass('storage.objects') is not null then
    delete from storage.objects
    where bucket_id = 'event-fliers';
    get diagnostics v_uploaded_files_deleted = row_count;
  end if;

  if to_regclass('public.reward_redemptions') is not null then
    delete from public.reward_redemptions;
    get diagnostics v_reward_redemptions_deleted = row_count;
  end if;

  if to_regclass('public.point_transactions') is not null then
    select count(*)
    into v_referrals_deleted
    from public.point_transactions
    where source = 'referral_signup'
       or referred_user_id is not null;

    delete from public.point_transactions;
    get diagnostics v_points_history_deleted = row_count;
  end if;

  if to_regclass('public.event_share_actions') is not null then
    delete from public.event_share_actions;
    get diagnostics v_share_links_deleted = row_count;
  end if;

  if to_regclass('public.ticket_reservations') is not null then
    select count(*)
    into v_check_ins_deleted
    from public.ticket_reservations
    where checked_in is true
       or checked_in_at is not null
       or checked_in_by is not null;

    select count(*)
    into v_pending_reservations_deleted
    from public.ticket_reservations
    where status = 'pending_payment';

    delete from public.ticket_reservations;
    get diagnostics v_reservations_deleted = row_count;
  end if;

  if to_regclass('public.ticket_types') is not null then
    delete from public.ticket_types;
    get diagnostics v_tickets_deleted = row_count;
  end if;

  if to_regclass('public.stripe_webhook_events') is not null then
    delete from public.stripe_webhook_events;
    get diagnostics v_stripe_records_deleted = row_count;
  end if;

  if to_regclass('public.events') is not null then
    delete from public.events;
    get diagnostics v_events_deleted = row_count;
  end if;

  update public.admin_user_status
  set deactivated_by = null
  where deactivated_by is not null
    and deactivated_by <> all(v_admin_ids);

  delete from public.fan_profiles where id <> all(v_admin_ids);
  get diagnostics v_profiles_deleted = row_count;

  delete from public.admin_user_status where user_id <> all(v_admin_ids);
  get diagnostics v_admin_status_deleted = row_count;

  delete from public.user_roles where user_id <> all(v_admin_ids);
  get diagnostics v_roles_deleted = row_count;

  delete from auth.users where id <> all(v_admin_ids);
  get diagnostics v_auth_users_deleted = row_count;

  insert into public.user_roles (user_id, role)
  select unnest(v_admin_ids), 'owner'
  on conflict (user_id, role) do nothing;

  insert into public.user_roles (user_id, role)
  select unnest(v_admin_ids), 'admin'
  on conflict (user_id, role) do nothing;

  insert into public.admin_user_status (user_id, is_active)
  select unnest(v_admin_ids), true
  on conflict (user_id) do update
  set is_active = true,
      deactivated_at = null,
      updated_at = now();

  insert into public.fan_profiles (
    id,
    display_name,
    email,
    home_city,
    favorite_event_types,
    marketing_consent
  )
  select
    users.id,
    coalesce(nullif(split_part(users.email, '@', 1), ''), 'Admin'),
    users.email,
    '',
    array[]::text[],
    false
  from auth.users users
  where users.id = any(v_admin_ids)
  on conflict (id) do nothing;

  return jsonb_build_object(
    'admin_accounts_preserved', coalesce(array_length(v_admin_ids, 1), 0),
    'non_admin_users_deleted', v_auth_users_deleted,
    'profiles_deleted', v_profiles_deleted,
    'admin_status_rows_deleted', v_admin_status_deleted,
    'role_rows_deleted', v_roles_deleted,
    'events_deleted', v_events_deleted,
    'tickets_deleted', v_tickets_deleted,
    'reservations_deleted', v_reservations_deleted,
    'pending_reservations_deleted', v_pending_reservations_deleted,
    'stripe_records_deleted', v_stripe_records_deleted,
    'share_links_deleted', v_share_links_deleted,
    'referrals_deleted', v_referrals_deleted,
    'points_history_deleted', v_points_history_deleted,
    'reward_redemptions_deleted', v_reward_redemptions_deleted,
    'check_ins_scans_deleted', v_check_ins_deleted,
    'uploaded_files_deleted', v_uploaded_files_deleted,
    'non_admin_users_remaining', (
      select count(*)
      from auth.users users
      where users.id <> all(v_admin_ids)
    ),
    'events_remaining', (select count(*) from public.events),
    'tickets_remaining', (select count(*) from public.ticket_types),
    'reservations_remaining', (select count(*) from public.ticket_reservations),
    'points_history_remaining', (select count(*) from public.point_transactions),
    'share_links_remaining', (select count(*) from public.event_share_actions),
    'reward_redemptions_remaining', (select count(*) from public.reward_redemptions),
    'stripe_records_remaining', (
      case
        when to_regclass('public.stripe_webhook_events') is null then 0
        else (select count(*) from public.stripe_webhook_events)
      end
    )
  );
end;
$$;

grant execute on function public.award_account_creation_points() to authenticated;
grant execute on function public.award_paid_ticket_points(uuid, text) to service_role;
grant execute on function public.admin_update_redemption_status(text, text, text) to authenticated;
grant execute on function public.reset_mvp_test_data(text) to authenticated;
