import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/how-it-works", "/login", "/signup", "/forgot-password"],
        disallow: ["/dashboard", "/brands", "/audits", "/settings", "/admin", "/api", "/shared"],
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
