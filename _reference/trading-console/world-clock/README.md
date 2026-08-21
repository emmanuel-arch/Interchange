# Zones

A timezone dashboard for people who work across time zones. Built with Next.js 15, React 19, and Tailwind CSS v4.

## Features

- **4 View Modes** — Stack (cinematic), Scroll (detailed list), Grid (bento cards), Compact (pill badges)
- **Time Scrubber** — Drag to time-travel across all zones simultaneously, with haptic feedback and audio ticks
- **Custom Zones** — Add any IANA timezone, remove zones, set any zone as home
- **Drag Reorder** — Reorder zones via drag-and-drop in scroll view (home pinned at top)
- **Timezone Grouping** — Zones with the same UTC offset merge into grouped rows (stack/compact views)
- **Ambient Mode** — Time-of-day gradients that shift based on each zone's local time
- **Light/Dark Theme** — System-aware with manual toggle
- **12h/24h Toggle** — Switch time format globally
- **Local-First** — All preferences persisted to localStorage via `useSyncExternalStore`
- **Responsive** — Mobile-first with fluid `clamp()` sizing

## Stack

- [Next.js 15](https://nextjs.org) (App Router, Turbopack)
- [React 19](https://react.dev)
- [Tailwind CSS v4](https://tailwindcss.com)
- [Motion](https://motion.dev) (animations + drag reorder)
- [date-fns-tz v3](https://github.com/marnusw/date-fns-tz) (timezone math)
- [next-themes](https://github.com/pacocoursey/next-themes) (theme switching)
- [web-haptics](https://github.com/nicksrandall/web-haptics) (haptic feedback)
- [flag-icons](https://github.com/lipis/flag-icons) (country flags)
- [Geist Pixel Square](https://vercel.com/font) (pixel font)
- [Biome](https://biomejs.dev) (lint + format)

## Getting Started

```bash
bun install
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
├── app/
│   ├── globals.css          # Tailwind v4 + theme variables + ambient gradients
│   ├── layout.tsx           # Root layout with fonts + theme provider
│   └── page.tsx             # Main orchestrator
├── components/
│   ├── grouped-zone-row.tsx # Grouped zones (same offset) row
│   ├── theme-provider.tsx   # next-themes wrapper
│   ├── theme-switcher.tsx   # Light/dark toggle
│   ├── time-scrubber.tsx    # Drag-to-scrub timeline with audio + haptics
│   ├── view-switcher.tsx    # View mode toolbar + add zone button
│   ├── zone-search.tsx      # IANA timezone search modal
│   └── views/
│       ├── stack-view.tsx   # Viewport-filling cinematic rows
│       ├── scroll-view.tsx  # Scrollable list with drag reorder
│       ├── grid-view.tsx    # Responsive bento grid
│       └── compact-view.tsx # Horizontal pill badges
├── hooks/
│   ├── use-world-clock.ts   # Time + scrubber state
│   ├── use-zones-store.ts   # Store hook (useSyncExternalStore)
│   └── use-click-sound.ts   # Web Audio click sound
└── lib/
    ├── store.ts             # localStorage-synced external store
    ├── zones.ts             # Zone type + defaults
    ├── time-utils.ts        # Timezone formatting helpers
    ├── time-of-day.ts       # Ambient mode gradient calculations
    ├── group-zones.ts       # Group zones by UTC offset
    ├── tz-metadata.ts       # IANA timezone → country code map
    └── tz-country-names.ts  # Country code → name map
```

## License

MIT
