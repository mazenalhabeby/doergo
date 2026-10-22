/**
 * WHAT A SCANNED CARD MEANS, decided once and away from the screen.
 *
 * The reader (`crm/business-card.ts` in shared) hands back fields. Everything
 * after that — is this a company's card or a person's, which fields will
 * actually be SAVED, and which were read and have nowhere to go — is product
 * judgement, and it is here so it can be argued with and tested without a
 * camera.
 *
 * ⚠️ THE RULE THIS FILE EXISTS TO ENFORCE: a field is offered for correction
 * ONLY if saving it will keep it. The screen this replaced asked somebody to
 * check a job title and then dropped it on the floor, and it put a WEBSITE in
 * the contact-person box because the reader's `website` had no row of its own.
 * Asking for a correction and discarding it is worse than not asking — so what
 * cannot be kept is named out loud (`homelessFields`) instead of being quietly
 * binned.
 */
export {
  CARD_FIELDS,
  type CardFieldKey,
  type CardKind,
  type CardDestination,
  type CardValues,
  type CardCertainty,
  guessCardKind,
  cardValues,
  cardCertainty,
  fieldNeedsLook,
  cardFieldsFor,
  homelessFields,
  looksLikeSameClient,
} from './card-review/kind';
export {
  duplicateSearchTerm,
  cardClientExtras,
  type CardExtraRow,
  cardAlternatives,
  cardHolding,
  cardContested,
  readCard,
} from './card-review/read';
export { cardExtrasKept, cardDetails, reRankGuesses, cardContactInput, cardClientNames } from './card-review/rank';
