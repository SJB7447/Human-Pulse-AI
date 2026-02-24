# News Card Spec (Frozen Baseline)

## Scope
- Target: News cards in emotion/news listing UI
- Primary implementation reference: `client/src/pages/emotion.tsx`
- Goal: keep geometry and reading flow stable across releases

## Fixed Geometry
- Card size: `342 x 540` px
- Inner text padding: `20px` (for text/meta zones)
- Image area ignores inner padding and uses full card width

## Coordinate Baseline (x, y)
- Category tooltip / upload time: top metadata row near `y=20`
- Emotion depth row: `y=66`
- Title start: `(20, 104)`, max 2 lines
- Body start: `(20, 184)`
- Body end with image: `(20, 300)`
- Body end without image: `(20, 454)`
- Image area (if image exists): from `y=340` to `y=540`, full width
- Arrow CTA: `(282, 476)`, `40 x 40`, always above image layer

## Content Rules
- Body text must stay inside allowed body range.
- Body preview must express continuation with trailing `...`.
- If image is absent, text area expands to the no-image body range only.

## Layering Rules
- Card keeps rounded mask (`overflow-hidden`), including image area.
- Arrow CTA must remain visible on top (`z-index` above image layer).
- Title/body readability takes priority over decorative overlays.

## Change Control
- Any geometry or cutoff change requires same-change updates to:
1. this spec file
2. implementation code (`emotion.tsx` or extracted card component)
3. visual regression evidence (screenshot/snapshot or equivalent log)

## Verification Checklist
- Desktop/tablet/mobile no clipping/overlap
- With-image and no-image cards both satisfy bounds
- Ellipsis appears consistently
- Arrow CTA remains topmost
