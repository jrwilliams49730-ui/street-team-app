-- Locked MVP test database reset.
-- Run manually in the Supabase SQL Editor when you are ready to clear test data.
-- Preserves the configured owner/admin auth account and admin roles.

do $$
declare
  v_admin_email text := 'staticentertainmentsc@gmail.com';
  v_admin_ids uuid[];
begin
  select coalesce(array_agg(id), array[]::uuid[])
  into v_admin_ids
  from auth.users
  where lower(email) = lower(v_admin_email)
     or id in (
       select user_id
       from public.user_roles
       where role in ('owner', 'admin')
     );

  if coalesce(array_length(v_admin_ids, 1), 0) = 0 then
    raise exception 'No admin account found to preserve.';
  end if;

  delete from storage.objects
  where bucket_id = 'event-fliers';

  delete from public.reward_redemptions;
  delete from public.point_transactions;
  delete from public.event_share_actions;
  delete from public.ticket_reservations;
  delete from public.ticket_types;
  delete from public.stripe_webhook_events;
  delete from public.events;
  delete from public.fan_profiles where id <> all(v_admin_ids);
  delete from public.admin_user_status where user_id <> all(v_admin_ids);
  delete from public.user_roles where user_id <> all(v_admin_ids);
  delete from auth.users where id <> all(v_admin_ids);

  insert into public.user_roles (user_id, role)
  select unnest(v_admin_ids), 'owner'
  on conflict (user_id, role) do nothing;

  insert into public.user_roles (user_id, role)
  select unnest(v_admin_ids), 'admin'
  on conflict (user_id, role) do nothing;
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
  (select count(*) from public.event_share_actions) as share_actions_remaining,
  (select count(*) from public.point_transactions) as point_transactions_remaining,
  (select count(*) from public.reward_redemptions) as reward_redemptions_remaining,
  (select count(*) from storage.objects where bucket_id = 'event-fliers') as event_flyers_remaining;
