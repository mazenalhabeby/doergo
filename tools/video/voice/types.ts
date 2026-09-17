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
