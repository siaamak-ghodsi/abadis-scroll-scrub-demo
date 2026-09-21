# site-demo.html — pitch-only Abadis scroll-scrub overlay

**Purpose:** Pitch / sales demo that shows the scroll-scrub product explode **in place of** the live homepage Revolution Slider hero, while keeping all Elementor body text, counters, news, header, and footer exactly as on https://abadis-med.com/.

**Public URL:** https://siaamak-ghodsi.github.io/abadis-scroll-scrub-demo/site-demo.html

**SEO-safe:** This file includes `<meta name="robots" content="noindex,nofollow">`. It is **not** production. Production would swap hero media only (slider → scrub canvas) without republishing a full mirrored page.

**What changed vs live site:**
- Replaced only the `rs-module-wrap#rev_slider_4_1_wrapper` / punch-revslider hero block with a ~240vh sticky three.js scrub loading `./abadis-scrub-parts.glb`.
- Tiny fixed corner chip: «دمو بصری — متن سایت بدون تغییر» (links back to live site).
- Protocol-relative `//` assets normalized to `https://`.
- RevSlider init for slider 4 stubbed so missing module does not throw.

**Do not index.** Pitch use only.
