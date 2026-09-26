import { AdlyShell } from "@/components/adly/AdlyShell";

export default function AdlyWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdlyShell>{children}</AdlyShell>;
}
