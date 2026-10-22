import type { KeyboardTypeOptions } from 'react-native';
import type { CardDestination, CardFieldKey, CardValues } from '../customer/card-review';

/**
 * The label and the keyboard for each field.
 *
 * `name` is the one that moves: on a company's card it is the CONTACT PERSON,
 * on a person's card it is the client. Everything else means the same thing
 * whichever way the card is read.
 */
export const FIELD_LABEL: Record<CardFieldKey, string> = {
  company: 'scan.fCompany',
  name: 'customers.fName',
  title: 'scan.jobTitle',
  email: 'customers.fEmail',
  phone: 'customers.fPhone',
  website: 'customers.form.website',
  address: 'scan.fAddress',
  vat: 'customers.form.vatId',
};

export const FIELD_INPUT: Partial<
  Record<
    CardFieldKey,
    { keyboardType?: KeyboardTypeOptions; autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters' }
  >
> = {
  company: { autoCapitalize: 'words' },
  name: { autoCapitalize: 'words' },
  email: { keyboardType: 'email-address', autoCapitalize: 'none' },
  phone: { keyboardType: 'phone-pad' },
  website: { keyboardType: 'url', autoCapitalize: 'none' },
  // A VAT number is printed in capitals and read back in capitals: "atu123" is
  // the same number and the wrong thing to have on a record.
  vat: { autoCapitalize: 'characters' },
};

/** What the button says it will do. Three destinations, three different saves. */
export const SAVE_LABEL: Record<CardDestination, string> = {
  client: 'customers.save',
  contact: 'scan.saveContact',
  newCompany: 'scan.saveNewCompany',
};

/**
 * WHY Save is grey — one sentence naming the field that is still empty.
 *
 * ⚠️ "Create this company" has TWO requirements (the firm and the person), so a
 * single message would be wrong half the time. A disabled button that explains
 * the wrong thing is worse than one that explains nothing: the member fixes the
 * field it named, nothing changes, and the screen looks broken.
 */
export function reasonSaveIsGrey(destination: CardDestination, hasCompany: boolean, values: CardValues): string {
  if (destination === 'contact' && !hasCompany) return 'scan.needCompany';
  if (destination === 'newCompany' && !values.company.trim()) return 'scan.needCompanyName';
  return 'scan.needName';
}
