import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/server-auth";
import { PageHeader } from "@/components/layout/page-header";
import { Integrations } from "./integrations";

export default async function SettingsPage() {
  const { user } = await getServerAuth();
  if (!user) redirect("/login");
  return (
    <main className="min-h-dvh">
      <PageHeader title="Ajustes" backHref="/" />
      <div className="max-w-lg mx-auto p-4"><Integrations /></div>
    </main>
  );
}
