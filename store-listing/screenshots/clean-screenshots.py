"""
Clean Samsung 1080x2340 screenshots for app-store submission.

What it does:
  1. Replaces the top status bar (real time, roaming, weird battery, etc.) with a
     clean fake status bar: time "9:41", full wifi, full battery.
  2. Crops the bottom Android 3-button navigation bar.
  3. Outputs three sized variants for each store:
       - Google Play         (1080 x 1920, padded if needed)
       - App Store 6.7"      (1290 x 2796)
       - App Store 6.5"      (1242 x 2688)

Run from the repo root:
    python3 store-listing/screenshots/clean-screenshots.py
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

# ---- paths ----
HERE = Path(__file__).parent
RAW_DIR = HERE / "raw"
OUT_GP = HERE / "google-play"
OUT_67 = HERE / "ios-6.7"
OUT_65 = HERE / "ios-6.5"
for d in (OUT_GP, OUT_67, OUT_65):
    d.mkdir(parents=True, exist_ok=True)

# ---- crop / chrome constants for 1080x2340 Samsung One UI ----
SRC_W, SRC_H = 1080, 2340
STATUS_BAR_H = 96            # top strip we replace
ANDROID_NAV_H = 140          # bottom strip we crop
CLEAN_H = SRC_H - ANDROID_NAV_H   # 2200

# ---- store sizes ----
GP_SIZE = (1080, 1920)
IOS67_SIZE = (1290, 2796)
IOS65_SIZE = (1242, 2688)

FONT_PATH = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
FONT_BOLD_PATH = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"


def sample_top_color(img):
    """Sample the dark theme color near the top so the fake status bar blends."""
    # Sample a few pixels just below the real status bar
    px = [img.getpixel((x, STATUS_BAR_H + 5)) for x in (40, 540, 1040)]
    avg = tuple(sum(c) // len(px) for c in zip(*px))
    return avg


def draw_fake_status_bar(img):
    """Cover the top STATUS_BAR_H pixels with a clean status bar."""
    bg = sample_top_color(img)
    draw = ImageDraw.Draw(img)
    # Solid background covering the real status bar
    draw.rectangle([(0, 0), (SRC_W, STATUS_BAR_H)], fill=bg)

    # Time on the left
    try:
        font_time = ImageFont.truetype(FONT_BOLD_PATH, 38)
    except OSError:
        font_time = ImageFont.load_default()
    time_str = "9:41"
    draw.text((42, 28), time_str, fill=(255, 255, 255), font=font_time)

    # Right-side icons: signal, wifi, battery (drawn with primitives)
    white = (255, 255, 255)
    right_x = SRC_W - 42  # right margin

    # ---- battery (rounded rect with cap) ----
    bw, bh = 60, 28
    bx2, by1 = right_x, (STATUS_BAR_H - bh) // 2
    bx1, by2 = bx2 - bw, by1 + bh
    # battery body outline
    draw.rounded_rectangle([(bx1, by1), (bx2, by2)], radius=6, outline=white, width=2)
    # battery cap
    cap_w, cap_h = 4, 12
    draw.rectangle([(bx2 + 1, by1 + (bh - cap_h) // 2),
                    (bx2 + 1 + cap_w, by1 + (bh - cap_h) // 2 + cap_h)], fill=white)
    # full fill
    pad = 4
    draw.rounded_rectangle([(bx1 + pad, by1 + pad), (bx2 - pad, by2 - pad)],
                           radius=2, fill=white)

    # ---- wifi (3 arcs) ----
    wifi_x = bx1 - 24  # right edge
    wifi_size = 32
    cx, cy = wifi_x - wifi_size // 2, STATUS_BAR_H // 2 + 6
    # base dot
    draw.ellipse((cx - 4, cy - 4, cx + 4, cy + 4), fill=white)
    # two arcs (drawn as pie slices)
    for r, w in ((14, 3), (24, 3)):
        draw.arc([cx - r, cy - r, cx + r, cy + r], start=215, end=325, fill=white, width=w)

    # ---- cellular signal bars ----
    sig_x_right = wifi_x - wifi_size - 18
    bar_w = 6
    gap = 4
    bar_max_h = 30
    sig_y_bottom = STATUS_BAR_H // 2 + 16
    for i in range(4):
        h = int(bar_max_h * (i + 1) / 4)
        x2 = sig_x_right - i * (bar_w + gap)
        x1 = x2 - bar_w
        y1 = sig_y_bottom - h
        draw.rounded_rectangle([(x1, y1), (x2, sig_y_bottom)], radius=1, fill=white)

    return img


def clean(img: Image.Image) -> Image.Image:
    """Apply status-bar replacement + bottom nav crop. Returns 1080x2200 image."""
    img = img.convert("RGB").copy()
    img = draw_fake_status_bar(img)
    img = img.crop((0, 0, SRC_W, CLEAN_H))   # drop bottom nav
    return img


def fit_with_pad(img: Image.Image, target_size, bg=(0, 0, 0)) -> Image.Image:
    """Scale `img` to fit inside target_size preserving aspect; pad with bg."""
    tw, th = target_size
    iw, ih = img.size
    scale = min(tw / iw, th / ih)
    new_w, new_h = int(round(iw * scale)), int(round(ih * scale))
    resized = img.resize((new_w, new_h), Image.LANCZOS)
    canvas = Image.new("RGB", target_size, bg)
    canvas.paste(resized, ((tw - new_w) // 2, (th - new_h) // 2))
    return canvas


def process_all():
    raws = sorted(RAW_DIR.glob("*.png"))
    for src in raws:
        print(f"Processing {src.name}...")
        img = Image.open(src)
        cleaned = clean(img)

        # Use a background color sampled from the bottom of the cleaned image
        # so iOS letterboxing matches the app's dark theme.
        bg_sample = cleaned.getpixel((20, CLEAN_H - 20))

        cleaned.save(OUT_GP / src.name, "PNG", optimize=True)  # placeholder; overwritten next
        # Actual store outputs:
        gp = fit_with_pad(cleaned, GP_SIZE, bg=bg_sample)
        ios67 = fit_with_pad(cleaned, IOS67_SIZE, bg=bg_sample)
        ios65 = fit_with_pad(cleaned, IOS65_SIZE, bg=bg_sample)

        gp.save(OUT_GP / src.name, "PNG", optimize=True)
        ios67.save(OUT_67 / src.name, "PNG", optimize=True)
        ios65.save(OUT_65 / src.name, "PNG", optimize=True)
        print(f"  → google-play/{src.name}  ({gp.size[0]}x{gp.size[1]})")
        print(f"  → ios-6.7/{src.name}      ({ios67.size[0]}x{ios67.size[1]})")
        print(f"  → ios-6.5/{src.name}      ({ios65.size[0]}x{ios65.size[1]})")


if __name__ == "__main__":
    process_all()
