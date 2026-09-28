"""Build the landing hero's night version.

Anir, Sep 28: "you got to change the image, bro. You got to make the image dark
mode or something. The image is not going to work."

Dimming the whole picture in CSS turns the white studio backdrop into flat grey,
which is exactly what did not work. So the marble is lifted off its backdrop
here and set in the dark instead: fit the white ground as a smooth 2D surface,
matte the statue out of it, then relight the marble as if by moonlight and set
it on the page's own night colour. The gold and the blue constellation keep
their colour; everything else goes cool and deep.

    python3 docs/landing-dark-hero.py
"""
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = "public/landing/heroes/13-roman-freyr-hero.png"
OUT = "public/landing/heroes/13-roman-freyr-hero-dark.jpg"

a = np.asarray(Image.open(SRC).convert("RGB"), np.float32) / 255
H, W, _ = a.shape
L = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
mx, mn = a.max(2), a.min(2)
sat = np.where(mx > 1e-4, (mx - mn) / np.maximum(mx, 1e-4), 0)
mean = ndimage.uniform_filter(L, 9)
std = np.sqrt(np.maximum(ndimage.uniform_filter(L * L, 9) - mean * mean, 0))

# The backdrop is a gradient with a vignette: fit it, ignore the marble, repeat.
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
X, Y = xx / W - .5, yy / H - .5
A = np.stack([t.ravel() for t in
              (np.ones_like(X), X, Y, X * X, X * Y, Y * Y, X ** 3, X * X * Y, X * Y * Y, Y ** 3)], 1)
use = (std < 0.0035).ravel()
for _ in range(3):
    coef, *_ = np.linalg.lstsq(A[use], L.ravel()[use], rcond=None)
    ground_model = (A @ coef).reshape(H, W)
    use = ((np.abs(L - ground_model) < 0.018) & (std < 0.0045) & (sat < 0.05)).ravel()

# What is not backdrop: brighter or darker than it, textured, or coloured.
soft = np.clip((np.abs(L - ground_model) - 0.012) / 0.038, 0, 1)
tex = np.clip((std - 0.0025) / 0.006, 0, 1)
col = np.clip((sat - 0.05) / 0.07, 0, 1)
matte = np.maximum(np.maximum(soft, tex), col)
core = ndimage.binary_fill_holes(ndimage.binary_closing(matte > 0.55, np.ones((9, 9))))
lab, n = ndimage.label(core)
if n:
    sizes = ndimage.sum(core, lab, range(1, n + 1))
    core = np.isin(lab, 1 + np.where(sizes > 6000)[0])
# The soft matte only counts NEAR the figure; far away it is just film grain.
gate = ndimage.gaussian_filter(core.astype(np.float32), 16)
gate = np.clip(gate / 0.35, 0, 1)
alpha = np.clip(np.maximum(ndimage.gaussian_filter(core.astype(np.float32), 1.6), matte * gate * .92), 0, 1)

# The night ground: the page's own colour, with a soft glow behind the figure.
top, bot, glow = (.021, .032, .054), (.039, .066, .113), (.05, .08, .14)
t = np.linspace(0, 1, H, np.float32)[:, None, None]
ground = np.array(top, np.float32) * (1 - t) + np.array(bot, np.float32) * t
r = np.sqrt(((xx - W * .46) / (W * .58)) ** 2 + ((yy - H * .32) / (H * .85)) ** 2)
ground = ground + np.array(glow, np.float32) * (np.clip(1 - r, 0, 1) ** 2)[..., None]

# Moonlight on the marble: darker, cool in the shadows, colour kept where the
# picture had colour, and the soft bloom at the edges dimmed so it reads as
# glow rather than as a cut-out fringe.
lit = np.clip(a, 0, 1) ** 1.45 * .58
hi = np.clip(L[..., None] * 1.15, 0, 1)
lit = lit * (np.array((.72, .84, 1.10), np.float32) * (1 - hi) + hi)
lum = (0.2126 * lit[..., 0] + 0.7152 * lit[..., 1] + 0.0722 * lit[..., 2])[..., None]
lit = lum + (lit - lum) * (1 + .55 * sat[..., None] * 6)
lit = lit * (0.55 + 0.45 * alpha[..., None])

edge = ndimage.gaussian_filter(np.abs(ndimage.gaussian_filter(alpha, 1.5) - ndimage.gaussian_filter(alpha, 5.0)), 2.0)
edge /= max(edge.max(), 1e-6)
out = ground * (1 - alpha[..., None]) + lit * alpha[..., None]
out = np.clip(out + np.array((.035, .06, .10), np.float32) * edge[..., None], 0, 1)

Image.fromarray((out * 255).astype(np.uint8)).save(OUT, quality=93, subsampling=0, progressive=True)
print("wrote", OUT)
