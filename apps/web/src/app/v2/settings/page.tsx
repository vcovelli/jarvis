import { ModuleBrief } from "@/components/ModuleBrief";

export default function SettingsPage() {
  return (
    <ModuleBrief
      eyebrow="Settings"
      title="Platform controls"
      state="Theme and account controls currently live in the shell and account page."
      action="Centralize low-data mode, data paths, and module visibility as the platform grows."
      trend="Settings should change behavior globally without adding route-specific toggles."
      items={[
        "Account",
        "Theme",
        "Low-data mode",
        "Module visibility",
        "Homelab docs root",
        "Privacy boundaries",
      ]}
    />
  );
}
