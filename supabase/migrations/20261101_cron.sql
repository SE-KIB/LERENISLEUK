-- ECO-klok: de database roept de functie elke 30 seconden aan (timers, ochtendbriefing + pushmelding, caches warm).
-- De cron-sleutel wordt hier willekeurig gemaakt en staat alleen in ai_kv (geen policies: browser kan er niet bij).
-- Idempotent: de sleutel blijft bestaan en cron.schedule met dezelfde naam werkt de taak bij.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

insert into public.ai_kv (key, value)
values ('cron', jsonb_build_object('key', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')))
on conflict (key) do nothing;

select cron.schedule(
  'eco-tick',
  '30 seconds',
  $job$
  select net.http_post(
    url := 'https://wlpfgbrvnzjclnjocewj.supabase.co/functions/v1/smooth-service',
    body := '{"cron":"tick"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', (select value->>'key' from public.ai_kv where key = 'cron')
    ),
    timeout_milliseconds := 60000
  );
  $job$
);
