---
name: Framer-motion AnimatePresence stuck-open drawers
description: AnimatePresence can leave an element mounted forever if its exit animation never signals completion.
---

`AnimatePresence` only unmounts a departing child after its `exit` animation reports completion. Spring-based exits (`transition: { type: 'spring', ... }`) can fail to settle/report completion in some conditions (throttled requestAnimationFrame, backgrounded/non-visible tabs, certain browser automation contexts) — when this happens, the child stays mounted and fully visible indefinitely, with no console error, even though the driving React state has already flipped correctly.

**Why it matters:** this bug is easy to misdiagnose as a React state bug (state looks right in logs) when it's actually the animation library failing to unmount. Confirmed via computed style: the "closed" element still showed `display:flex` with no exit transform applied at all.

**How to apply:** for correctness-critical show/hide UI (modals, drawers, nav overlays), prefer an always-mounted element toggled by plain CSS transition/transform classes over `AnimatePresence`-driven mount/unmount. This can't get stuck since there's no animation-completion gate before the element becomes non-interactive. Pair with `inert` (not just `aria-hidden`) on the closed state to keep it out of the tab order, since it remains in the DOM.
