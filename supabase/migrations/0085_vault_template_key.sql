-- Generate must never undo a person's decisions (Ryan, 2026-10-28: a second tap re-made 20 rows he had removed). Each generated
-- row records which template item and subject it stands for, so Generate matches on that, not on the label (which a person may
-- rename), and a row that was removed still counts as "exists": it stays removed, restorable from the Removed section.
alter table public.vault_pointers add column if not exists template_key text;
create index if not exists vault_pointers_template_key on public.vault_pointers (template_key) where template_key is not null;
