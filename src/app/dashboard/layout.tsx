import { PoliticianShell } from "@/components/dashboard/PoliticianShell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PoliticianShell>{children}</PoliticianShell>;
}
