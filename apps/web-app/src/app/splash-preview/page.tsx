'use client';

/**
 * Web reproduction of the mobile launch splash — pure CSS keyframes.
 *
 * CSS animation (not framer-motion) so it renders smoothly AND can be captured
 * deterministically frame-by-frame (timecut) for a butter-smooth video export.
 * The whole choreography lives on one 5.2s loop so every element stays in sync.
 * Visit /splash-preview.
 */

const ICON = 130;

function ArrowIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48">
      <defs>
        <linearGradient id="sp-at" x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#059669" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
        <linearGradient id="sp-ab" x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#60a5fa" />
        </linearGradient>
        <linearGradient id="sp-ac" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#047857" />
          <stop offset="100%" stopColor="#1e40af" />
        </linearGradient>
      </defs>
      <g transform="translate(24,24)">
        <polygon points="18,-2 -10,-20 -2,-2" fill="url(#sp-at)" />
        <polygon points="18,2 -10,20 -2,2" fill="url(#sp-ab)" />
        <polygon points="-2,-2 18,0 -2,2 -16,0" fill="url(#sp-ac)" opacity={0.8} />
        <polygon points="-10,-20 -16,0 -2,-2" fill="#047857" opacity={0.45} />
        <polygon points="-10,20 -16,0 -2,2" fill="#1e3a8a" opacity={0.25} />
      </g>
    </svg>
  );
}

const CSS = `
.stage{position:fixed;inset:0;overflow:hidden;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(135deg,#09090b 0%,#0c1524 50%,#09090b 100%)}

.orb{position:absolute;border-radius:999px;animation:breathe 8s ease-in-out infinite}
.orb1{top:8%;right:-80px;width:260px;height:260px;background:radial-gradient(circle,rgba(5,150,105,.35),transparent 70%)}
.orb2{bottom:12%;left:-100px;width:300px;height:300px;background:radial-gradient(circle,rgba(59,130,246,.25),transparent 70%);animation-delay:-4s}
@keyframes breathe{0%,100%{opacity:.28}50%{opacity:.45}}

/* Whole logo group: hold, then push-in + fade on exit; loops every 5.2s */
.cycle{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;
  animation:cycleExit 5.2s ease-in infinite}
@keyframes cycleExit{
  0%{opacity:1;transform:scale(1)}
  73%{opacity:1;transform:scale(1)}
  88%{opacity:0;transform:scale(1.15)}
  100%{opacity:0;transform:scale(1.15)}
}

.iconArea{position:relative;width:${ICON}px;height:${ICON}px;display:flex;align-items:center;justify-content:center;margin-bottom:8px}

.glow{position:absolute;width:${ICON * 1.8}px;height:${ICON * 1.8}px;border-radius:50%;
  background:radial-gradient(circle,rgba(5,150,105,.6) 0%,rgba(59,130,246,.25) 45%,transparent 70%);
  animation:glowIn 5.2s ease-out infinite}
@keyframes glowIn{
  0%,3.8%{opacity:0;transform:scale(.5)}
  15.4%{opacity:.5;transform:scale(1)}
  73%{opacity:.5;transform:scale(1)}
  76%{opacity:.9;transform:scale(1.05)}
  86%{opacity:0}100%{opacity:0}
}

.arrow{position:relative;animation:arrowIn 5.2s infinite}
@keyframes arrowIn{
  0%,15.4%{opacity:0;transform:scale(0) rotate(-120deg);animation-timing-function:cubic-bezier(.34,1.56,.64,1)}
  32%{opacity:1;transform:scale(1) rotate(0deg)}
  100%{opacity:1;transform:scale(1) rotate(0deg)}
}

.ripple{position:absolute;width:${ICON}px;height:${ICON}px;border-radius:50%;border:1.5px solid;
  animation:ripple 2.4s ease-out infinite both}
@keyframes ripple{0%{opacity:.55;transform:scale(.6)}30%{opacity:.3}100%{opacity:0;transform:scale(2.7)}}
.r1{border-color:rgba(5,150,105,.35);animation-delay:.9s}
.r2{border-color:rgba(16,185,129,.20);animation-delay:1.7s}
.r3{border-color:rgba(59,130,246,.15);animation-delay:2.5s}

.orbit{position:absolute;width:160px;height:160px;animation:spin 3s linear infinite,orbFade 5.2s ease infinite}
.orbit.o2{animation-delay:-1s,0s}
.orbit.o3{animation-delay:-2s,0s}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes orbFade{0%,21%{opacity:0}25%{opacity:1}73%{opacity:1}82%{opacity:0}100%{opacity:0}}
.dot{position:absolute;top:-4px;left:calc(50% - 4px);width:7px;height:7px;border-radius:50%;background:#10b981;box-shadow:0 0 12px #10b981}
.o2 .dot{background:#3b82f6;box-shadow:0 0 12px #3b82f6}
.o3 .dot{background:#059669;box-shadow:0 0 12px #059669}

.wordWrap{position:relative;overflow:hidden;padding:0 4px;margin-top:20px;animation:wordIn 5.2s ease-out infinite}
@keyframes wordIn{0%,34.6%{opacity:0;transform:translateX(-30px)}42%{opacity:1;transform:translateX(0)}100%{opacity:1;transform:translateX(0)}}
.word{font-family:Outfit,system-ui,-apple-system,sans-serif;font-weight:800;font-size:38px;line-height:1;color:#fafafa;letter-spacing:1px}
.shimmer{position:absolute;top:0;bottom:0;width:60px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent);animation:shimmer 5.2s ease-in-out infinite}
@keyframes shimmer{0%,42.3%{opacity:0;transform:translateX(-160px)}50%{opacity:.7;transform:translateX(0)}53.8%{opacity:0;transform:translateX(160px)}100%{opacity:0;transform:translateX(160px)}}

.tagline{position:absolute;bottom:15%;font-family:system-ui,-apple-system,sans-serif;font-weight:500;font-size:11px;letter-spacing:4px;color:rgba(161,161,170,.7);animation:tagIn 5.2s ease infinite}
@keyframes tagIn{0%,55.8%{opacity:0;transform:translateY(15px)}62.5%{opacity:1;transform:translateY(0)}73%{opacity:1}86%{opacity:0}100%{opacity:0}}
`;

export default function SplashPreviewPage() {
  return (
    <div className="stage">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="orb orb1" />
      <div className="orb orb2" />

      <div className="cycle">
        <div className="iconArea">
          <div className="glow" />
          <div className="ripple r1" />
          <div className="ripple r2" />
          <div className="ripple r3" />
          <div className="orbit o1"><span className="dot" /></div>
          <div className="orbit o2"><span className="dot" /></div>
          <div className="orbit o3"><span className="dot" /></div>
          <div className="arrow"><ArrowIcon size={ICON} /></div>
        </div>

        <div className="wordWrap">
          <span className="word">HBC FIELD</span>
          <div className="shimmer" />
        </div>
      </div>

      <div className="tagline">DISPATCH&nbsp;&nbsp;·&nbsp;&nbsp;TRACK&nbsp;&nbsp;·&nbsp;&nbsp;DELIVER</div>
    </div>
  );
}
