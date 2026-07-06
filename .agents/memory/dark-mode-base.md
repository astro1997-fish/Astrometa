---
name: Dark mode base styles
description: globals.css must define html/html.dark base colors and all custom component classes, otherwise text inherits browser-default black in dark mode.
---

## The rule
`frontend/src/styles/globals.css` must have:
1. `@layer base` with `html { text-gray-900 }` and `html.dark { text-gray-100 bg-[#070D1F] }` — without this, any element lacking an explicit `dark:text-*` class inherits the browser's default black, making it invisible on dark backgrounds.
2. `@layer components` defining all custom classes: `.card`, `.btn-primary`, `.btn-ghost`, `.btn-secondary`, `.badge` (and `.badge-green/blue/gray/gold/violet/red`), `.input`, `.skeleton`, `.sidebar-link`, `.section-eyebrow`, `.section-title`, `.text-gradient`, `.text-gradient-gold`, `.text-gradient-plat`, `.glass`, `.glass-dark`.

**Why:** These component classes are used as bare class names throughout the codebase (e.g. `className="card"`). If they're not defined in CSS they produce zero output. Text color then falls through to the inherited body color — which is browser-default black if no base rule sets dark-mode defaults.

**How to apply:** If globals.css is ever reset/stripped, restore both the base layer defaults AND the full components layer. ThemeContext adds `.dark` to `document.documentElement`, so `html.dark` is the correct selector (matches Tailwind's `darkMode: 'class'` config).
