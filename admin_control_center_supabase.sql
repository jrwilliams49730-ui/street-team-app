-- Owner/admin control center support.
-- Run after the base app tables exist.

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table if not exists public.admin_user_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references auth.users(id),
  note text,
  updated_at timestamptz not null default now()
);

alter table public.events
add column if not exists status text not null default 'active',
add column if not exists cancelled_at timestamptz,
add column if not exists archived_at timestamptz;

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
          coalesce(status.is_active, true) as is_active,
          status.deactivated_at,
          status.note as status_note,
          coalesce(
            array_agg(distinct roles.role) filter (where roles.role is not null),
            array[]::text[]
          ) as roles
        from auth.users users
        left join public.fan_profiles profiles on profiles.id = users.id
        left join public.user_roles roles on roles.user_id = users.id
        left join public.point_transactions points on points.user_id = users.id
        left join public.admin_user_status status on status.user_id = users.id
        group by
          users.id,
          users.email,
          users.created_at,
          profiles.display_name,
          profiles.email,
          status.is_active,
          status.deactivated_at,
          status.note
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
          events.status,
          events.cancelled_at,
          events.archived_at,
          events.owner_id,
          owners.email as owner_email,
          coalesce(count(reservations.id), 0) as ticket_count,
          events.created_at
        from public.events
        left join auth.users owners on owners.id = events.owner_id
        left join public.ticket_reservations reservations on reservations.event_id = events.id
        group by events.id, owners.email
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
          reservations.amount_total,
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
    ), '[]'::jsonb),
    'totals', jsonb_build_object(
      'ticket_sales_cents', coalesce((
        select sum(amount_total)
        from public.ticket_reservations
        where reservation_type = 'paid'
          and status = 'paid'
      ), 0),
      'pending_redemptions', coalesce((
        select count(*)
        from public.reward_redemptions
        where status = 'pending'
      ), 0)
    )
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

create or replace function public.admin_set_user_role(
  p_user_id uuid,
  p_role text,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner_admin() then
    raise exception 'Not authorized.';
  end if;

  if p_user_id is null then
    raise exception 'Choose a user.';
  end if;

  if p_role not in ('fan', 'producer', 'admin') then
    raise exception 'Invalid role.';
  end if;

  if p_user_id = auth.uid() and p_role = 'admin' and not p_enabled then
    raise exception 'You cannot remove your own admin access.';
  end if;

  if p_enabled then
    insert into public.user_roles (user_id, role)
    values (p_user_id, p_role)
    on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles
    where user_id = p_user_id
      and role = p_role;
  end if;
end;
$$;

create or replace function public.admin_set_user_active(
  p_user_id uuid,
  p_is_active boolean,
  p_note text default null
)
returns public.admin_user_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.admin_user_status%rowtype;
begin
  if not public.is_owner_admin() then
    raise exception 'Not authorized.';
  end if;

  if p_user_id is null then
    raise exception 'Choose a user.';
  end if;

  if p_user_id = auth.uid() and not p_is_active then
    raise exception 'You cannot deactivate your own admin account.';
  end if;

  if exists (
    select 1
    from public.user_roles
    where user_id = p_user_id
      and role in ('owner', 'admin')
  ) and not p_is_active then
    raise exception 'Admin and owner accounts cannot be deactivated here.';
  end if;

  insert into public.admin_user_status (
    user_id,
    is_active,
    deactivated_at,
    deactivated_by,
    note,
    updated_at
  )
  values (
    p_user_id,
    p_is_active,
    case when p_is_active then null else now() end,
    case when p_is_active then null else auth.uid() end,
    nullif(trim(coalesce(p_note, '')), ''),
    now()
  )
  on conflict (user_id) do update
  set is_active = excluded.is_active,
      deactivated_at = excluded.deactivated_at,
      deactivated_by = excluded.deactivated_by,
      note = excluded.note,
      updated_at = now()
  returning * into v_status;

  return v_status;
end;
$$;

create or replace function public.admin_update_event_status(
  p_event_id bigint,
  p_status text
)
returns public.events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
begin
  if not public.is_owner_admin() then
    raise exception 'Not authorized.';
  end if;

  if p_status not in ('active', 'cancelled', 'archived') then
    raise exception 'Invalid event status.';
  end if;

  update public.events
  set status = p_status,
      cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end,
      archived_at = case when p_status = 'archived' then now() else archived_at end
  where id = p_event_id
  returning * into v_event;

  if not found then
    raise exception 'Event was not found.';
  end if;

  return v_event;
end;
$$;

create or replace function public.admin_delete_event_if_safe(
  p_event_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner_admin() then
    raise exception 'Not authorized.';
  end if;

  if exists (
    select 1
    from public.ticket_reservations
    where event_id = p_event_id
  ) then
    raise exception 'Event has ticket history. Archive or cancel it instead.';
  end if;

  delete from public.events
  where id = p_event_id;

  if not found then
    raise exception 'Event was not found.';
  end if;

  return true;
end;
$$;

grant execute on function public.is_owner_admin() to authenticated;
grant execute on function public.get_owner_dashboard() to authenticated;
grant execute on function public.admin_adjust_points(uuid, integer, text) to authenticated;
grant execute on function public.admin_update_redemption_status(text, text) to authenticated;
grant execute on function public.admin_set_user_role(uuid, text, boolean) to authenticated;
grant execute on function public.admin_set_user_active(uuid, boolean, text) to authenticated;
grant execute on function public.admin_update_event_status(bigint, text) to authenticated;
grant execute on function public.admin_delete_event_if_safe(bigint) to authenticated;
