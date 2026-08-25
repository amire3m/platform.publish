alter table analytics_snapshots add column if not exists impressions integer;
alter table analytics_snapshots add column if not exists ctr double precision;
alter table analytics_snapshots add column if not exists estimated_revenue numeric;
alter table analytics_snapshots add column if not exists cpm numeric;
create index if not exists analytics_snapshots_dimension_idx on analytics_snapshots(account_id, scope_type, date_utc);
