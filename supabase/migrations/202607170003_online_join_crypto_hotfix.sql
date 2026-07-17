-- The pgcrypto extension lives in the extensions schema on hosted projects.
-- Keep the SECURITY DEFINER search path restricted while making it resolvable.
alter function public.join_online_world(
  text,text,text,text,text,text,text,text,text,text,text[],text,text,integer
) set search_path = pg_catalog, extensions;
