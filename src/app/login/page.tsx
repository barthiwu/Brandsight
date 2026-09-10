import Link from "next/link";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Log in" };

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const redirectTo = typeof params.redirectTo === "string" ? params.redirectTo : undefined;
  const oauthError = params.error === "google_unavailable";

  return (
    <div className="flex min-h-screen items-center justify-center bg-(--color-bg) px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="text-[1.81rem] font-bold tracking-tight text-(--color-logo)">
            BrandSight
          </Link>
          <h1 className="mt-4 text-2xl font-semibold text-(--color-text)">Log in to your account</h1>
        </div>
        <LoginForm redirectTo={redirectTo} googleUnavailable={oauthError} />
        <p className="mt-6 text-center text-sm text-(--color-text-secondary)">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium text-(--color-blue) hover:underline">
            Sign up free
          </Link>
        </p>
      </div>
    </div>
  );
}
