-- Add dedicated sync metadata columns for lightweight cloud version checks.

alter table public.user_app_data
  add column if not exists data_version bigint not null default 1,
  add column if not exists content_hash text not null default '',
  add column if not exists device_id text not null default '';

update public.user_app_data
set
  data_version = coalesce(nullif((payload->'sync'->>'dataVersion'), '')::bigint, 1),
  content_hash = coalesce(payload->'sync'->>'contentHash', ''),
  device_id = coalesce(payload->'sync'->>'deviceId', '')
where
  data_version = 1
  or content_hash = ''
  or device_id = '';

create index if not exists idx_user_app_data_user_id_data_version on public.user_app_data(user_id, data_version);
