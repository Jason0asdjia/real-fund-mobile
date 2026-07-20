-- 基金估值多源支持：QDII 实时估值表 + 预计算估值源表 + RPC。

create table if not exists public.gs_qdii (
  fund_code text primary key,
  gztime text,
  gszzl double precision,
  gzstatus text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_gs_qdii_updated_at on public.gs_qdii(updated_at desc);

create table if not exists public.fund_pingzhongdata (
  fund_code text primary key,
  source text not null check (source in ('fundgz', 'sina_ds2', 'sina_ds3', 'supabase_qdii')),
  source_updated_at timestamptz,
  note text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_fund_pingzhongdata_updated_at on public.fund_pingzhongdata(updated_at desc);

create or replace function public.set_generic_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_gs_qdii_updated_at on public.gs_qdii;
create trigger trg_gs_qdii_updated_at
before update on public.gs_qdii
for each row execute function public.set_generic_updated_at();

drop trigger if exists trg_fund_pingzhongdata_updated_at on public.fund_pingzhongdata;
create trigger trg_fund_pingzhongdata_updated_at
before update on public.fund_pingzhongdata
for each row execute function public.set_generic_updated_at();

alter table public.gs_qdii enable row level security;
alter table public.fund_pingzhongdata enable row level security;

drop policy if exists "gs_qdii_read_public" on public.gs_qdii;
create policy "gs_qdii_read_public"
on public.gs_qdii
for select
using (auth.role() in ('anon', 'authenticated'));

drop policy if exists "fund_pingzhongdata_read_public" on public.fund_pingzhongdata;
create policy "fund_pingzhongdata_read_public"
on public.fund_pingzhongdata
for select
using (auth.role() in ('anon', 'authenticated'));

create or replace function public.get_fund_best_source(p_fund_code text)
returns table(source text)
language sql
stable
as $$
  select fbs.source
  from public.fund_pingzhongdata fbs
  where fbs.fund_code = p_fund_code
  limit 1;
$$;

create or replace function public.get_fund_best_source(p_fund_codes text[])
returns jsonb
language sql
stable
as $$
  select coalesce(
    jsonb_object_agg(fbs.fund_code, fbs.source),
    '{}'::jsonb
  )
  from public.fund_pingzhongdata fbs
  where fbs.fund_code = any(p_fund_codes);
$$;

grant select on public.gs_qdii to anon, authenticated;
grant select on public.fund_pingzhongdata to anon, authenticated;
grant execute on function public.get_fund_best_source(text) to anon, authenticated;
grant execute on function public.get_fund_best_source(text[]) to anon, authenticated;
