import type { Metadata } from "next";
import { isPageAuthenticated } from "@/lib/auth";
import { LoginPage, PayrollApp } from "./PayrollApp";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Айлық дашборды",
  description: "Айлық төлемдері мен операциялық шығындарды басқару жүйесі.",
};

export default async function Home() {
  const authenticated = await isPageAuthenticated();
  return authenticated ? <PayrollApp /> : <LoginPage />;
}
