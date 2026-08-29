-- Audit lanjutan 2026-08-29: fungsi SECURITY DEFINER expire_unpaid_bookings
-- ter-grant EXECUTE ke PUBLIC saat CREATE OR REPLACE (default Postgres), jadi
-- anon/authenticated bisa memicunya via /rest/v1/rpc dan mempercepat pembatalan
-- booking yang lewat tenggat. Hanya pg_cron (postgres) & service_role yang boleh.
revoke execute on function public.expire_unpaid_bookings(interval, interval) from public, anon, authenticated;
grant execute on function public.expire_unpaid_bookings(interval, interval) to service_role;
