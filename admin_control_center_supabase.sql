-- Owner/admin control center support.
-- Run after the base app tables exist.

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

insert into public.user_roles (user_id, role)
select id, 'owner'
from auth.users
where lower(email) = 'staticentertainmentsc@gmail.com'
on conflict (user_id, role) do nothing;

insert into public.user_roles (user_id, role)
select id, 'admin'
from auth.users
where lower(email) = 'staticentertainmentsc@gmail.com'
on conflict (user_id, role) do nothing;

create or replace function public.is_owner_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

create or replace function public.get_owner_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner_admin() then
    raise exception 'Not authorized.';
  end if;

  return jsonb_build_object(
    'users', coalesce((
      select jsonb_agg(row_to_json(user_rows))
      from (
        select
          users.id,
          users.email,
          users.created_at,
          profiles.display_name,
          profiles.email as profile_email,
          coalesce(sum(points.points), 0) as points_balance,
          coalesce(
            array_agg(distinct roles.role) filter (where roles.role is not null),
            array[]::text[]
          ) as roles
        from auth.users users
        left join public.fan_profiles profiles on profiles.id = users.id
        left join public.user_roles roles on roles.user_id = users.id
        left join public.point_transactions points on points.user_id = users.id
        group by users.id, users.email, users.created_at, profiles.display_name, profiles.email
        order by users.created_at desc
        limit 200
      ) user_rows
    ), '[]'::jsonb),
    'producers', coalesce((
      select jsonb_agg(row_to_json(producer_rows))
      from (
        select
          users.id,
          users.email,
          users.created_at,
          profiles.display_name,
          count(events.id) as event_count
        from public.user_roles roles
        join auth.users users on users.id = roles.user_id
        left join public.fan_profiles profiles on profiles.id = users.id
        left join public.events events on events.owner_id = users.id
        where roles.role = 'producer'
        group by users.id, users.email, users.created_at, profiles.display_name
        order by users.created_at desc
        limit 200
      ) producer_rows
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(row_to_json(event_rows))
      from (
        select
          events.id,
          events.title,
          events.type,
          events.venue,
          events.city,
          events.event_date,
          events.event_time,
          events.price,
          events.is_ticketed,
          events.owner_id,
          owners.email as owner_email,
          events.created_at
        from public.events
        left join auth.users owners on owners.id = events.owner_id
        order by events.created_at desc
        limit 300
      ) event_rows
    ), '[]'::jsonb),
    'tickets', coalesce((
      select jsonb_agg(row_to_json(ticket_rows))
      from (
        select
          reservations.id,
          reservations.user_id,
          buyers.email as buyer_email,
          reservations.event_id,
          events.title as event_title,
          ticket_types.name as ticket_type,
          reservations.quantity,
          reservations.status,
          reservations.reservation_type,
          reservations.confirmation_code,
          reservations.checked_in,
          reservations.created_at
        from public.ticket_reservations reservations
        left join auth.users buyers on buyers.id = reservations.user_id
        left join public.events on events.id = reservations.event_id
        left join public.ticket_types on ticket_types.id = reservations.ticket_type_id
        order by reservations.created_at desc
        limit 300
      ) ticket_rows
    ), '[]'::jsonb),
    'redemptions', coalesce((
      select jsonb_agg(row_to_json(redemption_rows))
      from (
        select
          redemptions.*,
          users.email as user_email
        from public.reward_redemptions redemptions
        left join auth.users users on users.id = redemptions.user_id
        order by redemptions.created_at desc
        limit 300
      ) redemption_rows
    ), '[]'::jsonb),
    'points', coalesce((
      select jsonb_agg(row_to_json(point_rows))
      from (
        select
          points.*,
          users.email as user_email
        from public.point_transactions points
        left join auth.users users on users.id = points.user_id
        order by points.created_at desc
        limit 500
      ) point_rows
    ), '[]'::jsonb),
    'suspicious', coalesce((
      select jsonb_agg(row_to_json(suspicious_rows))
      from (
        select
          'high_point_activity' as activity_type,
          users.email,
          points.user_id,
          count(*) as transaction_count,
          sum(points.points) as point_total
        from public.point_transactions points
        left join auth.users users on users.id = points.user_id
        where points.created_at > now() - interval '24 hours'
        group by users.email, points.user_id
        having count(*) >= 5 or abs(sum(points.points)) >= 500
        order by abs(sum(points.points)) desc
        limit 50
      ) suspicious_rows
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_adjust_points(
  p_user_id uuid,
  p_points integer,
  p_reason text
)
returns public.point_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.point_transactions%rowtype;
begin
  if not public.is_owner_admin() then
    raise exception 'Not authorized.';
  end if;

  if p_user_id is null then
    raise exception 'Choose a user.';
  end if;

  if p_points is null or p_points = 0 then
    raise exception 'Enter a non-zero points amount.';
  end if;

  if nullif(trim(p_reason), '') is null then
    raise exception 'Enter a reason for this adjustment.';
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
    p_user_id,
    p_points,
    case when p_points > 0 then 'earned' else 'redeemed' end,
    'admin_adjustment',
    'admin_adjustment',
    trim(p_reason),
    jsonb_build_object('reason', trim(p_reason), 'adminUserId', auth.uid())
  )
  returning * into v_transaction;

  return v_transaction;
end;
$$;

drop function if exists public.admin_update_redemption_status(uuid, text);

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

  if p_status not in ('pending', 'approved', 'fulfilled', 'rejected', 'failed') then
    raise exception 'Invalid redemption status.';
  end if;

  update public.reward_redemptions
  set status = p_status
  where id::text = p_redemption_id
  returning * into v_redemption;

  if not found then
    raise exception 'Reward request was not found.';
  end if;

  return v_redemption;
end;
$$;

grant execute on function public.is_owner_admin() to authenticated;
grant execute on function public.get_owner_dashboard() to authenticated;
grant execute on function public.admin_adjust_points(uuid, integer, text) to authenticated;
grant execute on function public.admin_update_redemption_status(text, text) to authenticated;
