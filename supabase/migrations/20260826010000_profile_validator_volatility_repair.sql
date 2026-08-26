-- Match validator volatility metadata to PostgreSQL's classification of date
-- casts and JSON numeric serialization. Validation behavior is unchanged.

alter function private.awn_jsonb_is_date(jsonb) stable;
alter function private.awn_jsonb_is_timestamp(jsonb) stable;
alter function private.awn_validate_profile_data_v2(jsonb) stable;
alter function private.awn_validate_profile_data(jsonb) stable;
