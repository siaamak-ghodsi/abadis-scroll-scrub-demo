# site-demo.html — Abadis Product Theater (pitch demo)

**Purpose:** Pitch / sales demo. Live Abadis homepage look with the Revolution Slider hero replaced by a vivid sticky **Product Theater** (scroll-scrub lid/body explode). Site marketing copy is unchanged.

**Public URL:** https://siaamak-ghodsi.github.io/abadis-scroll-scrub-demo/site-demo.html

**SEO-safe:** `<meta name="robots" content="noindex,nofollow">`. Not production.

## Creative approach (v2)
- **Abandoned** the faded full-page fixed WebGL background (opacity ~0.42 + blur) — product was invisible.
- **Product Theater:** sticky stage ~200vh tall, sticky 100vh viewport, clinical white / soft teal gradient.
- Product fully visible (`opacity: 1`, no blur).
- Scroll progress **0→1 over the theater stage only** (~2 screens) — dramatic explode, not watered across the whole page.
- Strong explode: lid up ~0.12m, body down ~0.16m, ±0.04m X split, opposite tiny yaw.
- Camera dolly-in + yaw arc ~35° → −15°.
- Soft teal rim light + RoomEnvironment; idle micro-float at scroll ends.
- Optional teal dashed connector line between lid/body centroids (visual only).
- Tiny LTR progress bar + DEMO chip only (no new Persian marketing text).

## Technical
- GLB: `./abadis-scrub-parts.glb` (`lid` + `body` nodes)
- Scrub logic: `./scrub-theater.js` (ES module + importmap) — avoids colliding with WordPress `type=module` emoji scripts
- RevSlider init stubbed; protocol-relative assets normalized to `https://`

**Do not index.** Pitch use only.
