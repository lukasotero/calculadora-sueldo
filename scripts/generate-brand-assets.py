"""Build deterministic browser and social assets from the brand system."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "src" / "app"
PUBLIC = ROOT / "public" / "brand"
HERO = ROOT / "src" / "assets" / "brand" / "hero-editorial.png"

MINT = "#63D9BD"
MINT_DARK = "#167F70"
PETROL = "#102B32"
INK = "#071B20"
OFF_WHITE = "#F5F6EF"
BLUE_GRAY = "#8CA4AA"


def rounded_receipt(draw: ImageDraw.ImageDraw, scale: float) -> None:
    def p(value: float) -> int:
        return round(value * scale)

    draw.rounded_rectangle((0, 0, p(48), p(48)), radius=p(14), fill=MINT)
    receipt = [
        (p(14), p(11.5)),
        (p(30.5), p(11.5)),
        (p(34.5), p(15.5)),
        (p(34.5), p(36)),
        (p(30.5), p(33.5)),
        (p(26.5), p(36)),
        (p(22.5), p(33.5)),
        (p(18.5), p(36)),
        (p(14), p(33.25)),
    ]
    draw.polygon(receipt, fill=PETROL)
    draw.line((p(19), p(19), p(29), p(19)), fill=MINT, width=max(1, p(2.5)))
    draw.line((p(19), p(24), p(25.5), p(24)), fill=MINT, width=max(1, p(2.5)))
    draw.line(
        (p(25.5), p(28.5), p(28), p(30.5), p(33), p(24.5)),
        fill=MINT,
        width=max(1, p(2.6)),
        joint="curve",
    )


def icon(size: int) -> Image.Image:
    supersample = 4
    canvas = Image.new("RGBA", (size * supersample, size * supersample), (0, 0, 0, 0))
    rounded_receipt(ImageDraw.Draw(canvas), size * supersample / 48)
    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    fonts = Path("C:/Windows/Fonts")
    candidates = {
        "bold": ["segoeuib.ttf", "arialbd.ttf"],
        "regular": ["segoeui.ttf", "arial.ttf"],
    }[name]
    for candidate in candidates:
        path = fonts / candidate
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default(size=size)


def social_image() -> Image.Image:
    width, height = 1200, 630
    source = Image.open(HERO).convert("RGB")
    target_ratio = width / height
    source_ratio = source.width / source.height
    if source_ratio > target_ratio:
        crop_width = round(source.height * target_ratio)
        left = source.width - crop_width
        source = source.crop((left, 0, source.width, source.height))
    else:
        crop_height = round(source.width / target_ratio)
        top = (source.height - crop_height) // 2
        source = source.crop((0, top, source.width, top + crop_height))
    background = source.resize((width, height), Image.Resampling.LANCZOS)

    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    pixels = overlay.load()
    for x in range(width):
        strength = max(0.0, min(1.0, (800 - x) / 420))
        alpha = round(245 * strength)
        for y in range(height):
            pixels[x, y] = (7, 27, 32, alpha)
    canvas = Image.alpha_composite(background.convert("RGBA"), overlay)
    draw = ImageDraw.Draw(canvas)

    mark = icon(76)
    canvas.alpha_composite(mark, (68, 58))
    draw.text((162, 68), "CALCULADORA", font=font("bold", 24), fill=OFF_WHITE)
    draw.text((162, 101), "DE SUELDO", font=font("bold", 15), fill=BLUE_GRAY)
    draw.text((68, 225), "Tu sueldo,", font=font("bold", 68), fill=OFF_WHITE)
    draw.text((68, 303), "sin letra chica.", font=font("bold", 68), fill=MINT)
    draw.text(
        (72, 414),
        "Calculá, compará y entendé cada línea.",
        font=font("regular", 25),
        fill="#CAD6D3",
    )
    draw.rounded_rectangle((68, 530, 328, 574), radius=22, fill="#173A40")
    draw.ellipse((86, 546, 98, 558), fill=MINT)
    draw.text((112, 540), "PRIVADO · OPEN SOURCE", font=font("bold", 14), fill=OFF_WHITE)
    return canvas.convert("RGB")


def main() -> None:
    APP.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)

    icon(512).save(APP / "icon.png", optimize=True)
    icon(180).save(APP / "apple-icon.png", optimize=True)
    icon(256).save(
        APP / "favicon.ico",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    icon(512).save(PUBLIC / "brand-mark-512.png", optimize=True)

    social = social_image()
    social.save(APP / "opengraph-image.png", optimize=True)
    social.save(APP / "twitter-image.png", optimize=True)
    social.save(PUBLIC / "social-preview.png", optimize=True)


if __name__ == "__main__":
    main()
