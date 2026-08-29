-- FAB SMS duplicate protection follows live imported transactions. Ordinary edits keep
-- import metadata, while deleting the transaction atomically releases its fingerprint.

create or replace function private.awn_release_orphaned_import_fingerprints()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.financial_import_fingerprints as fingerprint
  where fingerprint.household_id = new.household_id
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(new.profile_data->'transactions', '[]'::jsonb)) as transaction_data
      where transaction_data->>'id' = fingerprint.transaction_id
        and transaction_data->'import'->>'origin' = 'sms'
        and transaction_data->'import'->>'fingerprint' = fingerprint.fingerprint
    );
  return new;
end;
$$;

alter function private.awn_release_orphaned_import_fingerprints() owner to postgres;
revoke all on function private.awn_release_orphaned_import_fingerprints() from public, anon, authenticated;

drop trigger if exists awn_release_orphaned_import_fingerprints on public.financial_profiles;
create trigger awn_release_orphaned_import_fingerprints
after update of profile_data on public.financial_profiles
for each row
execute function private.awn_release_orphaned_import_fingerprints();

-- Release reservations already orphaned before this trigger was installed. A row is
-- retained only when its exact imported transaction still exists in the same profile.
delete from public.financial_import_fingerprints as fingerprint
where not exists (
  select 1
  from public.financial_profiles as profile
  cross join lateral jsonb_array_elements(coalesce(profile.profile_data->'transactions', '[]'::jsonb)) as transaction_data
  where profile.household_id = fingerprint.household_id
    and transaction_data->>'id' = fingerprint.transaction_id
    and transaction_data->'import'->>'origin' = 'sms'
    and transaction_data->'import'->>'fingerprint' = fingerprint.fingerprint
);
