import { getSetting } from "@/lib/settings";
import SettingsForm, { KillSwitch } from "../_components/SettingsForm";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const s = await getSetting();

  return (
    <>
      <h2>Sending</h2>
      <KillSwitch on={s.killSwitch} />

      <h2>Settings</h2>
      <SettingsForm
        initial={{
          killSwitch: s.killSwitch,
          quietHoursStart: s.quietHoursStart,
          quietHoursEnd: s.quietHoursEnd,
          maxPerContactPerDay: s.maxPerContactPerDay,
          requireConsent: s.requireConsent,
          defaultAutonomy: s.defaultAutonomy,
          reminderTime: s.reminderTime,
          aiDisclosure: s.aiDisclosure,
          disclosureText: s.disclosureText,
        }}
      />
    </>
  );
}
