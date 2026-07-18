import { ModuleBrief } from "@/components/ModuleBrief";

export default function CareerPage() {
  return (
    <ModuleBrief
      eyebrow="Career"
      title="Skills matrix"
      state="Career goals are represented in Objectives first, then expanded into a skills matrix."
      action="Capture one current learning focus and attach evidence projects under Objectives."
      trend="Weekly review can later correlate study work with completed milestones."
      items={[
        "Active Directory",
        "Entra ID",
        "Intune",
        "SAP",
        "Imaging",
        "Manufacturing IT",
        "Networking",
        "Automation",
      ]}
    />
  );
}
