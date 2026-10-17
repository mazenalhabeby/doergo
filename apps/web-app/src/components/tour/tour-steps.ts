import type { TourDef, TourGateContext } from "./types"

/** Building a tour: one step, and a page's tour from its steps (moved here unchanged). */
/** Short helper to build a nav step (all target the top-bar `data-tour` anchors). */
export const step = (tourId: string, key: string, target: string) => ({
  target,
  titleKey: `tours.${tourId}.steps.${key}.title`,
  bodyKey: `tours.${tourId}.steps.${key}.body`,
})

/**
 * A one-step "what is this screen" page hint. Content lives under
 * `tours.pages.<i18nKey>.{title,body}`; the spotlight targets the page header.
 */
export const pageTour = (
  id: string,
  i18nKey: string,
  icon: string,
  route: string,
  target: string,
  gate?: (c: TourGateContext) => boolean,
): TourDef[] => [
  {
    id,
    titleKey: `tours.pages.${i18nKey}.title`,
    icon,
    autoRunOn: route,
    autoRunExact: true,
    gate,
    steps: [{ target, titleKey: `tours.pages.${i18nKey}.title`, bodyKey: `tours.pages.${i18nKey}.body` }],
  },
]
