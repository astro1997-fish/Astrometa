---
name: Framer-motion AnimatePresence stuck-open drawers
description: AnimatePresence can leave an element mounted forever if its exit animation never signals completion.
---

`AnimatePresence` only unmounts a departing child after its `exit` animation reports completion. Spring-based exits (`transition: { type: 'spring', ... }`) can fail to settle/report completion in some conditions (throttled requestAnimationFrame, backgrounded/non-visible tabs, certain browser automation contexts) — when this happens, the child stays mounted and fully visible indefinitely, with no console error, even though the driving React state has already flipped correctly.

**Why it matters:** this bug is easy to misdiagnose as a React state bug (state looks right in logs) when it's actually the animation library failing to unmount. Confirmed via computed style: the "closed" element still showed `display:flex` with no exit transform applied at all.

**How to apply:** for correctness-critical show/hide UI (modals, drawers, nav overlays), prefer an always-mounted element toggled by plain CSS transition/transform classes over `AnimatePresence`-driven mount/unmount. This can't get stuck since there's no animation-completion gate before the element becomes non-interactive. Pair with `inert` (not just `aria-hidden`) on the closed state to keep it out of the tab order, since it remains in the DOM.

This app had the same bug independently in two places (a dashboard sidebar drawer and a public-site navbar mobile menu) — both used `AnimatePresence` for a slide/collapse overlay. When fixing one instance, grep the codebase for other `AnimatePresence` usages wrapping drawers/menus/overlays, since the pattern tends to be copy-pasted.

**Gotchas hit applying the CSS-transform fix:**
- Tailwind's arbitrary-value transition-property syntax with a comma, e.g. `transition-[max-height,opacity]`, silently fails to generate any CSS class — no build error, it just doesn't apply. Use `transition-all` or separate explicit utilities instead.
- This TS/React-DOM version's JSX types don't include the `inert` prop; set it imperatively via a typed ref (`(el as HTMLElement & { inert?: boolean }).inert = closed`) in a `useEffect`, not via a prop-spread cast — keep the pattern consistent across components.
- When testing a "did it close" state via computed styles, check *after* a short delay (e.g. 300-500ms), not immediately after the triggering click — the closing effect (e.g. a route-change `useEffect`) needs a render pass to commit, so an immediate check will show stale "still open" values and looks like a regression when there isn't one.
