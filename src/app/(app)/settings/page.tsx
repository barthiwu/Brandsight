import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { SettingsForm } from "./SettingsForm";
import { DeleteAccountForm } from "./DeleteAccountForm";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-(--color-text)">Settings</h1>
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardBody>
          <SettingsForm email={user?.email ?? ""} fullName={profile?.full_name ?? ""} />
        </CardBody>
      </Card>

      <Card className="max-w-lg border-red-200">
        <CardHeader>
          <CardTitle>Delete account</CardTitle>
        </CardHeader>
        <CardBody>
          <DeleteAccountForm />
        </CardBody>
      </Card>
    </div>
  );
}
