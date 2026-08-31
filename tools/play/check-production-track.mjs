/**
 * What Google Play is actually serving on the production track.
 *
 * Asked of Play itself, not of the store listing page, which renders version
 * "varies with device" and would have to be scraped. The same service account
 * that uploads is used to read; reading a track needs no permission it was
 * denied, so this works even though releasing to production does not.
 *
 * Prints one line per release: status, rollout fraction, version codes. Exits 0
 * when versionCode 15 is serving at 100%, 1 otherwise — so it can drive a loop.
 */
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

const KEY = JSON.parse(readFileSync(process.env.KEY_PATH, 'utf8'));
const PKG = 'com.hbcfield.app';
const WANT = Number(process.env.WANT_VC || 15);

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

async function token() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64({ alg: 'RS256', typ: 'JWT' });
  const claim = b64({
    iss: KEY.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now,
  });
  const sig = createSign('RSA-SHA256').update(`${header}.${claim}`).sign(KEY.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claim}.${sig}`,
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`token: ${JSON.stringify(j)}`);
  return j.access_token;
}

const t = await token();
const H = { authorization: `Bearer ${t}`, 'content-type': 'application/json' };
const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`;

const edit = await (await fetch(`${base}/edits`, { method: 'POST', headers: H })).json();
if (!edit.id) throw new Error(`edit: ${JSON.stringify(edit)}`);

try {
  const track = await (await fetch(`${base}/edits/${edit.id}/tracks/production`, { headers: H })).json();
  const releases = track.releases || [];
  if (!releases.length) console.log('production: no releases');
  let live = false;
  for (const r of releases) {
    const pct = r.userFraction != null ? `${Math.round(r.userFraction * 100)}%` : '100%';
    console.log(`production: ${r.status} ${pct} versionCodes=${(r.versionCodes || []).join(',')}`);
    if ((r.versionCodes || []).map(Number).includes(WANT) && r.status === 'completed') live = true;
  }
  process.exit(live ? 0 : 1);
} finally {
  await fetch(`${base}/edits/${edit.id}`, { method: 'DELETE', headers: H }).catch(() => {});
}

/*
  Usage, from apps/mobile (where the key lives):

    KEY_PATH=./play-store-key.json node ../../tools/play/check-production-track.mjs

  Why this exists: MOBILE_LATEST_VERSION must never name a version the store
  cannot serve. Pointing it at a version Play does not have yet tells every app
  an update exists and sends people to a listing that still offers the old one —
  which is how a broken release stays invisible. This answers "what is Play
  actually serving" so that value can be set from fact rather than intent.

  Note it exits 0 only at a COMPLETED rollout. During a staged rollout Play
  serves the new build to the rollout fraction only, so everyone outside it
  still gets the old one, and the gate would be wrong for them.
*/
