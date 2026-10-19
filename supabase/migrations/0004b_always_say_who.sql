-- Slice C follow-up: "Always say who" (design principle, Ryan 2026-10-18). Every item names who asked for it
-- (requested_by) and whom it is for (for_person / asked_for), shown next to its source. Text columns hold the display
-- form ("Melissa asked", "System · from email (Ryan's Gmail)"); the *_id columns link to profiles where one exists.

alter table public.assistant_confirmations
  add column requested_by text not null default 'System',         -- "Melissa asked", "System · from email"
  add column asked_for text,                                      -- "Ryan", "[Child 1]", "Family"
  add column requested_by_id uuid references public.profiles(id),
  add column source_name text default 'Messages';                 -- "Family thread", "Ask", "email (Ryan's Gmail)"

alter table public.messages_threads add column for_person text;   -- "Family" for the group thread, else the member's name
-- messages.action jsonb now carries {requested_by, for_person} alongside kind/label/status.

alter table public.day_blocks      add column requested_by text not null default 'System';
alter table public.calendar_events add column requested_by text not null default 'System', add column requested_by_id uuid references public.profiles(id);
alter table public.locations       add column for_person text;    -- always the owner's own name; stored for the display line

alter table public.checklist_items add column added_by_name text not null default 'System', add column added_by_id uuid references public.profiles(id);

alter table public.cart_items  add column added_by_name text not null default 'System', add column for_person text default 'Family';
alter table public.orders      add column placed_by uuid references public.profiles(id), add column placed_by_name text not null default 'System', add column for_person text default 'Family';
alter table public.shop_cases  add column opened_by uuid references public.profiles(id), add column opened_by_name text not null default 'System', add column for_person text default 'Family';

alter table public.voice_calls add column requested_by_name text not null default 'System'; -- requested_by (uuid) already exists

-- No RLS change: the new columns ride on the existing row policies.
