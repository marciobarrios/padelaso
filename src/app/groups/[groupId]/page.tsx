import { GroupSettingsContent } from "./content";

export default async function GroupSettingsPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  return <GroupSettingsContent groupId={groupId} />;
}
