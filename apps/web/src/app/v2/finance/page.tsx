import { ModuleBrief } from "@/components/ModuleBrief";

export default function FinancePage() {
  return (
    <ModuleBrief
      eyebrow="Finance"
      title="Manual financial goals"
      state="No institution connections are configured, by design for the first phase."
      action="Start with manual savings goals and duplex fund milestones in Objectives."
      trend="Savings rate and goal progress can be added once there is safe local data."
      items={[
        "HYSA",
        "Brokerage",
        "401(k)",
        "Roth IRA",
        "Duplex fund",
        "Spending",
        "Savings rate",
        "Financial goals",
      ]}
    />
  );
}
