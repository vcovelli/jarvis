import { ModuleBrief } from "@/components/ModuleBrief";

export default function ManufacturingPage() {
  return (
    <ModuleBrief
      eyebrow="Manufacturing"
      title="CNC and robotics workspace"
      state="This module is an information architecture stub until real project data exists."
      action="Track CNC, robotics, and Raspberry Pi work as objectives before adding integrations."
      trend="Project momentum can later be pulled into the unified timeline."
      items={[
        "CNC",
        "Robotics",
        "Raspberry Pi",
        "Machine monitoring",
        "Designs",
        "Parts inventory",
        "Project roadmaps",
        "Safety",
      ]}
    />
  );
}
