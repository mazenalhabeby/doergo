"""
Build the Google Play feature graphic (1024 x 500).

Layout:
  - Dark navy background with subtle green/blue radial accents (matches splash)
  - Left:  HBC Field icon + wordmark + tagline + supporting line
  - Right: home-screen preview, framed in a phone-shaped card
Output:
  store-listing/feature-graphic-1024x500.png
"""
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from pathlib import Path

HERE = Path(__file__).parent
ICON = HERE / "app-icon-1024x1024.png"
PHONE_SHOT = HERE / "screenshots/google-play/02-home.png"
OUT = HERE / "feature-graphic-1024x500.png"

W, H = 1024, 500

# Palette
BG_TOP = (10, 14, 20)        # near-black navy
BG_BOTTOM = (24, 32, 48)     # slightly lighter navy
ACCENT_GREEN = (16, 185, 129)
ACCENT_BLUE = (37, 99, 235)
WHITE = (255, 255, 255)
MUTED = (140, 160, 190)

FONT_BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"


def vertical_gradient(size, top, bottom):
    w, h = size
    base = Image.new("RGB", size, top)
    px = base.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        r = int(top[0] * (1 - t) + bottom[0] * t)
        g = int(top[1] * (1 - t) + bottom[1] * t)
        b = int(top[2] * (1 - t) + bottom[2] * t)
        for x in range(w):
            px[x, y] = (r, g, b)
    return base


def soft_circle(canvas, center, radius, color, alpha=80):
    """Paste a blurred translucent circle for a glow accent."""
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = center
    d.ellipse((cx - radius, cy - radius, cx + radius, cy + radius),
              fill=(*color, alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(radius // 3))
    canvas.alpha_composite(layer)


def build():
    # Background gradient
    bg = vertical_gradient((W, H), BG_TOP, BG_BOTTOM).convert("RGBA")

    # Glow accents (subtle, behind content)
    soft_circle(bg, (-40, 90), 220, ACCENT_GREEN, alpha=70)
    soft_circle(bg, (W - 30, H - 60), 260, ACCENT_BLUE, alpha=60)
    soft_circle(bg, (W // 2, H // 2 - 20), 180, ACCENT_BLUE, alpha=25)

    draw = ImageDraw.Draw(bg)

    # ---- Left content ----
    pad_x = 56
    icon_size = 124
    icon = Image.open(ICON).convert("RGBA")
    # Strip the dark icon background by using its alpha — fall back to as-is
    icon = icon.resize((icon_size, icon_size), Image.LANCZOS)

    # Wordmark area starts after the icon
    icon_y = 60
    bg.alpha_composite(icon, (pad_x, icon_y))

    # Wordmark text
    f_word = ImageFont.truetype(FONT_BOLD, 56)
    word_x = pad_x + icon_size + 20
    word_y = icon_y + 30
    draw.text((word_x, word_y), "HBC FIELD", fill=WHITE, font=f_word)

    # Sub-line under wordmark
    f_sub = ImageFont.truetype(FONT_REG, 22)
    draw.text((word_x, word_y + 70),
              "DISPATCH  ·  TRACK  ·  DELIVER",
              fill=MUTED, font=f_sub)

    # Tagline (large headline)
    f_head = ImageFont.truetype(FONT_BOLD, 50)
    draw.text((pad_x, 230), "Field Operations,", fill=WHITE, font=f_head)
    draw.text((pad_x, 286), "Orchestrated.", fill=ACCENT_GREEN, font=f_head)

    # Supporting line
    f_supp = ImageFont.truetype(FONT_REG, 22)
    draw.text((pad_x, 360),
              "Dispatch tasks. Track teams. Close jobs faster —",
              fill=MUTED, font=f_supp)
    draw.text((pad_x, 390),
              "from one app, in real time.",
              fill=MUTED, font=f_supp)

    # ---- Right side: framed phone preview ----
    if PHONE_SHOT.exists():
        phone = Image.open(PHONE_SHOT).convert("RGBA")
        # Target height inside the graphic
        target_h = 440
        # Original is 1080x1920 -> aspect 0.5625
        aspect = phone.size[0] / phone.size[1]
        target_w = int(target_h * aspect)
        phone = phone.resize((target_w, target_h), Image.LANCZOS)

        # Round the corners
        radius = 36
        mask = Image.new("L", phone.size, 0)
        mdraw = ImageDraw.Draw(mask)
        mdraw.rounded_rectangle((0, 0, *phone.size), radius=radius, fill=255)
        phone.putalpha(mask)

        # Drop shadow
        shadow = Image.new("RGBA", (phone.size[0] + 60, phone.size[1] + 60), (0, 0, 0, 0))
        sdraw = ImageDraw.Draw(shadow)
        sdraw.rounded_rectangle((30, 30, 30 + phone.size[0], 30 + phone.size[1]),
                                radius=radius, fill=(0, 0, 0, 180))
        shadow = shadow.filter(ImageFilter.GaussianBlur(20))

        # Position right-aligned
        right_x = W - phone.size[0] - 36
        right_y = (H - phone.size[1]) // 2
        bg.alpha_composite(shadow, (right_x - 30, right_y - 30 + 10))
        bg.alpha_composite(phone, (right_x, right_y))

    # Subtle border (optional)
    out = bg.convert("RGB")
    out.save(OUT, "PNG", optimize=True)
    print(f"Wrote {OUT} ({W}x{H})")


if __name__ == "__main__":
    build()
