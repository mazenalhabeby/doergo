import type { Metadata } from "next";
import PrivacyClient from "./page-client";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How HBCField collects, uses, stores, and protects your data.",
  alternates: { canonical: "/privacy" },
};

export default function Page() {
  return <PrivacyClient />;
}
