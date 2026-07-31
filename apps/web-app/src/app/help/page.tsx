import type { Metadata } from "next";
import HelpClient from "./page-client";

export const metadata: Metadata = {
  title: "Help Center",
  description:
    "Guides and answers for using HBCField — tasks, dispatch, GPS tracking, time & attendance, and reporting.",
  alternates: { canonical: "/help" },
};

export default function Page() {
  return <HelpClient />;
}
