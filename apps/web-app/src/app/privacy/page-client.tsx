"use client"

import { ShieldCheck, Globe, LifeBuoy, Mail, MapPin } from "lucide-react"
import { useTranslation } from "react-i18next"
import { LegalContactCard, LegalDocument } from "@/components/marketing/legal-document"

export default function PrivacyPolicyPage() {
  const { t } = useTranslation()

  return (
    <LegalDocument ns="privacy" sectionCount={13} badgeIcon={ShieldCheck} email="privacy@hbcfield.com">
      <h2 id="s1">{t("privacy.s1.title")}</h2>

      <h3>{t("privacy.s1.accountTitle")}</h3>
      <ul>
        <li>{t("privacy.s1.accountEmail")}</li>
        <li>{t("privacy.s1.accountName")}</li>
        <li>{t("privacy.s1.accountOrg")}</li>
        <li>{t("privacy.s1.accountRole")}</li>
      </ul>

      <h3>{t("privacy.s1.locationTitle")}</h3>
      <ul>
        <li>
          <strong>{t("privacy.s1.gpsLabel")}</strong>
          {t("privacy.s1.gpsIntro")}
          <ul>
            <li>{t("privacy.s1.gps1")}</li>
            <li>{t("privacy.s1.gps2")}</li>
            <li>{t("privacy.s1.gps3")}</li>
          </ul>
        </li>
        <li>
          <strong>{t("privacy.s1.cachedLabel")}</strong>
          {t("privacy.s1.cachedText")}
        </li>
        <li>
          {t("privacy.s1.neverPre")}
          <strong>{t("privacy.s1.neverBold")}</strong>
          {t("privacy.s1.neverPost")}
        </li>
      </ul>

      <h3>{t("privacy.s1.workTitle")}</h3>
      <ul>
        <li>{t("privacy.s1.work1")}</li>
        <li>{t("privacy.s1.work2")}</li>
        <li>{t("privacy.s1.work3")}</li>
        <li>{t("privacy.s1.work4")}</li>
      </ul>

      <h3>{t("privacy.s1.deviceTitle")}</h3>
      <ul>
        <li>{t("privacy.s1.device1")}</li>
        <li>{t("privacy.s1.device2")}</li>
        <li>{t("privacy.s1.device3")}</li>
      </ul>

      <h2 id="s2">{t("privacy.s2.title")}</h2>
      <ul>
        <li>{t("privacy.s2.item1")}</li>
        <li>{t("privacy.s2.item2")}</li>
        <li>{t("privacy.s2.item3")}</li>
        <li>{t("privacy.s2.item4")}</li>
        <li>{t("privacy.s2.item5")}</li>
        <li>{t("privacy.s2.item6")}</li>
        <li>{t("privacy.s2.item7")}</li>
        <li>{t("privacy.s2.item8")}</li>
      </ul>

      <h2 id="s3">{t("privacy.s3.title")}</h2>
      <p>{t("privacy.s3.intro")}</p>
      <ul>
        <li>
          <strong>{t("privacy.s3.contractLabel")}</strong>
          {t("privacy.s3.contractText")}
        </li>
        <li>
          <strong>{t("privacy.s3.legitLabel")}</strong>
          {t("privacy.s3.legitText")}
        </li>
        <li>
          <strong>{t("privacy.s3.consentLabel")}</strong>
          {t("privacy.s3.consentText")}
        </li>
        <li>
          <strong>{t("privacy.s3.legalLabel")}</strong>
          {t("privacy.s3.legalText")}
        </li>
      </ul>

      <h2 id="s4">{t("privacy.s4.title")}</h2>
      <ul>
        <li>
          {t("privacy.s4.noSellPre")}
          <strong>{t("privacy.s4.noSellBold")}</strong>
          {t("privacy.s4.noSellPost")}
        </li>
        <li>{t("privacy.s4.internal")}</li>
        <li>
          {t("privacy.s4.thirdPartyIntro")}
          <ul>
            <li>
              <strong>{t("privacy.s4.expoLabel")}</strong>
              {t("privacy.s4.expoText")}
            </li>
            <li>
              <strong>{t("privacy.s4.fcmLabel")}</strong>
              {t("privacy.s4.fcmText")}
            </li>
            <li>
              <strong>{t("privacy.s4.apnsLabel")}</strong>
              {t("privacy.s4.apnsText")}
            </li>
            <li>
              <strong>{t("privacy.s4.hetznerCloudLabel")}</strong>
              {t("privacy.s4.hetznerCloudText")}
            </li>
            <li>
              <strong>{t("privacy.s4.hetznerStorageLabel")}</strong>
              {t("privacy.s4.hetznerStorageText")}
            </li>
            <li>
              <strong>{t("privacy.s4.osmLabel")}</strong>
              {t("privacy.s4.osmText")}
            </li>
            <li>
              <strong>{t("privacy.s4.nominatimLabel")}</strong>
              {t("privacy.s4.nominatimText")}
            </li>
          </ul>
        </li>
      </ul>

      <h2 id="s5">{t("privacy.s5.title")}</h2>
      <ul>
        <li>
          {t("privacy.s5.euPre")}
          <strong>{t("privacy.s5.euBold")}</strong>
          {t("privacy.s5.euPost")}
        </li>
        <li>{t("privacy.s5.item2")}</li>
        <li>{t("privacy.s5.item3")}</li>
        <li>{t("privacy.s5.item4")}</li>
        <li>{t("privacy.s5.item5")}</li>
        <li>{t("privacy.s5.item6")}</li>
        <li>{t("privacy.s5.item7")}</li>
        <li>{t("privacy.s5.item8")}</li>
        <li>{t("privacy.s5.item9")}</li>
      </ul>

      <h2 id="s6">{t("privacy.s6.title")}</h2>
      <ul>
        <li>{t("privacy.s6.item1")}</li>
        <li>{t("privacy.s6.item2")}</li>
        <li>{t("privacy.s6.item3")}</li>
        <li>{t("privacy.s6.item4")}</li>
        <li>{t("privacy.s6.item5")}</li>
      </ul>

      <h2 id="s7">{t("privacy.s7.title")}</h2>
      <p>{t("privacy.s7.intro")}</p>
      <ul>
        <li>
          <strong>{t("privacy.s7.accessLabel")}</strong>
          {t("privacy.s7.accessText")}
        </li>
        <li>
          <strong>{t("privacy.s7.rectificationLabel")}</strong>
          {t("privacy.s7.rectificationText")}
        </li>
        <li>
          <strong>{t("privacy.s7.erasureLabel")}</strong>
          {t("privacy.s7.erasureText")}
        </li>
        <li>
          <strong>{t("privacy.s7.portabilityLabel")}</strong>
          {t("privacy.s7.portabilityText")}
        </li>
        <li>
          <strong>{t("privacy.s7.objectLabel")}</strong>
          {t("privacy.s7.objectText")}
        </li>
        <li>
          <strong>{t("privacy.s7.restrictLabel")}</strong>
          {t("privacy.s7.restrictText")}
        </li>
        <li>
          <strong>{t("privacy.s7.withdrawLabel")}</strong>
          {t("privacy.s7.withdrawText")}
        </li>
        <li>
          <strong>{t("privacy.s7.complaintLabel")}</strong>
          {t("privacy.s7.complaintText")}
        </li>
      </ul>
      <p>
        {t("privacy.s7.contactPre")}
        <a href="mailto:privacy@hbcfield.com">privacy@hbcfield.com</a>
        {t("privacy.s7.contactPost")}
      </p>

      <h2 id="s8">{t("privacy.s8.title")}</h2>
      <p>{t("privacy.s8.intro")}</p>

      {/* GPS behaviour callout */}
      <div className="not-prose my-8 overflow-hidden rounded-2xl border border-blue-200/70 bg-blue-50/60">
        <div className="flex items-center gap-2.5 border-b border-blue-200/60 bg-blue-50 px-6 py-4">
          <span className="flex size-8 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600">
            <MapPin className="size-4" />
          </span>
          <h4 className="m-0 text-[15px] font-semibold text-blue-950">{t("privacy.s8.gpsActiveTitle")}</h4>
        </div>
        <ul className="space-y-2.5 px-6 py-5 text-[15px] text-blue-900/90">
          <li className="flex gap-2">
            <span className="font-semibold text-blue-700">{t("privacy.s8.drivingLabel")}</span>
            <span>{t("privacy.s8.drivingText")}</span>
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-blue-700">{t("privacy.s8.clockLabel")}</span>
            <span>{t("privacy.s8.clockText")}</span>
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-blue-700">{t("privacy.s8.arrivingLabel")}</span>
            <span>{t("privacy.s8.arrivingText")}</span>
          </li>
        </ul>
        <div className="border-t border-blue-200/60 px-6 py-5">
          <h4 className="m-0 mb-2.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-blue-700/80">
            {t("privacy.s8.gpsInactiveTitle")}
          </h4>
          <ul className="space-y-1.5 text-[15px] text-blue-900/80">
            <li>{t("privacy.s8.inactive1")}</li>
            <li>{t("privacy.s8.inactive2")}</li>
            <li>{t("privacy.s8.inactive3")}</li>
          </ul>
        </div>
      </div>

      <p>{t("privacy.s8.safeguardsIntro")}</p>
      <ul>
        <li>{t("privacy.s8.safeguard1")}</li>
        <li>{t("privacy.s8.safeguard2")}</li>
        <li>{t("privacy.s8.safeguard3")}</li>
        <li>{t("privacy.s8.safeguard4")}</li>
      </ul>

      <h2 id="s9">{t("privacy.s9.title")}</h2>
      <p>{t("privacy.s9.intro")}</p>
      <ul>
        <li>{t("privacy.s9.item1")}</li>
        <li>{t("privacy.s9.item2")}</li>
        <li>{t("privacy.s9.item3")}</li>
        <li>{t("privacy.s9.item4")}</li>
        <li>{t("privacy.s9.item5")}</li>
      </ul>
      <p>{t("privacy.s9.disable")}</p>

      <h2 id="s10">{t("privacy.s10.title")}</h2>
      <p>{t("privacy.s10.body")}</p>

      <h2 id="s11">{t("privacy.s11.title")}</h2>
      <p>{t("privacy.s11.body")}</p>

      <h2 id="s12">{t("privacy.s12.title")}</h2>
      <p>{t("privacy.s12.body")}</p>

      <h2 id="s13">{t("privacy.s13.title")}</h2>
      {/* contact card */}
      <LegalContactCard
        company={t("privacy.s13.company")}
        rows={[
          { icon: Mail, label: t("privacy.s13.emailLabel"), href: "mailto:privacy@hbcfield.com", text: "privacy@hbcfield.com" },
          { icon: Globe, label: t("privacy.s13.websiteLabel"), href: "https://hbcfield.com", text: "https://hbcfield.com" },
          { icon: LifeBuoy, label: t("privacy.s13.supportLabel"), href: "mailto:support@hbcfield.com", text: "support@hbcfield.com" },
        ]}
      />
    </LegalDocument>
  )
}
