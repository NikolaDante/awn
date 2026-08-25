-- AWN shared budget responsibilities: owner-administered planning allocations.
-- Responsibility amounts are planning metadata only. They never move money or
-- grant access to either member's private financial rows.

alter table public.shared_monthly_budgets
  add column default_split_mode text not null default 'equal' check (default_split_mode in ('equal', 'custom')),
  add column default_primary_user_id uuid references auth.users(id) on delete set null,
  add column default_primary_percent smallint not null default 50 check (default_primary_percent between 0 and 100);

create table public.shared_budget_member_allocations (
  household_id uuid not null,
  period_key text not null,
  category text not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  amount_minor bigint not null check (amount_minor between 0 and 9007199254740991),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, period_key, category, user_id),
  foreign key (household_id, period_key, category)
    references public.shared_budget_allocations(household_id, period_key, category) on delete cascade
);

alter table public.shared_budget_member_allocations enable row level security;
create policy "Members select shared budget responsibilities"
  on public.shared_budget_member_allocations for select to authenticated
  using (private.awn_is_household_member(household_id));
revoke all on table public.shared_budget_member_allocations from public, anon, authenticated;
grant select on table public.shared_budget_member_allocations to authenticated;

-- Shared plan configuration and the budget structure belong to the Budget Admin
-- (the underlying Household owner). Ownership transfer changes this immediately.
create or replace function public.awn_update_shared_plan_settings(
  p_household_id uuid, p_name text, p_currency text, p_budget_start_day smallint
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_name text := btrim(coalesce(p_name, ''));
begin
  if v_user_id is null then raise exception using errcode='P0001',message='authentication_required'; end if;
  if not private.awn_is_household_owner(p_household_id,v_user_id) then raise exception using errcode='42501',message='household_owner_required'; end if;
  if length(v_name) not between 1 and 60 or p_currency not in ('AED','USD','EUR','GBP','SAR','RSD') or p_budget_start_day not between 1 and 28 then
    raise exception using errcode='P0001',message='invalid_shared_plan_settings';
  end if;
  perform private.awn_ensure_shared_plan_settings(p_household_id,v_user_id);
  update public.shared_plan_settings set shared_plan_name=v_name,currency=p_currency,budget_start_day=p_budget_start_day,
    updated_by_user_id=v_user_id,revision=revision+1,updated_at=now() where household_id=p_household_id;
  return true;
end; $$;

drop function if exists public.awn_save_shared_budget(uuid,text,bigint,jsonb);
create function public.awn_save_shared_budget(
  p_household_id uuid, p_period_key text, p_overall_budget_minor bigint, p_allocations jsonb,
  p_default_split_mode text, p_default_primary_user_id uuid, p_default_primary_percent smallint
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid:=auth.uid(); v_item jsonb; v_member jsonb; v_category text; v_amount bigint;
begin
  if v_user_id is null then raise exception using errcode='P0001',message='authentication_required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_household_id::text || p_period_key,0));
  if not private.awn_is_household_owner(p_household_id,v_user_id) then raise exception using errcode='42501',message='household_owner_required'; end if;
  if (select count(*) from public.household_members where household_id=p_household_id)<>2 then raise exception using errcode='P0001',message='shared_budget_two_members_required'; end if;
  if p_period_key !~ '^\d{4}-(0[1-9]|1[0-2])$' or p_overall_budget_minor not between 1 and 9007199254740991
    or jsonb_typeof(p_allocations) is distinct from 'array' or jsonb_array_length(p_allocations)>100
    or p_default_split_mode not in ('equal','custom') or p_default_primary_percent not between 0 and 100
    or p_default_split_mode='custom' and not private.awn_is_household_member(p_household_id,p_default_primary_user_id) then
    raise exception using errcode='P0001',message='invalid_shared_budget';
  end if;
  if exists(select item->>'category' from jsonb_array_elements(p_allocations) item group by lower(btrim(item->>'category'))
    having nullif(btrim(item->>'category'),'') is null or count(*)>1) then raise exception using errcode='P0001',message='invalid_shared_budget'; end if;

  for v_item in select value from jsonb_array_elements(p_allocations) loop
    v_category:=btrim(v_item->>'category');
    if length(v_category)>60 or jsonb_typeof(v_item->'amount') is distinct from 'number'
      or (v_item->>'amount')::numeric<=0 or trunc((v_item->>'amount')::numeric)<>(v_item->>'amount')::numeric
      or (v_item->>'amount')::numeric>9007199254740991 or jsonb_typeof(v_item->'members') is distinct from 'array'
      or jsonb_array_length(v_item->'members')<>2 then raise exception using errcode='P0001',message='invalid_shared_budget'; end if;
    v_amount:=(v_item->>'amount')::bigint;
    if (select count(distinct member->>'userId') from jsonb_array_elements(v_item->'members') member)<>2
      or (select count(*) from jsonb_array_elements(v_item->'members') member join public.household_members membership
          on membership.household_id=p_household_id and membership.user_id=(member->>'userId')::uuid)<>2
      or exists(select 1 from jsonb_array_elements(v_item->'members') member where jsonb_typeof(member->'amount') is distinct from 'number'
          or (member->>'amount')::numeric<0 or trunc((member->>'amount')::numeric)<>(member->>'amount')::numeric)
      or (select sum((member->>'amount')::bigint) from jsonb_array_elements(v_item->'members') member)<>v_amount then
      raise exception using errcode='P0001',message='invalid_shared_budget_split';
    end if;
  end loop;

  perform private.awn_ensure_shared_plan_settings(p_household_id,v_user_id);
  insert into public.shared_monthly_budgets(household_id,period_key,overall_budget_minor,updated_by_user_id,default_split_mode,default_primary_user_id,default_primary_percent)
  values(p_household_id,p_period_key,p_overall_budget_minor,v_user_id,p_default_split_mode,
    case when p_default_split_mode='custom' then p_default_primary_user_id else null end,
    case when p_default_split_mode='equal' then 50 else p_default_primary_percent end)
  on conflict(household_id,period_key) do update set overall_budget_minor=excluded.overall_budget_minor,
    updated_by_user_id=excluded.updated_by_user_id,default_split_mode=excluded.default_split_mode,
    default_primary_user_id=excluded.default_primary_user_id,default_primary_percent=excluded.default_primary_percent,updated_at=now();
  delete from public.shared_budget_allocations where household_id=p_household_id and period_key=p_period_key;
  for v_item in select value from jsonb_array_elements(p_allocations) loop
    v_category:=btrim(v_item->>'category'); v_amount:=(v_item->>'amount')::bigint;
    insert into public.shared_budget_allocations(household_id,period_key,category,amount_minor,updated_by_user_id)
      values(p_household_id,p_period_key,v_category,v_amount,v_user_id);
    for v_member in select value from jsonb_array_elements(v_item->'members') loop
      insert into public.shared_budget_member_allocations(household_id,period_key,category,user_id,amount_minor)
      values(p_household_id,p_period_key,v_category,(v_member->>'userId')::uuid,(v_member->>'amount')::bigint);
    end loop;
  end loop;
  update public.shared_plan_settings set updated_by_user_id=v_user_id,revision=revision+1,updated_at=now() where household_id=p_household_id;
  return true;
end; $$;

create or replace function public.awn_get_shared_budget_responsibilities(p_household_id uuid,p_period_key text)
returns table(
  period_key text,overall_budget_minor bigint,total_spent_minor bigint,category text,allocated_minor bigint,spent_minor bigint,
  member_user_id uuid,member_name text,member_role text,member_allocated_minor bigint,member_spent_minor bigint,
  default_split_mode text,default_primary_user_id uuid,default_primary_percent smallint,responsibility_ready boolean,
  current_user_id uuid,updated_by_name text,updated_at timestamptz
) language plpgsql security definer set search_path='' as $$
declare v_user_id uuid:=auth.uid();
begin
  if v_user_id is null or not private.awn_is_household_member(p_household_id,v_user_id) then raise exception using errcode='42501',message='household_access_denied'; end if;
  return query
  with members as (
    select membership.user_id,membership.role from public.household_members membership where membership.household_id=p_household_id
  ), categories as (
    select allocation.category from public.shared_budget_allocations allocation where allocation.household_id=p_household_id and allocation.period_key=p_period_key
    union select contribution.category from public.shared_budget_contributions contribution where contribution.household_id=p_household_id and contribution.period_key=p_period_key
  ), totals as (
    select coalesce(sum(contribution.amount_minor),0)::bigint spent from public.shared_budget_contributions contribution where contribution.household_id=p_household_id and contribution.period_key=p_period_key
  )
  select p_period_key,budget.overall_budget_minor,totals.spent,categories.category,coalesce(allocation.amount_minor,0)::bigint,
    coalesce((select sum(contribution.amount_minor) from public.shared_budget_contributions contribution where contribution.household_id=p_household_id and contribution.period_key=p_period_key and contribution.category=categories.category),0)::bigint,
    members.user_id,private.awn_display_name(members.user_id),members.role,coalesce(responsibility.amount_minor,0)::bigint,
    coalesce((select sum(contribution.amount_minor) from public.shared_budget_contributions contribution where contribution.household_id=p_household_id and contribution.period_key=p_period_key and contribution.category=categories.category and contribution.contributed_by_user_id=members.user_id),0)::bigint,
    coalesce(budget.default_split_mode,'equal'),budget.default_primary_user_id,coalesce(budget.default_primary_percent,50)::smallint,
    case when categories.category is null then true else (select count(*)=2 and coalesce(sum(r.amount_minor),0)=coalesce(allocation.amount_minor,0) from public.shared_budget_member_allocations r join public.household_members current_member on current_member.household_id=r.household_id and current_member.user_id=r.user_id where r.household_id=p_household_id and r.period_key=p_period_key and r.category=categories.category) end,
    v_user_id,private.awn_display_name(budget.updated_by_user_id),budget.updated_at
  from totals left join public.shared_monthly_budgets budget on budget.household_id=p_household_id and budget.period_key=p_period_key
  left join categories on true left join public.shared_budget_allocations allocation on allocation.household_id=p_household_id and allocation.period_key=p_period_key and allocation.category=categories.category
  cross join members left join public.shared_budget_member_allocations responsibility on responsibility.household_id=p_household_id and responsibility.period_key=p_period_key and responsibility.category=categories.category and responsibility.user_id=members.user_id
  order by categories.category,members.role desc,members.user_id;
end; $$;

alter function public.awn_update_shared_plan_settings(uuid,text,text,smallint) owner to postgres;
alter function public.awn_save_shared_budget(uuid,text,bigint,jsonb,text,uuid,smallint) owner to postgres;
alter function public.awn_get_shared_budget_responsibilities(uuid,text) owner to postgres;
revoke all on function public.awn_save_shared_budget(uuid,text,bigint,jsonb,text,uuid,smallint) from public,anon,authenticated;
revoke all on function public.awn_get_shared_budget_responsibilities(uuid,text) from public,anon,authenticated;
grant execute on function public.awn_save_shared_budget(uuid,text,bigint,jsonb,text,uuid,smallint) to authenticated;
grant execute on function public.awn_get_shared_budget_responsibilities(uuid,text) to authenticated;
