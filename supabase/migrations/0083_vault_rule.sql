-- D17, the 1Password rule (Ryan, 2026-10-28): "I don't want 1Password info going stale." Whenever the system sees something NEW or
-- CHANGED whose full record lives in a vault (a number, a card, a policy, a serial, a title), one task is made to update the vault.
-- It is a database rule, not app code, so it fires from every path: the app, Ask, the Mac mini agents, email and receipt detection.
-- One task per thing and change (merge_key vault:<kind>:<ref>:<version>): the same change never makes a second task, a new
-- insurance period always makes one, and a task a person dismissed is not recreated.
-- Documents and numbers go to 1Password; logins go to Apple Passwords (the 2026-10-18 decision). The registry of what is covered
-- is claude/stewardos-vault-rule-2026-10-28.md; a new register with changing info is added there and here (docs/BUILD-CONVENTIONS.md).

create or replace function public.vault_followup(p_kind text, p_ref text, p_version text, p_title text, p_summary text, p_person uuid default null, p_days int default 7)
returns void language plpgsql security definer set search_path = '' as $$
declare
  mk text := left('vault:' || p_kind || ':' || p_ref || ':' || p_version, 200);
  who uuid;
begin
  if exists (select 1 from public.tasks where merge_key = mk) then return; end if;
  if p_person is not null and exists (select 1 from public.profiles where id = p_person and role <> 'child') then
    insert into public.tasks (person, audience, fyi, kind, title, summary, origin_kind, origin_ref, merge_key, due_at, tier)
    values (p_person, 'one', array(select id from public.profiles where id <> p_person and role <> 'child'), 'do', left(p_title, 160), left(p_summary, 600), 'vault', mk, mk, now() + make_interval(days => p_days), 1);
  else
    who := coalesce(auth.uid(), (select head_id from public.household limit 1), (select id from public.profiles where role = 'owner' order by created_at limit 1));
    if who is null then return; end if;
    insert into public.tasks (person, audience, fyi, kind, title, summary, origin_kind, origin_ref, merge_key, due_at, tier)
    values (who, 'both', '{}', 'do', left(p_title, 160), left(p_summary, 600), 'vault', mk, mk, now() + make_interval(days => p_days), 1);
  end if;
end $$;
revoke all on function public.vault_followup(text, text, text, text, text, uuid, int) from public, anon, authenticated;

-- Devices: serial or IMEI, receipt, warranty or plan paperwork; the login is in Apple Passwords.
create or replace function public.vault_rule_devices() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.vault_followup('device', new.id::text, 'new', 'Update 1Password: ' || new.name,
      'New device. Put the full serial or IMEI and the receipt' || case when new.warranty_end is not null or new.plan_name is not null then ', and the warranty or plan document,' else '' end || ' in 1Password (Devices). Its login goes in Apple Passwords. Then put the item name in the device''s serial pointer here; the dashboard keeps only the last four.', new.person);
  elsif (old.serial_last4, old.warranty_end, old.plan_name, old.plan_end, old.login_pointer) is distinct from (new.serial_last4, new.warranty_end, new.plan_name, new.plan_end, new.login_pointer) then
    perform public.vault_followup('device', new.id::text, left(md5(concat_ws('|', new.serial_last4, new.warranty_end, new.plan_name, new.plan_end, new.login_pointer)), 10), 'Update 1Password: ' || new.name,
      new.name || ' changed (serial, warranty, plan or login). Update the full serial, the receipt and the warranty or plan document in 1Password (Devices); a changed login goes in Apple Passwords.', new.person);
  end if;
  return new;
end $$;
revoke all on function public.vault_rule_devices() from public, anon, authenticated;
drop trigger if exists vault_rule on public.devices;
create trigger vault_rule after insert or update on public.devices for each row execute function public.vault_rule_devices();

-- Vehicles: title, registration card, insurance card and policy, VIN, loan. details holds the dates and names.
create or replace function public.vault_rule_vehicles() returns trigger language plpgsql security definer set search_path = '' as $$
declare k text; what text; v text;
begin
  if tg_op = 'INSERT' then
    perform public.vault_followup('vehicle', new.id::text, 'new', 'Update 1Password: ' || new.name,
      'New vehicle. Put the title, registration, insurance card and VIN in 1Password (Vehicles), and the loan account if it is financed. Then put the item names in the vehicle''s pointers here.', new.driver);
  else
    foreach k in array array['regExpiry', 'insuranceRenewal', 'insurer', 'lienholder'] loop
      v := nullif(new.details ->> k, '');
      if v is not null and v is distinct from (old.details ->> k) then
        what := case k when 'regExpiry' then 'Registration now expires ' || v || '. Put the new registration card in 1Password (Vehicles) and update its expiry date there.'
                       when 'insuranceRenewal' then 'Insurance now renews ' || v || '. Replace the insurance card and policy in 1Password (Vehicles) with the new ones and update the expiry date.'
                       when 'insurer' then 'The insurer is now ' || v || '. Replace the insurance card and policy in 1Password (Vehicles).'
                       else 'The lender is now ' || v || '. Put the loan agreement and account in 1Password (Vehicles).' end;
        perform public.vault_followup('vehicle-' || k, new.id::text, left(md5(v), 10), 'Update 1Password: ' || new.name || case k when 'regExpiry' then ' registration' when 'lienholder' then ' loan' else ' insurance' end, what, new.driver);
      end if;
    end loop;
  end if;
  return new;
end $$;
revoke all on function public.vault_rule_vehicles() from public, anon, authenticated;
drop trigger if exists vault_rule on public.vehicles;
create trigger vault_rule after insert or update on public.vehicles for each row execute function public.vault_rule_vehicles();

-- Accounts (bank, card, loan): the full number and the statement login.
create or replace function public.vault_rule_accounts() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.retired_at is not null then return new; end if;
  if tg_op = 'INSERT' then
    perform public.vault_followup('account', new.id::text, 'new', 'Update 1Password: ' || new.institution || ' ' || new.kind || coalesce(' ending ' || new.last4, ''),
      'New account. Put the full account number in 1Password (Money) and the online login in Apple Passwords, then put the item name in the account''s vault item here. The dashboard keeps only the last four.');
  elsif (old.last4, old.institution) is distinct from (new.last4, new.institution) then
    perform public.vault_followup('account', new.id::text, left(md5(concat_ws('|', new.last4, new.institution)), 10), 'Update 1Password: ' || new.institution || ' ' || new.kind || coalesce(' ending ' || new.last4, ''),
      'This account''s number or institution changed. Update the full number in 1Password (Money).');
  end if;
  return new;
end $$;
revoke all on function public.vault_rule_accounts() from public, anon, authenticated;
drop trigger if exists vault_rule on public.accounts;
create trigger vault_rule after insert or update on public.accounts for each row execute function public.vault_rule_accounts();

-- Cards: a new card, or one retired or replaced.
create or replace function public.vault_rule_cards() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.vault_followup('card', new.id::text, 'new', 'Update 1Password: card ending ' || new.last4 || coalesce(' (' || new.label || ')', ''),
      'New card. Put the full number, expiry and security details in 1Password (Money). The dashboard keeps only the last four.');
  elsif (old.retired_at is null and new.retired_at is not null) or (old.replaced_by is null and new.replaced_by is not null) then
    perform public.vault_followup('card', new.id::text, 'retired', 'Update 1Password: card ending ' || new.last4 || ' replaced',
      'This card was retired or replaced. Mark the old card retired in 1Password (Money) and make sure the new one is there.');
  end if;
  return new;
end $$;
revoke all on function public.vault_rule_cards() from public, anon, authenticated;
drop trigger if exists vault_rule on public.payment_cards;
create trigger vault_rule after insert or update on public.payment_cards for each row execute function public.vault_rule_cards();

-- Warranties and protection plans: the plan or policy number and the claim contact.
create or replace function public.vault_rule_warranties() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.vault_followup('warranty', new.id::text, 'new', 'Update 1Password: ' || new.item || ' warranty',
      'New warranty or plan. Put the plan or policy number and the claim contact in 1Password (Other, or the group it belongs to), with the proof of purchase.');
  elsif old.end_date is distinct from new.end_date then
    perform public.vault_followup('warranty', new.id::text, coalesce(new.end_date::text, 'none'), 'Update 1Password: ' || new.item || ' warranty',
      'The end date changed to ' || coalesce(new.end_date::text, 'none') || '. Update the plan or policy paperwork in 1Password.');
  end if;
  return new;
end $$;
revoke all on function public.vault_rule_warranties() from public, anon, authenticated;
drop trigger if exists vault_rule on public.warranties;
create trigger vault_rule after insert or update on public.warranties for each row execute function public.vault_rule_warranties();

-- Things with a serial (the household inventory).
create or replace function public.vault_rule_items() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.deleted_at is not null or new.serial_last4 is null then return new; end if;
  if tg_op = 'INSERT' or old.serial_last4 is distinct from new.serial_last4 then
    perform public.vault_followup('item', new.id::text, left(md5(new.serial_last4), 10), 'Update 1Password: ' || new.name,
      new.name || ' has a serial number. Put the full serial and the receipt in 1Password (Devices or Other) and put the item name in its serial pointer here.');
  end if;
  return new;
end $$;
revoke all on function public.vault_rule_items() from public, anon, authenticated;
drop trigger if exists vault_rule on public.items;
create trigger vault_rule after insert or update on public.items for each row execute function public.vault_rule_items();

-- Medications: the prescription number and the pharmacy account (Health).
create or replace function public.vault_rule_medications() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.vault_followup('medication', new.id::text, 'new', 'Update 1Password: ' || new.name || ' prescription',
      'New medication. Put the prescription number and the pharmacy account in 1Password (Health), then put the item name in the prescription pointer here.', new.person);
  elsif (old.doctor, old.pharmacy, old.strength) is distinct from (new.doctor, new.pharmacy, new.strength) then
    perform public.vault_followup('medication', new.id::text, left(md5(concat_ws('|', new.doctor, new.pharmacy, new.strength)), 10), 'Update 1Password: ' || new.name || ' prescription',
      'The prescriber, pharmacy or strength changed. Update the prescription number and pharmacy account in 1Password (Health).', new.person);
  end if;
  return new;
end $$;
revoke all on function public.vault_rule_medications() from public, anon, authenticated;
drop trigger if exists vault_rule on public.medications;
create trigger vault_rule after insert or update on public.medications for each row execute function public.vault_rule_medications();

-- A new person: the identity checklist (Settings › 1Password makes the items, never twice).
create or replace function public.vault_rule_children() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.vault_followup('person', new.id::text, 'new', 'Update 1Password: set up ' || new.display_name,
    'New child. Run the 1Password checklist (Settings › 1Password) for ' || new.display_name || ': passport, Social Security card and birth certificate go in the shared vault.');
  return new;
end $$;
revoke all on function public.vault_rule_children() from public, anon, authenticated;
drop trigger if exists vault_rule on public.children;
create trigger vault_rule after insert on public.children for each row execute function public.vault_rule_children();

create or replace function public.vault_rule_profiles() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'child' then return new; end if;
  perform public.vault_followup('person', new.id::text, 'new', 'Update 1Password: set up ' || coalesce(new.display_name, 'new adult'),
    'New adult. Run the 1Password checklist (Settings › 1Password) for ' || coalesce(new.display_name, 'them') || ': passport, license, Social Security card and birth certificate go in their private vault.', new.id);
  return new;
end $$;
revoke all on function public.vault_rule_profiles() from public, anon, authenticated;
drop trigger if exists vault_rule on public.profiles;
create trigger vault_rule after insert on public.profiles for each row execute function public.vault_rule_profiles();

-- Insurance seen in the money: a first charge from an insurer, or a premium that moved, in the last 45 days (a new policy period).
-- Receipts and statements reach this through transactions, so one rule covers both. Older rows loaded in bulk never fire it.
create or replace function public.vault_rule_insurance() returns trigger language plpgsql security definer set search_path = '' as $$
declare prev numeric; why text;
begin
  if new.category is distinct from 'insurance' or new.date < current_date - 45 or new.merchant is null then return new; end if;
  select abs(t.amount) into prev from public.transactions t where t.merchant = new.merchant and t.category = 'insurance' and t.id <> new.id and t.date < new.date order by t.date desc limit 1;
  if prev is null then why := 'A first charge from ' || new.merchant || ' showed up.';
  elsif abs(abs(new.amount) - prev) > 0.02 * prev then why := 'The premium from ' || new.merchant || ' changed (a new policy period?).';
  else return new; end if;
  perform public.vault_followup('insurance', lower(regexp_replace(new.merchant, '[^a-zA-Z0-9]+', '-', 'g')), to_char(new.date, 'YYYY-MM'), 'Update 1Password: ' || new.merchant || ' insurance',
    why || ' Put the current policy, declarations page and ID cards in 1Password, and the new renewal date on the vehicle or home it covers.');
  return new;
end $$;
revoke all on function public.vault_rule_insurance() from public, anon, authenticated;
drop trigger if exists vault_rule on public.transactions;
create trigger vault_rule after insert on public.transactions for each row execute function public.vault_rule_insurance();
