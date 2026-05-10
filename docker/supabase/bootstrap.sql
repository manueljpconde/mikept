create schema if not exists auth;

\set pgpass `echo "$POSTGRES_PASSWORD"`

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')::text
$$;

create or replace function auth.email()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.email', true), '')::text
$$;

alter user authenticator with password :'pgpass';
alter user supabase_auth_admin with password :'pgpass';
