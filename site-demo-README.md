# site-demo.html — pitch-only Abadis full-page scroll scrub

**Purpose:** Pitch / sales demo that shows the 3D product explode **behind** the live homepage Elementor content as the user scrolls the whole page. Site text is unchanged.

**Public URL:** https://siaamak-ghodsi.github.io/abadis-scroll-scrub-demo/site-demo.html

**SEO-safe:** `<meta name="robots" content="noindex,nofollow">`. Not production.

**What changed vs live site:**
- Revolution Slider hero replaced with a short (~80vh) teal/white spacer (no new marketing copy).
- Fixed full-viewport WebGL layer (`z-index: 0`, `pointer-events: none`, canvas opacity ~0.42) sits behind page content.
- Scrub progress = `scrollY / (scrollHeight - innerHeight)` across the entire page → lid/body explode.
- Softened early white Elementor section backgrounds so the product peeks behind text; teal header stays solid.
- Tiny DEMO chip: «دمو بصری — متن سایت بدون تغییر».
- Protocol-relative `//` assets normalized to `https://`. RevSlider init stubbed.

**Do not index.** Pitch use only.
