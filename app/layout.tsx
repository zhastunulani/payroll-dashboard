import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host?.includes("localhost") ? "http" : "https");
  const imageUrl = host ? `${protocol}://${host}/og.png` : undefined;

  return {
    title: {
      default: "Айлық дашборды",
      template: "%s · Айлық дашборды",
    },
    description:
      "Бөлімдердің айлығы, шығындар және төлем статусы бір жерде.",
    icons: {
      icon: "/favicon.svg",
    },
    openGraph: {
      title: "Айлық дашборды",
      description: "Айлық төлемдері мен шығындарды анық бақылаңыз.",
      type: "website",
      locale: "kk_KZ",
      images: imageUrl ? [{ url: imageUrl, alt: "Айлық дашборды" }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: "Айлық дашборды",
      description: "Айлық төлемдері мен шығындарды анық бақылаңыз.",
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="kk">
      <body className={inter.variable}>{children}</body>
    </html>
  );
}
