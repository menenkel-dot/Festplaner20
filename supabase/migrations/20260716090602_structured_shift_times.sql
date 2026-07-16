alter table public.shifts
  add column start_time time,
  add column end_time time;

with parsed_shift_times as (
  select
    id,
    regexp_match(
      time_label,
      '((?:[01]?[0-9]|2[0-3]):[0-5][0-9])[[:space:]]*(?:-|bis|'
        || U&'\2013'
        || '|'
        || U&'\2014'
        || ')[[:space:]]*((?:[01]?[0-9]|2[0-3]):[0-5][0-9])',
      'i'
    ) as parts
  from public.shifts
)
update public.shifts as shift
set
  start_time = (parsed.parts[1])::time,
  end_time = (parsed.parts[2])::time,
  time_label = to_char((parsed.parts[1])::time, 'HH24:MI')
    || U&' \2013 '
    || to_char((parsed.parts[2])::time, 'HH24:MI')
    || ' Uhr'
from parsed_shift_times as parsed
where shift.id = parsed.id
  and parsed.parts is not null
  and (parsed.parts[1])::time <> (parsed.parts[2])::time;

alter table public.shifts
  add constraint shifts_structured_time_range_check
  check (
    (start_time is null and end_time is null)
    or (
      start_time is not null
      and end_time is not null
      and start_time <> end_time
    )
  );
