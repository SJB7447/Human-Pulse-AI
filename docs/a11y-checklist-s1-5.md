# S1-5 A11Y Checklist (2026-02-13)

## Scope
- `client/src/components/NewsDetailModal.tsx`
- `client/src/components/HueBot.tsx`

## Keyboard Navigation
- [x] `Esc` closes `NewsDetailModal`
- [x] `Esc` closes insight editor overlay (inside detail modal)
- [x] `Tab` cycle is trapped inside detail modal
- [x] `Tab` cycle is trapped inside insight editor overlay
- [x] `Esc` closes Hue Bot chat panel
- [x] Hue Bot open/close returns focus predictably (toggle <-> input)

## Focus Visibility
- [x] Primary action buttons in detail modal have visible focus ring
- [x] Recommendation cards in detail modal are keyboard-focus visible
- [x] Hue Bot toggle / close / send controls have visible focus ring

## Dialog Semantics
- [x] Detail modal: `role="dialog"` + `aria-modal="true"`
- [x] Detail modal: `aria-labelledby` + `aria-describedby`
- [x] Insight editor overlay: `role="dialog"` + `aria-modal="true"`
- [x] Hue Bot chat: `role="dialog"` + `aria-label`

## Contrast
- [x] Focus ring contrast improved from default where custom buttons were used
- [x] Core action text remains readable against button backgrounds

## Validation
- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm test`

## Residual Risk
- 일부 페이지 문자열 인코딩 깨짐이 남아 있으며(`S0-3`), 실제 사용자 문구 품질 점검이 추가로 필요함.
