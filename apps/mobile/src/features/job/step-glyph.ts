import type React from 'react';
import { hasCapability, type FlowStatus } from '@hbcfield/shared/client';
import { AcceptGlyph, ArrivedGlyph, FinishGlyph, OnMyWayGlyph, StartWorkGlyph } from '../../components/glyphs';
import type { GlyphProps } from '../../components/glyphs/glyphs';
import { capsAt } from './job-logic';

/**
 * The mark on a step's button follows the TRANSITION, never the
 * organization's wording. Shared by the job page's dock and the Jobs tab's
 * Next up card, so one step wears one mark everywhere.
 */
export function glyphFor(key: string, steps: FlowStatus[], workflowName?: string | null): React.ComponentType<GlyphProps> {
  const step = steps.find((s) => s.key === key);
  if (step?.isFinal) return FinishGlyph;
  if (key === 'ACCEPTED') return AcceptGlyph;
  if (key === 'ARRIVED' || key === 'VISITED' || key === 'DELIVERED') return ArrivedGlyph;
  if (hasCapability(capsAt(key, steps, workflowName), 'gps')) return OnMyWayGlyph;
  return StartWorkGlyph;
}
