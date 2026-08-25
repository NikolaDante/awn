-- Repair the case-insensitive duplicate-category guard in the responsibility
-- save RPC. The original EXISTS projection referenced an ungrouped JSON value.
create or replace function public.awn_save_shared_budget(
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
  if exists(
    select 1 from jsonb_array_elements(p_allocations) item
    group by lower(btrim(item->>'category'))
    having nullif(lower(btrim(item->>'category')),'') is null or count(*)>1
  ) then raise exception using errcode='P0001',message='invalid_shared_budget'; end if;

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

alter function public.awn_save_shared_budget(uuid,text,bigint,jsonb,text,uuid,smallint) owner to postgres;
revoke all on function public.awn_save_shared_budget(uuid,text,bigint,jsonb,text,uuid,smallint) from public,anon,authenticated;
grant execute on function public.awn_save_shared_budget(uuid,text,bigint,jsonb,text,uuid,smallint) to authenticated;
