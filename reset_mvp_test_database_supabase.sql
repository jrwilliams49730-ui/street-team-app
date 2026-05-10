-- Locked MVP test database reset.
-- Run manually in the Supabase SQL Editor when you are ready to clear test data.
-- Preserves the configured owner/admin auth account and admin roles.

do $$
declare
  v_admin_email text := 'staticentertainmentsc@gmail.com';
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
  select coalesce(array_agg(id), array[]::uuid[])
  into v_admin_ids
  from auth.users
  where lower(email) = lower(v_admin_email);

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

  raise notice 'Admin reset complete. non_admin_users_deleted=%, profiles_deleted=%, events_deleted=%, tickets_deleted=%, reservations_deleted=%, pending_reservations_deleted=%, share_links_deleted=%, referrals_deleted=%, points_history_deleted=%, reward_redemptions_deleted=%, check_ins_scans_deleted=%, stripe_records_deleted=%, uploaded_files_deleted=%',
    v_auth_users_deleted,
    v_profiles_deleted,
    v_events_deleted,
    v_tickets_deleted,
    v_reservations_deleted,
    v_pending_reservations_deleted,
    v_share_links_deleted,
    v_referrals_deleted,
    v_points_history_deleted,
    v_reward_redemptions_deleted,
    v_check_ins_deleted,
    v_stripe_records_deleted,
    v_uploaded_files_deleted;
end $$;

select
  (select count(*) from auth.users) as auth_users_remaining,
  (select count(*) from auth.users users
   where not exists (
     select 1
     from public.user_roles roles
     where roles.user_id = users.id
       and roles.role in ('owner', 'admin')
   )) as non_admin_users_remaining,
  (select count(*) from public.events) as events_remaining,
  (select count(*) from public.ticket_reservations) as tickets_remaining,
  (select count(*) from public.ticket_types) as ticket_types_remaining,
  (select count(*) from public.event_share_actions) as share_actions_remaining,
  (select count(*) from public.point_transactions) as point_transactions_remaining,
  (select count(*) from public.reward_redemptions) as reward_redemptions_remaining,
  (select count(*) from public.stripe_webhook_events) as stripe_webhook_events_remaining,
  (select count(*) from storage.objects where bucket_id = 'event-fliers') as event_flyers_remaining;
