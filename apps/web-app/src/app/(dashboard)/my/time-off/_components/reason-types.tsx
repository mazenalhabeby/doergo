"use client"

import type React from "react"

/*
  Drawn here rather than taken from an icon set.

  A plane for vacation and a stethoscope for sickness are the literal reading,
  and they date a page instantly — every product used them a decade ago. These
  are four glyphs in one geometric language (a 24-grid, 1.75 stroke, round
  caps), each carrying its own hue, so the row reads as a considered set rather
  than four unrelated pictures. The colour does most of the work: after the
  first use, people pick by hue, not by squinting at a small drawing.
*/
function SunGlyph(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.75" strokeLinecap="round" {...p}>
      <circle cx="12" cy="11" r="4" />
      <path d="M12 3v1.5M12 17.5V19M4.2 11H5.7M18.3 11h1.5M6.5 5.5l1 1M16.5 5.5l-1 1" />
      <path d="M3 20.5c1.6 0 1.6-1.2 3.2-1.2s1.6 1.2 3.2 1.2 1.6-1.2 3.2-1.2 1.6 1.2 3.2 1.2 1.6-1.2 3.2-1.2" />
    </svg>
  )
}

function PulseGlyph(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 12h3.5l2-5 3 10 2.5-5H21" />
    </svg>
  )
}

function FamilyGlyph(p: React.SVGProps<SVGSVGElement>) {
  /*
    Two figures, not one.

    A single head-and-shoulders is the default avatar shape — it reads as "user
    account", which is what it means everywhere else in this app, and says
    nothing about why someone is away. Personal leave is overwhelmingly a family
    matter: childcare, an appointment, someone at home who needs you. A second,
    smaller figure names that, and is a shape nothing else here uses.
  */
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.75" strokeLinecap="round" {...p}>
      <circle cx="8.75" cy="7" r="2.75" />
      <path d="M4 19.5c0-2.9 2.1-4.75 4.75-4.75S13.5 16.6 13.5 19.5" />
      <circle cx="17" cy="10.5" r="2" />
      <path d="M13.9 19.5c0-2.05 1.4-3.4 3.1-3.4s3.1 1.35 3.1 3.4" />
    </svg>
  )
}

function DotsGlyph(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.75" strokeLinecap="round" {...p}>
      <circle cx="12" cy="12" r="8.5" strokeDasharray="3 3.2" />
      <path d="M8.5 12h.01M12 12h.01M15.5 12h.01" strokeWidth="2.4" />
    </svg>
  )
}

/*
  Monochrome on purpose.

  Giving each reason its own hue is the old tag-colour pattern: four saturated
  swatches competing on one small panel, none of which mean anything until you
  have learnt the legend. It also fights the rest of the page, where colour is
  reserved for STATE — amber for pending, green for approved, the accent for
  what is selected. Spending it on identity too leaves nothing to say "this one
  is chosen".

  So the cards are neutral and selection is the only thing that colours.
*/
export const REASON_TYPES = [
  { key: "vacation", glyph: SunGlyph },
  { key: "sickLeave", glyph: PulseGlyph },
  { key: "family", glyph: FamilyGlyph },
  { key: "other", glyph: DotsGlyph },
] as const

export type ReasonKey = (typeof REASON_TYPES)[number]["key"]
