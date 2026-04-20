"""
Clean Samsung 1080x2340 screenshots for app-store submission.

Pipeline per input file:
  1. Replace the top status bar (real time, roaming, weird battery, etc.) with
     a clean fake status bar: time "9:41", full wifi, full battery.
  2. Crop the bottom Android 3-button navigation bar.
  3. Letterbox into store-ready sizes with matching dark background.

Folder convention:
    raw/
      en/*.png   → english captures
      de/*.png   → german captures
    google-play/{en,de}/  → 1080 x 1920
    ios-6.7/{en,de}/      → 1290 x 2796
    ios-6.5/{en,de}/      → 1242 x 2688

Special case:
    If a locale is missing `01-splash.png` but another locale has it, the
    script copies the cleaned splash across locales (splash is language-
    neutral — no need to retake).

Run from the repo root:
    python3 store-listing/screenshots/clean-screenshots.py
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

# ---- paths ----
HERE = Path(__file__).parent
RAW_ROOT = HERE / "raw"
OUT_ROOTS = {
    "google-play": (HERE / "google-play", (1080, 1920)),
    "ios-6.7": (HERE / "ios-6.7", (1290, 2796)),
    "ios-6.5": (HERE / "ios-6.5", (1242, 2688)),
}

LOCALES = ("en", "de")

# ---- crop / chrome constants for 1080x2340 Samsung One UI ----
SRC_W, SRC_H = 1080, 2340
STATUS_BAR_H = 96
ANDROID_NAV_H = 140
CLEAN_H = SRC_H - ANDROID_NAV_H   # 2200

FONT_BOLD_PATH = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"


def sample_top_color(img):
    """Sample the dark theme color near the top so the fake status bar blends."""
    px = [img.getpixel((x, STATUS_BAR_H + 5)) for x in (40, 540, 1040)]
    return tuple(sum(c) // len(px) for c in zip(*px))


def draw_fake_status_bar(img):
    """Cover the top STATUS_BAR_H pixels with a clean status bar."""
    bg = sample_top_color(img)
    draw = ImageDraw.Draw(img)
    draw.rectangle([(0, 0), (SRC_W, STATUS_BAR_H)], fill=bg)

    try:
        font_time = ImageFont.truetype(FONT_BOLD_PATH, 38)
    except OSError:
        font_time = ImageFont.load_default()
    draw.text((42, 28), "9:41", fill=(255, 255, 255), font=font_time)

    white = (255, 255, 255)
    right_x = SRC_W - 42

    # battery
    bw, bh = 60, 28
    bx2, by1 = right_x, (STATUS_BAR_H - bh) // 2
    bx1, by2 = bx2 - bw, by1 + bh
    draw.rounded_rectangle([(bx1, by1), (bx2, by2)], radius=6, outline=white, width=2)
    cap_w, cap_h = 4, 12
    draw.rectangle([(bx2 + 1, by1 + (bh - cap_h) // 2),
                    (bx2 + 1 + cap_w, by1 + (bh - cap_h) // 2 + cap_h)], fill=white)
    pad = 4
    draw.rounded_rectangle([(bx1 + pad, by1 + pad), (bx2 - pad, by2 - pad)],
                           radius=2, fill=white)

    # wifi
    wifi_x = bx1 - 24
    wifi_size = 32
    cx, cy = wifi_x - wifi_size // 2, STATUS_BAR_H // 2 + 6
    draw.ellipse((cx - 4, cy - 4, cx + 4, cy + 4), fill=white)
    for r, w in ((14, 3), (24, 3)):
        draw.arc([cx - r, cy - r, cx + r, cy + r],
                 start=215, end=325, fill=white, width=w)

    # cellular
    sig_x_right = wifi_x - wifi_size - 18
    bar_w, gap, bar_max_h = 6, 4, 30
    sig_y_bottom = STATUS_BAR_H // 2 + 16
    for i in range(4):
        h = int(bar_max_h * (i + 1) / 4)
        x2 = sig_x_right - i * (bar_w + gap)
        x1 = x2 - bar_w
        y1 = sig_y_bottom - h
        draw.rounded_rectangle([(x1, y1), (x2, sig_y_bottom)], radius=1, fill=white)

    return img


def clean(img: Image.Image) -> Image.Image:
    """Apply status-bar replacement + bottom nav crop."""
    img = img.convert("RGB").copy()
    img = draw_fake_status_bar(img)
    img = img.crop((0, 0, SRC_W, CLEAN_H))
    return img


def fit_with_pad(img: Image.Image, target_size, bg=(0, 0, 0)) -> Image.Image:
    """Scale img to fit inside target preserving aspect; pad with bg."""
    tw, th = target_size
    iw, ih = img.size
    scale = min(tw / iw, th / ih)
    new_w, new_h = int(round(iw * scale)), int(round(ih * scale))
    resized = img.resize((new_w, new_h), Image.LANCZOS)
    canvas = Image.new("RGB", target_size, bg)
    canvas.paste(resized, ((tw - new_w) // 2, (th - new_h) // 2))
    return canvas


def process_one(src: Path, out_locale_dirs, size_map):
    print(f"Processing {src.relative_to(HERE)}...")
    img = Image.open(src)
    cleaned = clean(img)
    bg_sample = cleaned.getpixel((20, CLEAN_H - 20))

    for store, (out_root, size) in size_map.items():
        out_dir = out_root / out_locale_dirs
        out_dir.mkdir(parents=True, exist_ok=True)
        fitted = fit_with_pad(cleaned, size, bg=bg_sample)
        out_path = out_dir / src.name
        fitted.save(out_path, "PNG", optimize=True)
        print(f"  → {store}/{out_locale_dirs}/{src.name}  ({size[0]}x{size[1]})")


def process_all():
    # Gather which splash files exist per locale
    splash_name = "01-splash.png"
    locale_has_splash = {
        loc: (RAW_ROOT / loc / splash_name).exists() for loc in LOCALES
    }

    for locale in LOCALES:
        locale_dir = RAW_ROOT / locale
        if not locale_dir.exists():
            continue
        for src in sorted(locale_dir.glob("*.png")):
            process_one(src, locale, OUT_ROOTS)

    # Fill missing splashes by copying the cleaned output from whichever
    # locale has one.
    source_locale = next((l for l in LOCALES if locale_has_splash[l]), None)
    if source_locale:
        for store, (out_root, _) in OUT_ROOTS.items():
            src_path = out_root / source_locale / splash_name
            if not src_path.exists():
                continue
            for locale in LOCALES:
                if locale == source_locale:
                    continue
                if locale_has_splash[locale]:
                    continue
                dest_dir = out_root / locale
                dest_dir.mkdir(parents=True, exist_ok=True)
                dest = dest_dir / splash_name
                if not dest.exists():
                    # copy bytes from the already-cleaned source
                    Image.open(src_path).save(dest, "PNG", optimize=True)
                    print(f"  ↳ copied splash → {store}/{locale}/{splash_name}")


if __name__ == "__main__":
    process_all()
