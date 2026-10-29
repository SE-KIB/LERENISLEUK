-- Snel zoeken in alle gesprekken (tool archief_zoeken en het zoekveld in ARCHIEF). Idempotent.
create index if not exists ai_messages_fts on public.ai_messages using gin (to_tsvector('dutch', content));
create index if not exists ai_messages_user_idx on public.ai_messages(user_id, created_at desc);
