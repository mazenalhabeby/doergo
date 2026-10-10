import { useTranslation } from "react-i18next"

/** The labels for the Team menu's entries — which ones show is the route table's call. */
export function useTeamLabels(): Record<string, string> {
  const { t } = useTranslation()
  return {
    "/members": t("nav.sidebar.members"),
    "/invitations": t("nav.sidebar.invitations"),
    "/join-requests": t("nav.sidebar.joinRequests"),
    "/team": t("nav.sidebar.colleagues"),
  }
}
