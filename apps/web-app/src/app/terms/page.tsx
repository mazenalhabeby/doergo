import type { Metadata } from "next";
import TermsClient from "./_components/page-client";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms and conditions governing use of HBCField.",
  alternates: { canonical: "/terms" },
};

export default function Page() {
  return <TermsClient />;
}
