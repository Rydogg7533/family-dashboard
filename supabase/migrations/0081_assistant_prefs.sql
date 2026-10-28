-- Per-person assistant preferences (D7 assistant app, D14 voice, D15 wake word). On the person, not the
-- household: Ryan and Melissa may use different apps and different names. Wake word is stored now and used
-- when the on-device listener ships; it does nothing yet.
alter table public.profiles add column if not exists assistant_app text;          -- claude | chatgpt | gemini | other | none
alter table public.profiles add column if not exists assistant_url text;          -- prefill URL template for "other": {q} is the question
alter table public.profiles add column if not exists voice_enabled boolean not null default true;
alter table public.profiles add column if not exists voice_name text;             -- OpenAI voice id; null = server default
alter table public.profiles add column if not exists wake_word text;              -- the name this person says to start a voice session
-- A person edits their own assistant preferences. Role and name stay with the head (no policy for those
-- columns is granted here; the trigger below blocks them).
drop policy if exists "person updates own assistant prefs" on public.profiles;
create policy "person updates own assistant prefs" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create or replace function public.profiles_prefs_only() returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role or new.display_name is distinct from old.display_name then
    if not public.is_owner() then raise exception 'only the head changes role or name'; end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_prefs_only on public.profiles;
create trigger profiles_prefs_only before update on public.profiles for each row execute function public.profiles_prefs_only();
