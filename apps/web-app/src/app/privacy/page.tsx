"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-muted to-card">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-blue-600 transition-colors">
            <ArrowLeft className="size-4" />
            Back to HBCField
          </Link>
          <span className="text-sm text-muted-foreground">Last updated: 20 April 2026</span>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold text-foreground mb-2">Privacy Policy</h1>
        <p className="text-lg text-muted-foreground mb-12">HBCField — Field Service Management Platform</p>

        <div className="prose prose-slate prose-lg max-w-none">
          <p>
            HBC Group GmbH (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) operates the HBCField mobile application and web platform.
            This Privacy Policy explains how we collect, use, and protect your information when you use our services.
          </p>

          <h2>1. Information We Collect</h2>

          <h3>Account Information</h3>
          <ul>
            <li>Email address</li>
            <li>First and last name</li>
            <li>Organization name</li>
            <li>Role and permissions within your organization</li>
          </ul>

          <h3>Location Data</h3>
          <ul>
            <li><strong>Precise GPS location</strong> — collected only during active work activities:
              <ul>
                <li>When an employee is driving to a job site (EN_ROUTE status)</li>
                <li>When clocking in or out (single GPS fix for attendance verification)</li>
                <li>When marking arrival at a job site (geofence verification)</li>
              </ul>
            </li>
            <li><strong>Cached location</strong> — used for presence indicators on the dispatcher&apos;s live map. This uses the device&apos;s last known position without activating the GPS radio.</li>
            <li>Location data is <strong>never collected</strong> when the app is idle, when browsing tasks, or outside of active work shifts.</li>
          </ul>

          <h3>Work Activity Data</h3>
          <ul>
            <li>Task status updates and timestamps</li>
            <li>Clock in/out times and break durations</li>
            <li>Service reports including text descriptions, photos, and digital signatures</li>
            <li>Comments on tasks</li>
          </ul>

          <h3>Device Information</h3>
          <ul>
            <li>Device type and operating system (for push notifications)</li>
            <li>Push notification tokens (Expo Push Token)</li>
            <li>App version</li>
          </ul>

          <h2>2. How We Use Your Information</h2>
          <ul>
            <li>To provide field service management functionality</li>
            <li>To enable real-time location tracking for dispatchers during active work</li>
            <li>To verify attendance via geofencing at company locations</li>
            <li>To verify employee presence at job sites before starting work</li>
            <li>To send push notifications for task assignments, status updates, and comments</li>
            <li>To generate service reports and maintain work history</li>
            <li>To display route tracking on completed tasks</li>
            <li>To improve app performance and fix bugs</li>
          </ul>

          <h2>3. Legal Basis for Processing (GDPR)</h2>
          <p>Where the General Data Protection Regulation applies, we process your personal data on the following legal bases:</p>
          <ul>
            <li><strong>Performance of a contract (Art. 6(1)(b) GDPR)</strong> — to provide the HBCField service to your organization and to you as an authorized user, including task assignment, location-based dispatching, attendance verification, and service reporting.</li>
            <li><strong>Legitimate interests (Art. 6(1)(f) GDPR)</strong> — to secure our platform, prevent fraud and abuse, maintain service reliability, and improve the product. Our legitimate interests are balanced against your rights and freedoms.</li>
            <li><strong>Consent (Art. 6(1)(a) GDPR)</strong> — for optional features such as push notifications, which you can disable at any time in your device settings.</li>
            <li><strong>Legal obligation (Art. 6(1)(c) GDPR)</strong> — where we are required to retain records for tax, labor, or other statutory obligations applicable to your organization.</li>
          </ul>

          <h2>4. Data Sharing</h2>
          <ul>
            <li>We do <strong>not</strong> sell your personal data to third parties.</li>
            <li>Your data is shared only within your organization — admin and dispatcher users can see employee locations and work activity.</li>
            <li>We use the following third-party services:
              <ul>
                <li><strong>Expo</strong> — Push notification delivery</li>
                <li><strong>Firebase Cloud Messaging (FCM)</strong> — Android push notification routing</li>
                <li><strong>Apple Push Notification Service (APNs)</strong> — iOS push notification routing</li>
                <li><strong>Hetzner Cloud</strong> — Server hosting (EU-based, Finland/Germany)</li>
                <li><strong>Hetzner Object Storage</strong> — File storage for attachments (EU-based)</li>
                <li><strong>OpenStreetMap / OSRM</strong> — Map tiles and route visualization</li>
                <li><strong>Nominatim</strong> — Address search (geocoding)</li>
              </ul>
            </li>
          </ul>

          <h2>5. Data Storage &amp; Security</h2>
          <ul>
            <li>All data is stored on servers located in the <strong>European Union</strong> (Hetzner, Helsinki/Falkenstein)</li>
            <li>Data is encrypted in transit using TLS/HTTPS</li>
            <li>Passwords are hashed using bcrypt with cost factor 12</li>
            <li>Authentication tokens are SHA-256 hashed before storage</li>
            <li>Refresh tokens use rotation with grace periods for concurrent requests</li>
            <li>Access is restricted by role-based permissions (RBAC)</li>
            <li>Rate limiting protects against brute-force attacks (10 req/sec, 200 req/min)</li>
            <li>Account lockout after 5 failed login attempts (15-minute cooldown)</li>
            <li>File uploads are stored in S3-compatible object storage with presigned URLs</li>
          </ul>

          <h2>6. Data Retention</h2>
          <ul>
            <li>Account data is retained while your account is active</li>
            <li>Location history (route tracking) is retained for 90 days</li>
            <li>Service reports are retained according to your organization&apos;s record-keeping requirements</li>
            <li>Refresh tokens are automatically cleaned up after expiration</li>
            <li>You can request complete data deletion at any time</li>
          </ul>

          <h2>7. Your Rights (GDPR)</h2>
          <p>If you are located in the European Union or European Economic Area, you have the following rights under the General Data Protection Regulation (GDPR):</p>
          <ul>
            <li><strong>Right of Access</strong> — Request a copy of your personal data</li>
            <li><strong>Right to Rectification</strong> — Correct inaccurate or incomplete data</li>
            <li><strong>Right to Erasure</strong> — Request deletion of your personal data (&quot;right to be forgotten&quot;)</li>
            <li><strong>Right to Data Portability</strong> — Receive your data in a structured, machine-readable format</li>
            <li><strong>Right to Object</strong> — Object to processing of your personal data</li>
            <li><strong>Right to Restrict Processing</strong> — Request limitation of data processing</li>
            <li><strong>Right to Withdraw Consent</strong> — Withdraw your consent at any time</li>
            <li><strong>Right to Lodge a Complaint</strong> — You have the right to lodge a complaint with your local data protection authority if you believe your rights have been infringed.</li>
          </ul>
          <p>To exercise any of these rights, contact us at <a href="mailto:privacy@hbcfield.com">privacy@hbcfield.com</a>.</p>

          <h2>8. Location Tracking Disclosure</h2>
          <p>HBCField uses location data as a core part of its field service management functionality. Here is exactly when and how location is used:</p>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 not-prose my-6">
            <h4 className="font-semibold text-blue-900 mb-3">When GPS is Active</h4>
            <ul className="space-y-2 text-blue-800 text-base">
              <li className="flex gap-2"><span className="font-semibold text-blue-600">Driving to job:</span> Continuous tracking every 15 seconds (balanced accuracy)</li>
              <li className="flex gap-2"><span className="font-semibold text-blue-600">Clock in/out:</span> Single high-accuracy fix for attendance verification</li>
              <li className="flex gap-2"><span className="font-semibold text-blue-600">Arriving at job:</span> Single high-accuracy fix for geofence verification (20m radius)</li>
            </ul>
            <h4 className="font-semibold text-blue-900 mt-4 mb-3">When GPS is NOT Active</h4>
            <ul className="space-y-2 text-blue-800 text-base">
              <li>Browsing tasks, viewing profile, changing settings</li>
              <li>App is in background or closed</li>
              <li>Presence indicator uses cached OS location only (no GPS activation)</li>
            </ul>
          </div>

          <p>Additional safeguards:</p>
          <ul>
            <li>Only dispatchers and admins within your organization can see your location</li>
            <li>Location data is never shared outside your organization</li>
            <li>Route data from completed tasks is retained for 90 days</li>
            <li>You can see your own location data in the app</li>
          </ul>

          <h2>9. Push Notifications</h2>
          <p>HBCField sends push notifications for:</p>
          <ul>
            <li>New task assignments</li>
            <li>Task status changes</li>
            <li>New comments on your tasks</li>
            <li>Join request approvals or rejections</li>
            <li>Attendance reminders</li>
          </ul>
          <p>You can disable push notifications in your device settings at any time.</p>

          <h2>10. Children&apos;s Privacy</h2>
          <p>
            HBCField is a workplace application designed for professional use. It is not intended for use by
            individuals under 18 years of age. We do not knowingly collect personal information from children.
          </p>

          <h2>11. International Data Transfers</h2>
          <p>
            Your data is processed and stored within the European Union. Push notification delivery may involve
            routing through Google (FCM) or Apple (APNs) infrastructure, which may process data outside the EU.
            These transfers are covered by the EU-US Data Privacy Framework and Standard Contractual Clauses.
          </p>

          <h2>12. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time to reflect changes in our practices or legal requirements.
            We will notify users of material changes via email or in-app notification. The &quot;Last updated&quot; date at the
            top of this page indicates when this policy was last revised.
          </p>

          <h2>13. Contact Us</h2>
          <div className="bg-muted border border-border rounded-xl p-6 not-prose my-6">
            <p className="font-semibold text-foreground mb-2">HBC Group GmbH</p>
            <ul className="space-y-1 text-muted-foreground text-base">
              <li>Email: <a href="mailto:privacy@hbcfield.com" className="text-blue-600 hover:underline">privacy@hbcfield.com</a></li>
              <li>Website: <a href="https://hbcfield.com" className="text-blue-600 hover:underline">https://hbcfield.com</a></li>
              <li>Support: <a href="mailto:support@hbcfield.com" className="text-blue-600 hover:underline">support@hbcfield.com</a></li>
            </ul>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12">
        <div className="max-w-3xl mx-auto px-6 py-8 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} HBC Group GmbH. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
