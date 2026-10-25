-- Account linking also has to run when an auth user is updated, not only when it is inserted.
--
-- GoTrue does not always write a user in one go. Creating a user through its admin API inserts the row first and sets
-- the provider and the email confirmation in later updates, and the same may hold for other flows. The insert trigger
-- then sees an unconfirmed, non-Google row and skips it, which would leave an approved person looking like a stranger
-- ("you are not a member yet"). The linking rules are unchanged: only a confirmed Google account claims a profile, and
-- only a profile that has no account yet.

create trigger on_auth_user_updated
  after update of email, email_confirmed_at, raw_app_meta_data on auth.users
  for each row
  when (new.email_confirmed_at is not null and new.raw_app_meta_data ->> 'provider' = 'google')
  execute function private.handle_new_auth_user();

comment on function private.handle_new_auth_user() is
  'Links a confirmed Google account to the pre-approved profile with the same email. Runs on insert and on update of auth.users.';
