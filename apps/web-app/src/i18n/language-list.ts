/**
 * Which languages the web app offers, and the key the choice is kept under — plain data, no
 * catalogue and no i18n instance. Both `./languages` (the door the UI uses) and `./index` (the
 * instance) read it, so neither has to import the other (the two used to form an import loop).
 */
import { LANGUAGE_CHOICES, SUPPORTED_LOCALES, isSupportedLocale, type SupportedLocale } from "@hbcfield/shared/client"

export const LANGUAGE_KEY = "hbcfield_language"

// The list itself is shared with the phone and the server (notifications/locale.ts
// in shared): a language offered here that the server refused would only fail on
// save. The shared module is plain data, so this file stays catalogue-free.
export const SUPPORTED = SUPPORTED_LOCALES
export type Supported = SupportedLocale

export function isSupported(lang: string): lang is Supported {
  return isSupportedLocale(lang)
}

export const supportedLanguages = LANGUAGE_CHOICES
