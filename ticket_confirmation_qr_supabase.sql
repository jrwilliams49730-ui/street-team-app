-- Ticket confirmation code and QR support.
-- Run after ticket_system_supabase.sql and ticket_checkin_supabase.sql.

create or replace function public.generate_ticket_confirmation_code()
returns text
language plpgsql
set search_path = public
as $$
declare
  v_code text;
begin
  loop
    v_code := 'ST-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

    exit when not exists (
      select 1
      from public.ticket_reservations
      where confirmation_code = v_code
    );
  end loop;

  return v_code;
end;
$$;

alter table public.ticket_reservations
add column if not exists confirmation_code text,
add column if not exists checked_in boolean not null default false,
add column if not exists checked_in_at timestamptz,
add column if not exists checked_in_by uuid references auth.users(id);

alter table public.ticket_reservations
alter column confirmation_code set default public.generate_ticket_confirmation_code();

update public.ticket_reservations
set confirmation_code = public.generate_ticket_confirmation_code()
where confirmation_code is null
  or btrim(confirmation_code) = ''
  or confirmation_code !~ '^ST-[A-Z0-9]{6}$';

alter table public.ticket_reservations
alter column confirmation_code set not null;

create unique index if not exists ticket_reservations_confirmation_code_key
on public.ticket_reservations(confirmation_code);
