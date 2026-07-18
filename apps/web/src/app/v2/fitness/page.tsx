import { ModuleBrief } from "@/components/ModuleBrief";

export default function FitnessPage() {
  return (
    <ModuleBrief
      eyebrow="Fitness"
      title="Simple activity tracking"
      state="Sleep already exists; fitness should stay lightweight and non-medical."
      action="Add gym sessions and basketball as simple logged events before charts or advice."
      trend="Weekly review can later compare sleep, recovery, and completed training sessions."
      items={[
        "Gym sessions",
        "Basketball",
        "Strength progress",
        "Mobility",
        "Meals",
        "Water",
        "Dental habits",
        "Nicotine-reduction goals",
      ]}
    />
  );
}
