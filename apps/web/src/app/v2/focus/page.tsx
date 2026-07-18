import { ModuleBrief } from "@/components/ModuleBrief";

export default function FocusPage() {
  return (
    <ModuleBrief
      eyebrow="Focus"
      title="Discipline support"
      state="Manual commitment tracking is ready to define, with no arbitrary command execution."
      action="Start with a daily commitment, replacement action list, and Pi-hole admin link."
      trend="Consistency history should come from explicit daily logs before any automation."
      items={[
        "Daily commitment",
        "Optional note",
        "Replacement activities",
        "Pi-hole quick link",
        "Allowlisted reversible actions only",
        "No fake blocking automation",
      ]}
    />
  );
}
