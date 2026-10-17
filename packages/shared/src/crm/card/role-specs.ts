/** The scoring table: how each role scores a line. */
import { foldText } from '../../utils/fold';
import type { Ctx, LineFacts } from './facts';
import { SEPARATOR_GLYPHS } from './patterns-contact';
import type { CardRole } from './types';

// ── The scoring table ───────────────────────────────────────────────────────

/**
 * One table, one shape per role — not a branch per field.
 *
 * `min` is the floor below which a role is left EMPTY. An empty field the
 * person fills in beats a confident wrong one they have to notice first.
 * `proven` marks the roles a pattern can actually demonstrate; everything else
 * comes back `likely` and the screen badges it CHECK.
 */
interface RoleSpec {
  min: number;
  proven: boolean;
  score(f: LineFacts, c: Ctx): number;
  /** What goes in the field, and any other lines this claim consumes. */
  claim(f: LineFacts, c: Ctx, all: LineFacts[]): { value: string; also: number[] };
}

const plain = (f: LineFacts) => ({ value: f.text, also: [] as number[] });

const cap = (n: number) => Math.max(0, Math.min(0.99, n));

const ROLES: Record<CardRole, RoleSpec> = {
  email: {
    min: 0.1, proven: true,
    score: (f) => (f.email ? 0.98 : 0),
    claim: (f) => ({ value: f.email!.toLowerCase(), also: [] }),
  },

  vat: {
    min: 0.1, proven: true,
    score: (f) => (f.vat && !f.email ? 0.95 : 0),
    claim: (f) => ({ value: f.vat!, also: [] }),
  },

  website: {
    min: 0.1, proven: true,
    /*
      An email contains a hostname too; it is not the card's web address — and
      the `!f.email` guard catches that while the `@` survives the scan.

      ⚠️ IT DOES NOT SURVIVE RELIABLY. On a real read of the Gmunden card the
      recogniser returned

          jasmin.waltheragmunden.ooe.gv.at

      for `jasmin.walther@gmunden.ooe.gv.at` — the `@` came back as an `a`. With
      no `@` there is no email to guard against, and what is left is shaped
      exactly like a domain, so it won the website role outright. The member saw
      their correspondent's address filed as the company's website, and "nothing
      read" where the email should be.

      A person's name inside a hostname is the giveaway. A company's web address
      is the company's name; `walther.something` on a card belonging to Walther
      is the local part of their email with its `@` lost. Scored down rather than
      refused, so it still wins when the card offers nothing better — a mangled
      address is a poor website but it is not nothing.
    */
    score: (f, c) => {
      if (!f.website || f.email) return 0;
      return looksLikeMangledEmail(f.website, c) ? 0.2 : 0.95;
    },
    claim: (f) => ({ value: f.website!, also: [] }),
  },

  phone: {
    min: 0.1, proven: true,
    score: (f) => {
      if (!f.phone || f.email || f.vat || f.website) return 0;
      /*
        ⚠️ A card carries two or three numbers and the LABEL decides, not the
        order they happen to be printed in. A fax is the one number nobody
        wants dialled; a mobile is usually the one they do.

        A fact holding nothing BUT a fax has no dialable number and scores 0 —
        while `f.phone` stays set, so the line is still ruled out of being read
        as somebody's name. Those are two different questions and they used to
        share one answer.
      */
      if (!f.dial) return 0;
      /*
        ⚠️ The gap between the two labels is deliberately wider than
        `CONTESTED_MARGIN`, and the gap between two UNLABELLED numbers is zero.
        An explicit "M" settles the question; two bare numbers do not, and the
        screen is told so rather than being handed a coin-flip as a fact.
      */
      return cap(0.72 + (f.dial.kind === 'mobile' ? 0.2 : 0) + (f.dial.kind === 'landline' ? 0.06 : 0));
    },
    claim: (f) => ({ value: f.dial!.value, also: [] }),
  },

  company: {
    min: 0.25, proven: false,
    score: (f, c) => {
      // A web address is never the company's NAME, even when the reader could
      // not capture it cleanly enough to fill the website field.
      if (f.email || f.phone || f.website || f.vat || f.urlish) return 0;
      /*
        ⚠️ A job title rules a line out UNLESS it also carries a legal form.
        "Steuerberater Huber GmbH" is a firm whose trade is in its name, and a
        flat "roles are never companies" left it with no company at all.
      */
      if (f.role && !f.legalForm) return 0;
      /*
        ⚠️ And so does a DEPARTMENT, on the same reasoning and for the same
        exception. "Liegenschaftsverwaltung" is what this person does at the
        Stadtamt, not a client to invoice — but "Hausverwaltung Meier GmbH" is a
        firm whose trade is in its name, which is why `department` is already
        false wherever a legal form, the email's domain or an authority word
        says the line names a body rather than a part of one.
      */
      if (f.department) return 0;
      if (f.addressSignal > 0) return 0;
      let s = 0;
      if (f.domainMatch) s += 0.55;
      if (f.legalForm) s += 0.4;
      // A public body has no legal form to print and its name is often the only
      // thing on the card that is not a person or a number.
      if (f.authority) s += 0.3;
      // On a company's card the wordmark is the largest thing there is; on a
      // person's it is their name, and size says nothing about the firm.
      s += f.relSize * (c.kind === 'COMPANY' ? 0.35 : 0.08);
      if (f.wordmark && !f.personShape) s += 0.08;
      /*
        ⚠️ Without this, a card whose domain is the person's own surname
        ("nikiforova.at") offers the PERSON as the company — which is what the
        old email-domain rule did, silently, on a real scan.
      */
      if (f.personShape && !f.legalForm && c.kind === 'PERSON') s -= 0.45;
      return cap(s);
    },
    claim: plain,
  },

  name: {
    min: 0.2, proven: false,
    score: (f, c) => {
      /*
        Hard exclusions, and they are hard for a reason: these are not weak
        evidence against a name, they are proof it is something else.

        ⚠️ `urlish` is checked here and NOT derived from whether the website
        field was filled. That coupling WAS the bug — a website the capture
        pattern missed became a person's name, because nothing else had marked
        the line spoken for.
      */
      if (f.email || f.phone || f.vat || f.website) return 0;
      if (f.urlish || f.hasDigits || f.legalForm || f.role || f.department) return 0;
      if (f.addressSignal > 0) return 0;
      if (f.words > 4 || f.text.length < 4) return 0;

      let s = f.relSize * (c.kind === 'PERSON' ? 0.45 : 0.15);
      if (f.personShape) s += 0.3;
      // The mailbox naming the line is the closest thing to proof a free
      // parser gets: "a.gruber@" beside "Anna Gruber".
      if (f.localMatch) s += 0.3;
      // A name sits at the top of the column it is in, not at the bottom.
      if (f.rowInColumn <= 1) s += 0.08;
      return cap(s);
    },
    claim: plain,
  },

  title: {
    min: 0.5, proven: false,
    score: (f, c) => {
      /*
        ⚠️ A DEPARTMENT is a job title in everything but grammar, and it is the
        answer the product actually wants: it becomes `CustomerContact.role`,
        which is the one place "what does this person do at that firm" can be
        stored. Scored a shade under a real job title, because "Leiter" says
        what somebody DOES and "Liegenschaftsverwaltung" says where they sit.
      */
      if (!f.role && !f.department) return 0;
      if (f.email || f.phone || f.website || f.vat || f.legalForm || f.urlish) return 0;
      let s = f.role ? 0.6 : 0.55;
      // The title sits WITH the name — same column, a line or two away.
      const hint = c.nameHint >= 0 ? c.nameHint : f.i;
      if (Math.abs(f.i - hint) <= 2) s += 0.25;
      return cap(s);
    },
    claim: plain,
  },

  address: {
    min: 0.3, proven: false,
    score: (f) => {
      if (f.email || f.phone || f.website || f.vat) return 0;
      return cap(f.addressSignal);
    },
    /*
      An address is a BLOCK, not a line. Start from the strongest line and grow
      outwards while the neighbours still carry an address signal, in whatever
      order the card printed them — street then postcode, postcode then street,
      or all of it on one line.
    */
    claim: (f, _c, all) => {
      /*
        ⚠️ A SUPPRESSED fact occupies no space here — it is step over, not stop.
        "Rathausplatz 1 ~ 4810 Gmunden" leaves three facts in the array (the
        whole line and its two halves), and the whole line sits between the
        address and whatever is above it. Stopping at it would cut the block to
        one segment; INCLUDING it would print the street twice.
      */
      const reach = (from: number, step: -1 | 1) => {
        let edge = from;
        for (let k = from + step; k >= 0 && k < all.length; k += step) {
          const n = all[k]!;
          if (n.suppressed) continue;
          if (n.addressSignal <= 0 || !sameColumn(n, f)) break;
          edge = k;
        }
        return edge;
      };
      const first = reach(f.i, -1);
      const last = reach(f.i, 1);
      const also: number[] = [];
      const parts: string[] = [];
      for (let k = first; k <= last; k++) {
        if (all[k]!.suppressed) continue;
        parts.push(all[k]!.text);
        if (k !== f.i) also.push(k);
      }
      return { value: tidyAddress(parts.join(', ')), also };
    },
  },
};

/**
 * A separator the recogniser glued to the word before it.
 *
 * The Gmunden card prints `Rathausplatz 1 ~ 4810 Gmunden`; the device returned
 * `Rathausplatz 1_ 4810 Gmunden` — the tilde read as an underscore AND its
 * leading space lost. With no space in front it is rightly not a separator, so
 * the line is not cut and the address is correct — but the glyph is left
 * sitting in the value, and an address is the one field a member reads back
 * character by character when they are standing outside the building.
 *
 * ⚠️ Only where a space FOLLOWS. `Rathausplatz 1_4810` might be a house number
 * a building really uses, and `A-1010` must survive untouched.
 *
 * Address only. The same glyph inside a company name is part of the name, and
 * the point of the whitespace rule everywhere else is that we do not guess.
 */
const GLUED_SEPARATOR = new RegExp('([^\\s])[' + SEPARATOR_GLYPHS + '](\\s)', 'g');

const tidyAddress = (value: string) => value.replace(GLUED_SEPARATOR, '$1,$2').replace(/,\s*,/g, ',');

const sameColumn = (a: LineFacts, b: LineFacts) => a.column === b.column;

const ROLE_ORDER = Object.keys(ROLES) as CardRole[];

/**
 * Is this "website" a person's email address with its `@` lost?
 *
 * A company's web address is the company's name. A hostname carrying the
 * cardholder's OWN name is the local part of their email, run into the domain
 * by a recogniser that read the `@` as a letter — `jasmin.walther@gmunden…`
 * coming back as `jasmin.waltheragmunden…`.
 *
 * ⚠️ Compared against the name's WORDS, each at least four letters. Shorter and
 * common surnames collide with ordinary domains, and "Ho" or "Li" appears
 * inside half the hostnames on earth.
 */
function looksLikeMangledEmail(website: string, ctx: Ctx): boolean {
  if (!ctx.nameText) return false;
  const host = website.toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '');
  return foldText(ctx.nameText)
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 4)
    .some((w) => host.includes(w));
}

export { ROLES, ROLE_ORDER };
