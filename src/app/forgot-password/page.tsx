import Link from "next/link";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-(--color-bg) px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="text-xl font-bold tracking-tight text-(--color-navy)">
            BrandSight
          </Link>
          <h1 className="mt-4 text-2xl font-semibold text-(--color-text)">Reset your password</h1>
          <p className="mt-2 text-sm text-(--color-text-secondary)">
            We&apos;ll email you a link to choose a new password.
          </p>
        </div>
        <ForgotPasswordForm />
        <p className="mt-6 text-center text-sm text-(--color-text-secondary)">
          <Link href="/login" className="font-medium text-(--color-blue) hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
    </div>
  );
}
