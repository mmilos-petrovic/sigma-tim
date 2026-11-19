-- Phase 7e: the public pages (the front page and the CV pages) are made when the site is built. When a CV is published,
-- changed or hidden the site has to be built again. Nothing in the app asks for it: every few minutes the database looks at
-- what the public pages would say, and when that differs from what the last accepted rebuild was asked for, it calls the
-- deploy hook of Cloudflare Pages. A change is therefore on the site within about ten minutes, and ten changes in a row
-- cost one build (the free plan of Cloudflare allows 500 builds a month).

-- One row: what the last rebuild request was for, and whether Cloudflare accepted it. Nobody but the job reads it.
create table private.site_rebuild (
  singleton boolean primary key default true check (singleton),
  built_hash text,
  requested_hash text,
  request_id bigint,
  requested_at timestamptz
);
insert into private.site_rebuild (singleton) values (true);

-- Everything the public pages show, as one short text: it changes when a CV becomes public or stops being public, when
-- the teacher's name, subjects, photo, text, experience, education or skills change, or when the teacher is deactivated.
-- A CV that only the members may read is not in it, so editing one does not cause a rebuild.
create function private.public_site_hash() returns text
language sql stable security definer set search_path = '' as $$
  select md5(coalesce(string_agg(private.get_cv(c.slug, true)::text, E'\n' order by c.slug), ''))
    from private.list_cvs(true) c
$$;

revoke all on function private.public_site_hash() from public, anon, authenticated;

-- The address of the deploy hook lives in the Vault (one secret, set once per project by hand, see supabase/README.md);
-- until it exists this does nothing, so a database without it (CI, a new local one) is fine.
create function private.rebuild_site_if_changed() returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_hash text := private.public_site_hash();
  v_state private.site_rebuild;
  v_status integer;
  v_request bigint;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regclass('net.http_request_queue') is null then
    return false;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_url using 'site_deploy_hook_url';
  if coalesce(v_url, '') = '' then
    return false;
  end if;

  select * into v_state from private.site_rebuild where singleton for update;

  -- What came of the last request? Accepted: the site now has what it was asked for. Refused: ask again below.
  -- No answer yet: wait for it, but not for ever (the answers are kept only for a while).
  if v_state.request_id is not null then
    execute 'select status_code from net._http_response where id = $1' into v_status using v_state.request_id;
    if v_status between 200 and 299 then
      v_state.built_hash := v_state.requested_hash;
    elsif v_status is null and v_state.requested_at > now() - interval '15 minutes' then
      return false;
    end if;
    update private.site_rebuild set built_hash = v_state.built_hash, request_id = null where singleton;
  end if;

  if v_hash is not distinct from v_state.built_hash then
    return false;
  end if;
  -- at most one request in ten minutes, however often the pages change
  if v_state.requested_at > now() - interval '10 minutes' then
    return false;
  end if;

  v_request := net.http_post(url := v_url, body := '{}'::jsonb, timeout_milliseconds := 20000);
  update private.site_rebuild set requested_hash = v_hash, request_id = v_request, requested_at = now() where singleton;
  return true;
end $$;

revoke all on function private.rebuild_site_if_changed() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
    create extension if not exists pg_cron;
    perform cron.schedule('rebuild-site', '*/5 * * * *', 'select private.rebuild_site_if_changed()');
  else
    raise notice 'pg_cron or pg_net is not available: the site will not be rebuilt by itself';
  end if;
end $$;
