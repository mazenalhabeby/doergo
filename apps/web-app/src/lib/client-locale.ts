/**
 * "Language for emails" on a client record — the form's side of it.
 *
 * The rules live in @hbcfield/shared (`crm/client-locale.ts`) because the phone's
 * client form holds the same field: the choices are the languages the SERVER
 * accepts, each named in itself; "" is "same as the organization" and is saved
 * as null, resolved at send time and never guessed into the record.
 */
export {
  CLIENT_LOCALE_OPTIONS,
  clientLocaleFormValue,
  clientLocaleName,
  clientLocalePayload,
} from "@hbcfield/shared/client"
