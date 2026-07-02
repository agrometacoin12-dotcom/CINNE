#!/usr/bin/env python3
"""Original cinematic poster + hero generator for CinneTemple seed titles.

No third-party imagery — everything is procedurally composed (gradients, nebula
fog, radial light, a genre focal subject, film grain, vignette, scrim) so it is
copyright-clean while looking far richer than a flat gradient. Deterministic per
title id.
"""
import os, re, math, hashlib
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAT = os.path.join(ROOT, "apps/backend/src/modules/catalogue/data/sample-catalogue.ts")
POSTERS = os.path.join(ROOT, "apps/web/public/art/posters")
HEROES = os.path.join(ROOT, "apps/web/public/art/hero")
FONTS = "/usr/share/fonts/truetype/google-fonts"
DEJAVU = "/usr/share/fonts/truetype/dejavu"

def font(name, size, fallback=f"{DEJAVU}/DejaVuSans-Bold.ttf"):
    p = f"{FONTS}/{name}"
    return ImageFont.truetype(p if os.path.exists(p) else fallback, size)

# ---- genre palettes: (deep A, deep B, accent glow) as RGB 0-1 -------------
PAL = {
    "Sci-Fi":   ((0.04,0.05,0.12),(0.02,0.02,0.05),(0.39,0.40,0.95)),
    "Mystery":  ((0.03,0.06,0.08),(0.01,0.02,0.03),(0.20,0.55,0.62)),
    "Thriller": ((0.06,0.05,0.07),(0.01,0.01,0.02),(0.55,0.20,0.30)),
    "Drama":    ((0.09,0.07,0.05),(0.02,0.02,0.03),(0.85,0.55,0.30)),
    "Action":   ((0.10,0.04,0.03),(0.02,0.01,0.01),(0.95,0.45,0.20)),
    "Romance":  ((0.09,0.04,0.09),(0.02,0.01,0.03),(0.85,0.35,0.65)),
    "Horror":   ((0.06,0.02,0.03),(0.01,0.00,0.01),(0.75,0.12,0.14)),
    "Fantasy":  ((0.06,0.04,0.10),(0.02,0.01,0.04),(0.55,0.40,0.90)),
    "Comedy":   ((0.05,0.07,0.10),(0.02,0.02,0.03),(0.30,0.65,0.85)),
    "Adventure":((0.05,0.07,0.08),(0.01,0.02,0.03),(0.30,0.70,0.60)),
    "Music":    ((0.07,0.04,0.10),(0.02,0.01,0.03),(0.60,0.35,0.85)),
    "Family":   ((0.05,0.07,0.11),(0.02,0.02,0.04),(0.35,0.55,0.90)),
}
DEFAULT = ((0.04,0.05,0.11),(0.02,0.02,0.05),(0.42,0.43,0.99))
INDIGO = np.array((0.42,0.43,0.99))

def rng_for(idv):
    h = int(hashlib.md5(idv.encode()).hexdigest(), 16)
    return np.random.default_rng(h % (2**32))

def fbm(rng, h, w, octaves=5):
    """Fractal noise in [0,1], smooth."""
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        s = 2 ** o
        gh, gw = max(2, h // (64 // s if 64 // s else 1)), max(2, w // (64 // s if 64 // s else 1))
        g = rng.random((gh, gw)).astype(np.float32)
        g = np.array(Image.fromarray((g*255).astype(np.uint8)).resize((w, h), Image.BICUBIC), np.float32)/255
        out += g * amp; tot += amp; amp *= 0.5
    return out / tot

def radial(h, w, cx, cy, r):
    ys, xs = np.mgrid[0:h, 0:w]
    d = np.sqrt(((xs-cx)/r)**2 + ((ys-cy)/r)**2)
    return np.clip(1 - d, 0, 1) ** 1.6

def compose(idv, title, genre, rating, W, H, hero=False):
    rng = rng_for(idv)
    pal = PAL.get(genre, DEFAULT)
    A, B, ACC = np.array(pal[0]), np.array(pal[1]), np.array(pal[2])

    # vertical base gradient with slight diagonal
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    t = (ys/H)*0.8 + (xs/W)*0.2
    img = A[None,None,:]*(1-t[...,None]) + B[None,None,:]*t[...,None]

    # nebula fog tinted by accent
    fog = fbm(rng, H, W, 5)
    fog = (fog - fog.min())/(np.ptp(fog)+1e-6)
    tint = ACC*0.5 + INDIGO*0.5
    img = 1 - (1-img)*(1-(tint[None,None,:]*(fog[...,None]*0.35)))  # screen blend

    # focal light source
    fx = W*(0.66 if not hero else 0.30) + rng.uniform(-W*0.05, W*0.05)
    fy = H*(0.34 if not hero else 0.42)
    glow = radial(H, W, fx, fy, (W if hero else W)*0.62)
    img += ACC[None,None,:] * (glow[...,None]*0.55)

    # focal subject — a soft luminous sphere ("planet"), rim-lit
    pr = (min(W,H))*(0.28 if not hero else 0.34)
    sx, sy = fx, fy
    disc = radial(H, W, sx, sy, pr)
    body = (disc > 0.02).astype(np.float32)
    # dark body with accent rim
    img = img*(1-(body*0.55)[...,None])
    rim = np.clip(disc*3-2,0,1) - np.clip(disc*3-2.15,0,1)*0.0
    img += (ACC*1.2)[None,None,:] * (rim[...,None])
    # star specks (sci-fi / space genres)
    if genre in ("Sci-Fi","Fantasy","Adventure","Mystery"):
        n = 260
        px = rng.integers(0, W, n); py = rng.integers(0, H//1, n)
        b = rng.random(n)*0.7+0.3
        for i in range(n):
            img[py[i], px[i]] += b[i]*0.9

    # diagonal light beam
    beam = np.clip(1-np.abs((xs - ys*0.6 - W*0.25)/(W*0.16)),0,1)**2
    img += (ACC*0.6)[None,None,:]*(beam[...,None]*0.18)

    # grain
    img += (rng.random((H,W,1)).astype(np.float32)-0.5)*0.045

    # vignette
    vig = radial(H, W, W/2, H/2, W*0.95)
    img *= (0.35 + 0.65*vig[...,None])

    # bottom scrim for text
    scr = np.clip((ys/H - 0.5)/0.5, 0, 1)**1.4
    img *= (1 - scr[...,None]*0.82)
    if hero:  # left scrim
        ls = np.clip(1-(xs/W)/0.62,0,1)**1.3
        img *= (1 - ls[...,None]*0.55)

    arr = np.clip(img,0,1)
    # subtle filmic contrast
    arr = np.clip((arr-0.5)*1.12+0.5, 0, 1)
    im = Image.fromarray((arr*255).astype(np.uint8), "RGB").filter(ImageFilter.GaussianBlur(0.4))
    draw(im, title, genre, rating, W, H, hero, pal[2])
    return im

def draw(im, title, genre, rating, W, H, hero, acc):
    d = ImageDraw.Draw(im)
    acccol = tuple(int(c*255) for c in (min(1,acc[0]*1.1+0.25), min(1,acc[1]*1.1+0.25), min(1,acc[2]*1.1+0.3)))
    ind = (140,143,252)
    # wordmark
    wm = font("Poppins-Bold.ttf", 20 if not hero else 22)
    d.text((28, 24), "CINNETEMPLE", font=font("Poppins-SemiBold.ttf", 15 if not hero else 16), fill=(255,255,255,180))
    # genre label
    gl = font("Poppins-SemiBold.ttf", 20 if hero else 17)
    tx = 36 if hero else 28
    base_y = H - (150 if hero else 132)
    d.text((tx, base_y), genre.upper(), font=gl, fill=ind)
    # title (wrap)
    ts = 64 if hero else 46
    tf = font("Poppins-Bold.ttf", ts)
    words, line, lines = title.split(), "", []
    maxw = W - tx - (W*0.35 if hero else 40)
    for w in words:
        test = (line+" "+w).strip()
        if d.textlength(test, font=tf) > maxw and line:
            lines.append(line); line = w
        else: line = test
    lines.append(line)
    y = base_y + (30 if hero else 26)
    for ln in lines[:3]:
        d.text((tx, y), ln, font=tf, fill=(255,255,255))
        y += ts + 4
    # rating chip
    if rating:
        rf = font("Poppins-SemiBold.ttf", 15 if not hero else 17)
        d.text((tx, y+6), f"★ {rating:.1f}", font=rf, fill=(251,191,36))

def parse():
    txt = open(CAT).read()
    items = []
    for m in re.finditer(r"id:\s*'([0-9a-f-]+)'.*?title:\s*'((?:[^'\\]|\\.)*)'.*?genres:\s*\[([^\]]*)\].*?rating:\s*([0-9.]+)", txt, re.S):
        idv, title, genres, rating = m.groups()
        g0 = re.findall(r"'([^']+)'", genres)
        items.append((idv, title.replace("\\'","'"), g0[0] if g0 else "Drama", float(rating)))
    return items

def main():
    os.makedirs(POSTERS, exist_ok=True); os.makedirs(HEROES, exist_ok=True)
    items = parse()
    print(f"{len(items)} titles")
    for idv, title, genre, rating in items:
        compose(idv, title, genre, rating, 600, 900).save(f"{POSTERS}/{idv}.jpg", quality=88)
        compose(idv, title, genre, rating, 1600, 900, hero=True).save(f"{HEROES}/{idv}.jpg", quality=88)
        print("  ", title, "·", genre)
    print("done")

if __name__ == "__main__":
    main()
