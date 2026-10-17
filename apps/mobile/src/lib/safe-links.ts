import { Linking } from 'react-native';
import { telHref } from '@hbcfield/shared/client';

/**
 * Links built from DATA — the one place they are made safe to open.
 *
 * `Linking.openURL` opens whatever it is given in whatever app claims the
 * scheme. Phone numbers, e-mail addresses and addresses here are typed by
 * people (a CRM record, a client's contact), and file links come from server
 * answers; none of them is ours to trust as a URL. Before this, a phone number
 * of `123;https://…`, an e-mail of `a@b.c?body=…&cc=…`, or a file "link" of
 * `intent://…` / `file://…` was handed straight to the OS.
 *
 * Each builder returns a URL of exactly ONE scheme, or null — and a screen
 * shows no button rather than a button that opens something else.
 */

const isDev = (): boolean => typeof __DEV__ !== 'undefined' && !!__DEV__;

/** A file or document link from the server: https only (plain http in development, for the local API). */
export function httpsUrl(url: string | null | undefined, allowHttp: boolean = isDev()): string | null {
  if (typeof url !== 'string') return null;
  const u = url.trim();
  if (/[\s\u0000-\u001f]/.test(u)) return null;
  const m = /^([a-z][a-z0-9+.-]*):\/\/[^/?#\s]+/i.exec(u);
  if (!m) return null;
  const scheme = m[1]!.toLowerCase();
  return scheme === 'https' || (allowHttp && scheme === 'http') ? u : null;
}

/** A website somebody typed ("hbc-group.eu", "http://…"): http(s) only, https assumed. */
export function webUrl(site: string | null | undefined): string | null {
  if (typeof site !== 'string' || !site.trim()) return null;
  const s = site.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^https?:\/\//i.test(s)) return null;
  return httpsUrl(/^https?:\/\//i.test(s) ? s : `https://${s}`, true);
}

/** `tel:` from a typed number: digits only, a leading + kept. Nothing to dial → null. */
export function telUrl(phone: string | null | undefined): string | null {
  if (typeof phone !== 'string') return null;
  const href = telHref(phone);
  return /\d{3,}/.test(href) ? href : null;
}

/*
  An address and nothing else: no `?`, `&` or `#` that would add a subject, a
  body or more recipients, no spaces or line breaks, no second `@`.
*/
const EMAIL =
  /^[A-Za-z0-9.!$%'*+/=^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function mailtoUrl(email: string | null | undefined): string | null {
  if (typeof email !== 'string') return null;
  const e = email.trim();
  return EMAIL.test(e) ? `mailto:${e}` : null;
}

/** A map search for a typed address: the text is a QUERY value, encoded, never part of the URL. */
export function geoUrl(address: string | null | undefined): string | null {
  if (typeof address !== 'string') return null;
  const text = address.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 300);
  return text ? `geo:0,0?q=${encodeURIComponent(text)}` : null;
}

/** Open a link a builder above produced. False when there was none, or nothing could open it. */
export async function openSafeUrl(url: string | null): Promise<boolean> {
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
