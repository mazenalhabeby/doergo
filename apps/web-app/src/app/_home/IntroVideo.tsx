'use client';

/**
 * Intro video player — poster + play button, click-to-play with sound.
 * Self-hosted (compressed /intro.mp4) for a clean, native, tracker-free look
 * that matches the dark hero. Native controls appear once playing.
 */

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';

export function IntroVideo() {
  const { t } = useTranslation();
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const play = () => {
    const v = ref.current;
    if (!v) return;
    v.play();
    setPlaying(true);
  };

  return (
    <div className="group relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-black">
      <video
        ref={ref}
        className="h-full w-full object-cover"
        src="/intro.mp4"
        poster="/intro-poster.jpg"
        playsInline
        preload="metadata"
        controls={playing}
        onEnded={() => setPlaying(false)}
        onPause={() => { /* keep controls; native pause is fine */ }}
      />

      {!playing && (
        <button
          type="button"
          onClick={play}
          aria-label={t('home.video.play')}
          className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors hover:bg-black/10"
        >
          {/* soft dark scrim so the button reads on any frame */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(60% 60% at 50% 50%, rgba(0,0,0,0.35), rgba(0,0,0,0.15) 60%, transparent)' }}
          />
          <span className="relative flex h-20 w-20 items-center justify-center rounded-full border border-white/30 bg-white/10 backdrop-blur-sm transition-all duration-300 group-hover:scale-105 group-hover:border-white/60 group-hover:bg-white/20">
            <Play className="ml-1 h-7 w-7 fill-white text-white" />
          </span>
        </button>
      )}
    </div>
  );
}
