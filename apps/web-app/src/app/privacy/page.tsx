"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { useTranslation } from "react-i18next"

export default function PrivacyPolicyPage() {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted to-card">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-blue-600 transition-colors">
            <ArrowLeft className="size-4" />
            {t('privacy.backToHbcfield')}
          </Link>
          <span className="text-sm text-muted-foreground">{t('privacy.lastUpdated')}</span>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold text-foreground mb-2">{t('privacy.title')}</h1>
        <p className="text-lg text-muted-foreground mb-12">{t('privacy.subtitle')}</p>

        <div className="prose prose-slate prose-lg max-w-none">
          <p>{t('privacy.intro')}</p>

          <h2>{t('privacy.s1.title')}</h2>

          <h3>{t('privacy.s1.accountTitle')}</h3>
          <ul>
            <li>{t('privacy.s1.accountEmail')}</li>
            <li>{t('privacy.s1.accountName')}</li>
            <li>{t('privacy.s1.accountOrg')}</li>
            <li>{t('privacy.s1.accountRole')}</li>
          </ul>

          <h3>{t('privacy.s1.locationTitle')}</h3>
          <ul>
            <li><strong>{t('privacy.s1.gpsLabel')}</strong>{t('privacy.s1.gpsIntro')}
              <ul>
                <li>{t('privacy.s1.gps1')}</li>
                <li>{t('privacy.s1.gps2')}</li>
                <li>{t('privacy.s1.gps3')}</li>
              </ul>
            </li>
            <li><strong>{t('privacy.s1.cachedLabel')}</strong>{t('privacy.s1.cachedText')}</li>
            <li>{t('privacy.s1.neverPre')}<strong>{t('privacy.s1.neverBold')}</strong>{t('privacy.s1.neverPost')}</li>
          </ul>

          <h3>{t('privacy.s1.workTitle')}</h3>
          <ul>
            <li>{t('privacy.s1.work1')}</li>
            <li>{t('privacy.s1.work2')}</li>
            <li>{t('privacy.s1.work3')}</li>
            <li>{t('privacy.s1.work4')}</li>
          </ul>

          <h3>{t('privacy.s1.deviceTitle')}</h3>
          <ul>
            <li>{t('privacy.s1.device1')}</li>
            <li>{t('privacy.s1.device2')}</li>
            <li>{t('privacy.s1.device3')}</li>
          </ul>

          <h2>{t('privacy.s2.title')}</h2>
          <ul>
            <li>{t('privacy.s2.item1')}</li>
            <li>{t('privacy.s2.item2')}</li>
            <li>{t('privacy.s2.item3')}</li>
            <li>{t('privacy.s2.item4')}</li>
            <li>{t('privacy.s2.item5')}</li>
            <li>{t('privacy.s2.item6')}</li>
            <li>{t('privacy.s2.item7')}</li>
            <li>{t('privacy.s2.item8')}</li>
          </ul>

          <h2>{t('privacy.s3.title')}</h2>
          <p>{t('privacy.s3.intro')}</p>
          <ul>
            <li><strong>{t('privacy.s3.contractLabel')}</strong>{t('privacy.s3.contractText')}</li>
            <li><strong>{t('privacy.s3.legitLabel')}</strong>{t('privacy.s3.legitText')}</li>
            <li><strong>{t('privacy.s3.consentLabel')}</strong>{t('privacy.s3.consentText')}</li>
            <li><strong>{t('privacy.s3.legalLabel')}</strong>{t('privacy.s3.legalText')}</li>
          </ul>

          <h2>{t('privacy.s4.title')}</h2>
          <ul>
            <li>{t('privacy.s4.noSellPre')}<strong>{t('privacy.s4.noSellBold')}</strong>{t('privacy.s4.noSellPost')}</li>
            <li>{t('privacy.s4.internal')}</li>
            <li>{t('privacy.s4.thirdPartyIntro')}
              <ul>
                <li><strong>{t('privacy.s4.expoLabel')}</strong>{t('privacy.s4.expoText')}</li>
                <li><strong>{t('privacy.s4.fcmLabel')}</strong>{t('privacy.s4.fcmText')}</li>
                <li><strong>{t('privacy.s4.apnsLabel')}</strong>{t('privacy.s4.apnsText')}</li>
                <li><strong>{t('privacy.s4.hetznerCloudLabel')}</strong>{t('privacy.s4.hetznerCloudText')}</li>
                <li><strong>{t('privacy.s4.hetznerStorageLabel')}</strong>{t('privacy.s4.hetznerStorageText')}</li>
                <li><strong>{t('privacy.s4.osmLabel')}</strong>{t('privacy.s4.osmText')}</li>
                <li><strong>{t('privacy.s4.nominatimLabel')}</strong>{t('privacy.s4.nominatimText')}</li>
              </ul>
            </li>
          </ul>

          <h2>{t('privacy.s5.title')}</h2>
          <ul>
            <li>{t('privacy.s5.euPre')}<strong>{t('privacy.s5.euBold')}</strong>{t('privacy.s5.euPost')}</li>
            <li>{t('privacy.s5.item2')}</li>
            <li>{t('privacy.s5.item3')}</li>
            <li>{t('privacy.s5.item4')}</li>
            <li>{t('privacy.s5.item5')}</li>
            <li>{t('privacy.s5.item6')}</li>
            <li>{t('privacy.s5.item7')}</li>
            <li>{t('privacy.s5.item8')}</li>
            <li>{t('privacy.s5.item9')}</li>
          </ul>

          <h2>{t('privacy.s6.title')}</h2>
          <ul>
            <li>{t('privacy.s6.item1')}</li>
            <li>{t('privacy.s6.item2')}</li>
            <li>{t('privacy.s6.item3')}</li>
            <li>{t('privacy.s6.item4')}</li>
            <li>{t('privacy.s6.item5')}</li>
          </ul>

          <h2>{t('privacy.s7.title')}</h2>
          <p>{t('privacy.s7.intro')}</p>
          <ul>
            <li><strong>{t('privacy.s7.accessLabel')}</strong>{t('privacy.s7.accessText')}</li>
            <li><strong>{t('privacy.s7.rectificationLabel')}</strong>{t('privacy.s7.rectificationText')}</li>
            <li><strong>{t('privacy.s7.erasureLabel')}</strong>{t('privacy.s7.erasureText')}</li>
            <li><strong>{t('privacy.s7.portabilityLabel')}</strong>{t('privacy.s7.portabilityText')}</li>
            <li><strong>{t('privacy.s7.objectLabel')}</strong>{t('privacy.s7.objectText')}</li>
            <li><strong>{t('privacy.s7.restrictLabel')}</strong>{t('privacy.s7.restrictText')}</li>
            <li><strong>{t('privacy.s7.withdrawLabel')}</strong>{t('privacy.s7.withdrawText')}</li>
            <li><strong>{t('privacy.s7.complaintLabel')}</strong>{t('privacy.s7.complaintText')}</li>
          </ul>
          <p>{t('privacy.s7.contactPre')}<a href="mailto:privacy@hbcfield.com">privacy@hbcfield.com</a>{t('privacy.s7.contactPost')}</p>

          <h2>{t('privacy.s8.title')}</h2>
          <p>{t('privacy.s8.intro')}</p>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 not-prose my-6">
            <h4 className="font-semibold text-blue-900 mb-3">{t('privacy.s8.gpsActiveTitle')}</h4>
            <ul className="space-y-2 text-blue-800 text-base">
              <li className="flex gap-2"><span className="font-semibold text-blue-600">{t('privacy.s8.drivingLabel')}</span> {t('privacy.s8.drivingText')}</li>
              <li className="flex gap-2"><span className="font-semibold text-blue-600">{t('privacy.s8.clockLabel')}</span> {t('privacy.s8.clockText')}</li>
              <li className="flex gap-2"><span className="font-semibold text-blue-600">{t('privacy.s8.arrivingLabel')}</span> {t('privacy.s8.arrivingText')}</li>
            </ul>
            <h4 className="font-semibold text-blue-900 mt-4 mb-3">{t('privacy.s8.gpsInactiveTitle')}</h4>
            <ul className="space-y-2 text-blue-800 text-base">
              <li>{t('privacy.s8.inactive1')}</li>
              <li>{t('privacy.s8.inactive2')}</li>
              <li>{t('privacy.s8.inactive3')}</li>
            </ul>
          </div>

          <p>{t('privacy.s8.safeguardsIntro')}</p>
          <ul>
            <li>{t('privacy.s8.safeguard1')}</li>
            <li>{t('privacy.s8.safeguard2')}</li>
            <li>{t('privacy.s8.safeguard3')}</li>
            <li>{t('privacy.s8.safeguard4')}</li>
          </ul>

          <h2>{t('privacy.s9.title')}</h2>
          <p>{t('privacy.s9.intro')}</p>
          <ul>
            <li>{t('privacy.s9.item1')}</li>
            <li>{t('privacy.s9.item2')}</li>
            <li>{t('privacy.s9.item3')}</li>
            <li>{t('privacy.s9.item4')}</li>
            <li>{t('privacy.s9.item5')}</li>
          </ul>
          <p>{t('privacy.s9.disable')}</p>

          <h2>{t('privacy.s10.title')}</h2>
          <p>{t('privacy.s10.body')}</p>

          <h2>{t('privacy.s11.title')}</h2>
          <p>{t('privacy.s11.body')}</p>

          <h2>{t('privacy.s12.title')}</h2>
          <p>{t('privacy.s12.body')}</p>

          <h2>{t('privacy.s13.title')}</h2>
          <div className="bg-muted border border-border rounded-xl p-6 not-prose my-6">
            <p className="font-semibold text-foreground mb-2">{t('privacy.s13.company')}</p>
            <ul className="space-y-1 text-muted-foreground text-base">
              <li>{t('privacy.s13.emailLabel')}<a href="mailto:privacy@hbcfield.com" className="text-blue-600 hover:underline">privacy@hbcfield.com</a></li>
              <li>{t('privacy.s13.websiteLabel')}<a href="https://hbcfield.com" className="text-blue-600 hover:underline">https://hbcfield.com</a></li>
              <li>{t('privacy.s13.supportLabel')}<a href="mailto:support@hbcfield.com" className="text-blue-600 hover:underline">support@hbcfield.com</a></li>
            </ul>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12">
        <div className="max-w-3xl mx-auto px-6 py-8 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} {t('privacy.footerRights')}
        </div>
      </footer>
    </div>
  )
}
