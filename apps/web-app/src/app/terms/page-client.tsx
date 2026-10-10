"use client"

import { Scale, Globe, LifeBuoy, Mail, Receipt } from "lucide-react"
import Link from "next/link"
import { useTranslation } from "react-i18next"
import { LegalContactCard, LegalDocument } from "@/components/marketing/legal-document"

export default function TermsPage() {
  const { t } = useTranslation()

  return (
    <LegalDocument ns="terms" sectionCount={16} badgeIcon={Scale} email="office@hbcfield.com">
      {/* 1. Agreement */}
      <h2 id="s1">{t("terms.s1.title")}</h2>
      <p>{t("terms.s1.p1")}</p>
      <p>{t("terms.s1.p2")}</p>

      {/* 2. Definitions */}
      <h2 id="s2">{t("terms.s2.title")}</h2>
      <p>{t("terms.s2.intro")}</p>
      <ul>
        <li><strong>{t("terms.s2.serviceLabel")}</strong>{t("terms.s2.serviceText")}</li>
        <li><strong>{t("terms.s2.orgLabel")}</strong>{t("terms.s2.orgText")}</li>
        <li><strong>{t("terms.s2.adminLabel")}</strong>{t("terms.s2.adminText")}</li>
        <li><strong>{t("terms.s2.memberLabel")}</strong>{t("terms.s2.memberText")}</li>
        <li><strong>{t("terms.s2.seatLabel")}</strong>{t("terms.s2.seatText")}</li>
        <li><strong>{t("terms.s2.dataLabel")}</strong>{t("terms.s2.dataText")}</li>
      </ul>

      {/* 3. Service & Licence */}
      <h2 id="s3">{t("terms.s3.title")}</h2>
      <p>{t("terms.s3.intro")}</p>
      <p>{t("terms.s3.licence")}</p>
      <h3>{t("terms.s3.restrictTitle")}</h3>
      <ul>
        <li>{t("terms.s3.restrict1")}</li>
        <li>{t("terms.s3.restrict2")}</li>
        <li>{t("terms.s3.restrict3")}</li>
        <li>{t("terms.s3.restrict4")}</li>
      </ul>

      {/* 4. Accounts */}
      <h2 id="s4">{t("terms.s4.title")}</h2>
      <p>{t("terms.s4.intro")}</p>
      <ul>
        <li>{t("terms.s4.item1")}</li>
        <li>{t("terms.s4.item2")}</li>
        <li>{t("terms.s4.item3")}</li>
        <li>{t("terms.s4.item4")}</li>
      </ul>

      {/* 5. Subscriptions, Seats & Plans */}
      <h2 id="s5">{t("terms.s5.title")}</h2>
      <p>{t("terms.s5.intro")}</p>
      <p>{t("terms.s5.seats")}</p>

      {/* plan callout */}
      <div className="not-prose my-8 overflow-hidden rounded-2xl border border-blue-200/70 bg-blue-50/60">
        <div className="flex items-center gap-2.5 border-b border-blue-200/60 bg-blue-50 px-6 py-4">
          <span className="flex size-8 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600">
            <Receipt className="size-4" />
          </span>
          <h4 className="m-0 text-[15px] font-semibold text-blue-950">{t("terms.s5.plansTitle")}</h4>
        </div>
        {/*
          These three ARE the bill. The section used to list Starter €29 /
          Professional €59 / Business €99 and an office-vs-field seat
          split — tiers the product stopped selling, in the document that
          states what a customer is agreeing to pay.
        */}
        <ul className="space-y-2.5 px-6 py-5 text-[15px] text-blue-900/90">
          <li className="flex gap-2">
            <span className="font-semibold text-blue-700">{t("terms.s5.seatLabel")}</span>
            <span>{t("terms.s5.seatText")}</span>
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-blue-700">{t("terms.s5.moduleLabel")}</span>
            <span>{t("terms.s5.moduleText")}</span>
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-blue-700">{t("terms.s5.addOnLabel")}</span>
            <span>{t("terms.s5.addOnText")}</span>
          </li>
        </ul>
        <div className="border-t border-blue-200/60 px-6 py-4 text-[13px] text-blue-900/70">
          {t("terms.s5.plansNote")}
        </div>
      </div>

      {/* 6. Fees, Billing & Proration */}
      <h2 id="s6">{t("terms.s6.title")}</h2>
      <p>{t("terms.s6.intro")}</p>
      <ul>
        <li>
          <strong>{t("terms.s6.monthlyLabel")}</strong>
          {t("terms.s6.monthlyText")}
        </li>
        <li>
          <strong>{t("terms.s6.decreaseLabel")}</strong>
          {t("terms.s6.decreaseText")}
        </li>
      </ul>
      <p>{t("terms.s6.processor")}</p>

      {/* 7. Taxes */}
      <h2 id="s7">{t("terms.s7.title")}</h2>
      <p>{t("terms.s7.intro")}</p>
      <p>{t("terms.s7.vatId")}</p>

      {/* 8. Free Trial */}
      <h2 id="s8">{t("terms.s8.title")}</h2>
      <p>{t("terms.s8.intro")}</p>
      <p>{t("terms.s8.expiry")}</p>

      {/* 9. Renewal, Cancellation & Refunds */}
      <h2 id="s9">{t("terms.s9.title")}</h2>
      <ul>
        <li>
          <strong>{t("terms.s9.renewLabel")}</strong>
          {t("terms.s9.renewText")}
        </li>
        <li>
          <strong>{t("terms.s9.cancelLabel")}</strong>
          {t("terms.s9.cancelText")}
        </li>
        <li>
          <strong>{t("terms.s9.refundLabel")}</strong>
          {t("terms.s9.refundText")}
        </li>
        <li>
          <strong>{t("terms.s9.failLabel")}</strong>
          {t("terms.s9.failText")}
        </li>
      </ul>

      {/* 10. Acceptable Use */}
      <h2 id="s10">{t("terms.s10.title")}</h2>
      <p>{t("terms.s10.intro")}</p>
      <ul>
        <li>{t("terms.s10.item1")}</li>
        <li>{t("terms.s10.item2")}</li>
        <li>{t("terms.s10.item3")}</li>
        <li>{t("terms.s10.item4")}</li>
        <li>{t("terms.s10.item5")}</li>
        <li>{t("terms.s10.item6")}</li>
      </ul>

      {/* 11. Customer Data & Privacy */}
      <h2 id="s11">{t("terms.s11.title")}</h2>
      <p>{t("terms.s11.ownership")}</p>
      <p>
        {t("terms.s11.privacyPre")}
        <Link href="/privacy">{t("terms.s11.privacyLink")}</Link>
        {t("terms.s11.privacyPost")}
      </p>
      <p>{t("terms.s11.export")}</p>

      {/* 12. Intellectual Property */}
      <h2 id="s12">{t("terms.s12.title")}</h2>
      <p>{t("terms.s12.ownership")}</p>
      <p>{t("terms.s12.feedback")}</p>

      {/* 13. Third-Party Services */}
      <h2 id="s13">{t("terms.s13.title")}</h2>
      <p>{t("terms.s13.intro")}</p>
      <ul>
        <li><strong>{t("terms.s13.stripeLabel")}</strong>{t("terms.s13.stripeText")}</li>
        <li><strong>{t("terms.s13.hostingLabel")}</strong>{t("terms.s13.hostingText")}</li>
        <li><strong>{t("terms.s13.pushLabel")}</strong>{t("terms.s13.pushText")}</li>
        <li><strong>{t("terms.s13.mapsLabel")}</strong>{t("terms.s13.mapsText")}</li>
      </ul>

      {/* 14. Warranties, Availability & Liability */}
      <h2 id="s14">{t("terms.s14.title")}</h2>
      <p>{t("terms.s14.availability")}</p>
      <p>{t("terms.s14.asis")}</p>
      <p>{t("terms.s14.liability")}</p>
      <p>{t("terms.s14.mandatory")}</p>

      {/* 15. Term, Suspension & Termination */}
      <h2 id="s15">{t("terms.s15.title")}</h2>
      <p>{t("terms.s15.term")}</p>
      <p>{t("terms.s15.suspend")}</p>
      <p>{t("terms.s15.effect")}</p>

      {/* 16. Governing Law, Changes & Contact */}
      <h2 id="s16">{t("terms.s16.title")}</h2>
      <p>{t("terms.s16.law")}</p>
      <p>{t("terms.s16.changes")}</p>

      {/* contact card */}
      <LegalContactCard
        company={t("terms.s16.company")}
        rows={[
          { icon: Mail, label: t("terms.s16.emailLabel"), href: "mailto:office@hbcfield.com", text: "office@hbcfield.com" },
          { icon: Globe, label: t("terms.s16.websiteLabel"), href: "https://hbcfield.com", text: "https://hbcfield.com" },
          { icon: LifeBuoy, label: t("terms.s16.supportLabel"), href: "mailto:support@hbcfield.com", text: "support@hbcfield.com" },
        ]}
      />
    </LegalDocument>
  )
}
