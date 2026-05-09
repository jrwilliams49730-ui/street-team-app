-- Event geocoding/location fields.
-- Run before using the geocode-address Edge Function from create/edit event.

alter table public.events
add column if not exists venue_name text,
add column if not exists street_address text,
add column if not exists state text,
add column if not exists zip_code text,
add column if not exists latitude double precision,
add column if not exists longitude double precision;

update public.events
set venue_name = coalesce(venue_name, venue)
where venue_name is null
  and venue is not null;
