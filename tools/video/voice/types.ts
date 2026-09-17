/**
 * The one interface every text-to-speech provider has to satisfy.
 *
 * WHY an adapter rather than calling `say` directly: the pipeline has to keep
 * costing nothing to run, but the voice is the part most likely to be upgraded
 * once a video is worth publishing. Keeping the seam here means swapping in
 * ElevenLabs is a new file and an env var, not a rewrite of assembly — and,
 * just as importantly, means no API key has to exist for the default path.
 */

export interface SynthesisRequest {
  /** The sentence to speak. Plain text; no SSML — not every provider has it. */
  text: string;
  /** Absolute path of the WAV file to write. */
  outPath: string;
  /*
    What is said either side of this beat.

    ⚠️ WITHOUT THESE, ONE SCRIPT SOUNDS LIKE TWO PEOPLE. Each beat is its own
    request, and a model given one sentence in isolation picks its own pitch,
    pace and energy for it — measured on a two-beat test, the clips came back
    6.4 LUFS apart, which reads to a listener as a different voice rather than
    a level change.

    A provider that understands continuity (ElevenLabs does) uses them to carry
    prosody across the join. One that does not simply ignores them, which is
    why they are optional rather than a second method.
  */
  previousText?: string;
  nextText?: string;
}

export interface SynthesisResult {
  path: string;
  /** Measured from the produced file, never estimated from the text. */
  durationSec: number;
}

export interface VoiceAdapter {
  /** Used in logs and in the render manifest, so a re-render is traceable. */
  readonly name: string;
  /**
   * True when the adapter can actually run here. `say` is macOS-only; a paid
   * provider needs a key. The registry reports this rather than throwing deep
   * inside a render that has already spent two minutes capturing.
   */
  isAvailable(): Promise<boolean>;
  synthesize(req: SynthesisRequest): Promise<SynthesisResult>;
}
