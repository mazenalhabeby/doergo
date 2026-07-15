import Link from "next/link"
import { ArrowLeft, Trash2, ShieldCheck, Mail, Smartphone, Clock } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Account & Data Deletion — HBCField",
  description:
    "How to delete your HBCField account and associated data, and what data is removed or retained.",
}

// Public, unauthenticated page. Referenced from the Apple/Google store listings
// (Google Play requires a publicly accessible account-deletion URL).
export default function AccountDeletionPage() {
  return (
    <div className="min-h-screen bg-white text-slate-600 [color-scheme:light]">
      {/* top nav */}
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3.5">
          <Link href="/" className="text-sm font-semibold tracking-tight text-slate-900">
            HBCField
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3.5 py-1.5 text-[13px] font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
          >
            <ArrowLeft className="size-3.5" />
            Back to HBCField
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16">
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500 shadow-sm">
          <Trash2 className="size-3.5 text-blue-600" />
          Account &amp; Data Deletion
        </span>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-900">
          Delete your HBCField account
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-slate-500">
          You can permanently delete your HBCField account and personal data at any time. This
          page explains how, and exactly what is removed.
        </p>

        {/* Method 1: in-app */}
        <section className="mt-12">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <Smartphone className="size-5 text-blue-600" />
            Delete from the mobile app (recommended)
          </h2>
          <ol className="mt-4 list-decimal space-y-2 pl-6 leading-relaxed">
            <li>Open the HBCField app and sign in.</li>
            <li>
              Go to the <strong>Profile</strong> tab.
            </li>
            <li>
              Tap <strong>Account</strong>.
            </li>
            <li>
              Scroll to <strong>Delete Account</strong> and confirm with your password.
            </li>
          </ol>
          <p className="mt-4 leading-relaxed">
            Deletion is immediate and permanent. Your login is invalidated and your account can no
            longer be used.
          </p>
        </section>

        {/* Method 2: by request */}
        <section className="mt-12">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <Mail className="size-5 text-blue-600" />
            Delete by request
          </h2>
          <p className="mt-4 leading-relaxed">
            If you cannot access the app, email{" "}
            <a
              href="mailto:support@hbcfield.com?subject=Account%20deletion%20request"
              className="font-medium text-blue-600 hover:underline"
            >
              support@hbcfield.com
            </a>{" "}
            from your account email address, or ask your organization administrator to remove you.
            We action verified requests within 30 days.
          </p>
        </section>

        {/* What gets deleted */}
        <section className="mt-12">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <ShieldCheck className="size-5 text-blue-600" />
            What is deleted
          </h2>
          <ul className="mt-4 list-disc space-y-2 pl-6 leading-relaxed">
            <li>Your profile: name, email, and login credentials.</li>
            <li>Your device push-notification tokens.</li>
            <li>Your personal location history and attendance records.</li>
          </ul>
        </section>

        {/* Retention */}
        <section className="mt-12">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <Clock className="size-5 text-blue-600" />
            What may be retained
          </h2>
          <p className="mt-4 leading-relaxed">
            Work records you created on behalf of an organization (for example completed tasks and
            service reports) belong to that organization and may be retained by it for its own
            business and legal-compliance purposes. Records required for legal, tax, or accounting
            obligations may be retained for the period required by law, after which they are deleted.
          </p>
        </section>

        <div className="mt-16 border-t border-slate-200 pt-6 text-sm text-slate-400">
          Questions? Contact{" "}
          <a href="mailto:support@hbcfield.com" className="text-blue-600 hover:underline">
            support@hbcfield.com
          </a>
          . See also our{" "}
          <Link href="/privacy" className="text-blue-600 hover:underline">
            Privacy Policy
          </Link>
          .
        </div>
      </main>
    </div>
  )
}
