import { H1 } from "@/components/ui";
import { SettingsList } from "@/components/c/SettingsList";
import { INFO_ROWS, SETTING_GROUPS } from "@/lib/settings-links";

export const dynamic = "force-dynamic";

export default function Settings() {
  return (
    <>
      <H1>Settings</H1>
      <SettingsList groups={SETTING_GROUPS} info={INFO_ROWS} />
      <p className="text-xs text-muted mt-5">Contacts, the emergency plan and the other registers are under More, with the rest of the registers.</p>
    </>
  );
}
