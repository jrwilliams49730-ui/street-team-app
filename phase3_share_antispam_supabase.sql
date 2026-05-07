-- Phase 3 anti-spam share protections for Street Team.
-- Run this in the Supabase SQL Editor after confirming/removing duplicate rows.
-- It prevents repeat share point rewards while still allowing normal link sharing.

-- Optional duplicate audit before adding unique indexes.
select
  user_id,
  event_id,
  transaction_type,
  count(*) as duplicate_count
from public.point_transactions
where transaction_type = 'share_reward'
  and points > 0
group by user_id, event_id, transaction_type
having count(*) > 1;

select
  fan_user_id,
  event_id,
  action,
  count(*) as duplicate_count
from public.event_share_actions
where action = 'share'
  and points_awarded > 0
  and fan_user_id is not null
group by fan_user_id, event_id, action
having count(*) > 1;

-- One positive share reward transaction per user per event.
create unique index if not exists point_transactions_one_share_reward_per_event
on public.point_transactions (user_id, event_id, transaction_type)
where transaction_type = 'share_reward'
  and points > 0;

-- One rewarded share action per user per event.
create unique index if not exists event_share_actions_one_rewarded_share_per_event
on public.event_share_actions (fan_user_id, event_id, action)
where action = 'share'
  and points_awarded > 0
  and fan_user_id is not null;
