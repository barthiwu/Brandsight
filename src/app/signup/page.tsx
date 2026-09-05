import Link from "next/link";
import { SignUpForm } from "./SignUpForm";

export const metadata = { title: "Sign up" };

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-(--color-bg) px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="text-xl font-bold tracking-tight text-(--color-navy)">
            BrandSight
          </Link>
          <h1 className="mt-4 text-2xl font-semibold text-(--color-text)">Create your free account</h1>
          <p className="mt-2 text-sm text-(--color-text-secondary)">
            See your brand clearly — get your first audit in minutes.
          </p>
        </div>
        <SignUpForm />
        <p className="mt-6 text-center text-sm text-(--color-text-secondary)">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-(--color-blue) hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
