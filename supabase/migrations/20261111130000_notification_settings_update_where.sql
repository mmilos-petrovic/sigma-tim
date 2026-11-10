-- set_notification_settings() updated the one row of notification_settings without a WHERE clause. Supabase's API
-- connections load pg-safeupdate, which refuses that ("UPDATE requires a WHERE clause"), so saving the settings failed with a
-- generic error in the app although every database test passed (the test database does not load it).
-- Same function as in 20261111120000_notification_queue.sql, with the WHERE.

create or replace function public.set_notification_settings(
  p_quiet_hours_enabled boolean, p_quiet_start time, p_quiet_end time,
  p_reminder_enabled boolean, p_reminder_minutes integer,
  p_welcome_text text, p_school_contact text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  if p_quiet_hours_enabled is null or p_reminder_enabled is null
     or p_quiet_start is null or p_quiet_end is null or p_reminder_minutes is null then
    raise exception 'all settings are required' using errcode = 'PT400';
  end if;
  if p_quiet_start = p_quiet_end then
    raise exception 'the quiet hours cannot start and end at the same time' using errcode = 'PT400';
  end if;
  if p_reminder_minutes not between 5 and 720 then
    raise exception 'the reminder time must be between 5 and 720 minutes' using errcode = 'PT400';
  end if;
  if char_length(coalesce(p_welcome_text, '')) > 1000 or char_length(coalesce(p_school_contact, '')) > 500 then
    raise exception 'the text is too long' using errcode = 'PT400';
  end if;

  update public.notification_settings
     set quiet_hours_enabled = p_quiet_hours_enabled, quiet_start = p_quiet_start, quiet_end = p_quiet_end,
         reminder_enabled = p_reminder_enabled, reminder_minutes = p_reminder_minutes,
         welcome_text = btrim(coalesce(p_welcome_text, '')), school_contact = btrim(coalesce(p_school_contact, '')),
         updated_at = now()
   where singleton;
end $$;
