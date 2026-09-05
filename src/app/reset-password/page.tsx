import Link from "next/link";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata = { title: "Choose a new password" };

// Not one of the spec's originally-listed routes, but required to
// complete Supabase's email-based password recovery flow started from
// /forgot-password (documented as an intentional V1 addition in the README).
export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-(--color-bg) px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="text-xl font-bold tracking-tight text-(--color-navy)">
            BrandSight
          </Link>
          <h1 className="mt-4 text-2xl font-semibold text-(--color-text)">Choose a new password</h1>
        </div>
        <ResetPasswordForm />
      </div>
    </div>
  );
}
