// The blur placeholders for public/themes, copied from connected-suite's
// lib/theme/media.generated.ts (its `npm run media` writes them). The wallpapers
// here are the estate's own files, so their placeholders are too — re-copy both
// together when a skin is added there.
export type MediaMeta = {
  /** A ~20px WebP, base64. Painted blurred and scaled up under the real one. */
  lqip: string;
  /** The picture's own dominant colour. */
  dominant: string;
  w: number;
  h: number;
};

export const MEDIA: Record<string, MediaMeta> = {
  "/themes/boda-motion.webp": { lqip: "data:image/webp;base64,UklGRloAAABXRUJQVlA4IE4AAACwAwCdASoUAAwAPu1orU6ppiSiMAgBMB2JZQDE2CHW7ZhLODEAAAD9U7apVCcoFt4qA6HkeCrCJpsYut2di61kZ4i3FQCd7aoU6vYVwAA=", dominant: "#080808", w: 2560, h: 1600 },
  "/themes/coast.webp": { lqip: "data:image/webp;base64,UklGRlwAAABXRUJQVlA4IFAAAAAwAwCdASoUAAwALrV2u12jqampiYC0SyAE6ZQAHUQbj10AAP6UiWJZVs9s5Ik4Q85PWFwdqQ4XW/+2aQGXJ7rWTlxQkNqy6XcBfN5iTggAAA==", dominant: "#c8b8a8", w: 2560, h: 1600 },
  "/themes/dark-1.webp": { lqip: "data:image/webp;base64,UklGRkIAAABXRUJQVlA4IDYAAABQAwCdASoUAAwAPu1iqU2ppaQiMAgBMB2JZwDImCHfh+eQwAD+9CLtOg9zgQpe2NA7oqojwAA=", dominant: "#080808", w: 2560, h: 1600 },
  "/themes/dark-2.webp": { lqip: "data:image/webp;base64,UklGRkwAAABXRUJQVlA4IEAAAADQAwCdASoUAAwAPu1iqU2ppaOiMAgBMB2JZwC+SCHdmmj8nDIgSAAA/vQjflpYt+ls6gaB25FXRlwv+qBCAAAA", dominant: "#080808", w: 2560, h: 1600 },
  "/themes/gradient-1.webp": { lqip: "data:image/webp;base64,UklGRoYAAABXRUJQVlA4IHoAAACQBACdASoUAAwAPu1iqU2ppaOiMAgBMB2JbACdMoLUABGBfAnOFH4HDM/U1AAA/o9jzbsVXXvTulWlGShosHPvXVsYj3on9JBjE2iCO2dEVMTBviTqDfWlPHd2Ziwrjo3RChtL373KTFvV6+4e/zNUfyvmSmo4QQAAAA==", dominant: "#d8d8d8", w: 2560, h: 1600 },
  "/themes/linen-dark.webp": { lqip: "data:image/webp;base64,UklGRkYAAABXRUJQVlA4IDoAAABwAwCdASoUABcAPu1wr1KtJiQjqAgBoB2JaQAAPPSr3b4OVAAA/vBByOi6ldjbKZTMY5mSLzFa+AAA", dominant: "#080808", w: 1408, h: 1600 },
  "/themes/market-warm.webp": { lqip: "data:image/webp;base64,UklGRqgAAABXRUJQVlA4IJwAAABwBgCdASoUABwAPu1orFEppaQiqAqpMB2JbACdMtU0T9K8wAYL3X8lI2xX5yfoD648ugOIlgMzd0cIFAAA+KWYhQ3HZDTXuFeGbGi9Fcyn/+BOZSGPE5Pr+J2apmFL7NAQRxKijgJnTm7U0joQpCaWUwBWsGP8yAGG5Hp698vZcAUoURUnx1+2Ysj5eGRq+TIsBNVj7lthwX8EAAA=", dominant: "#f89808", w: 1152, h: 1600 },
  "/themes/mesh-lime.webp": { lqip: "data:image/webp;base64,UklGRlwAAABXRUJQVlA4IFAAAAAQBACdASoUAAwAPu1iqU2ppaQiMAgBMB2JQBdl4AAvdAKxv5sbW6dz6AD+7qFRmP6lyPCIuA9EUnvgmRdeNROvNykCizA8ZDKWkiz6X2AAAA==", dominant: "#182828", w: 2560, h: 1600 },
  "/themes/mesh-navy.webp": { lqip: "data:image/webp;base64,UklGRlQAAABXRUJQVlA4IEgAAADQAwCdASoUAAwAPu1kqk4ppaQiMAgBMB2JYwAAUXy7aTV/ztZ+4AAA/vDfraO+snDx48fcwpiGRH0HxbhiWEklOxG2N+YAAAA=", dominant: "#081828", w: 2560, h: 1600 },
  "/themes/mount-kenya.webp": { lqip: "data:image/webp;base64,UklGRmoAAABXRUJQVlA4IF4AAAAQBACdASoUAA8APu1iqk2ppaQiMAgBMB2JYwCdIIjDAWvVjcngxiZYAADyc8vFu6aECKXmOEqlc6Yj8/e2Lgv5Hou5MTmRXdUSJno0aVTOjtwbJ0LCUH9kXXXnwAAA", dominant: "#080808", w: 2176, h: 1600 },
  "/themes/nairobi-dawn.webp": { lqip: "data:image/webp;base64,UklGRlYAAABXRUJQVlA4IEoAAACwAwCdASoUAA8APu1kqU2ppaQiMAgBMB2JZQCo9CHHNrwMHA8GAAD92CCrw4OK69ixwyxRNr0oAN4Rg4Ny1dQJksyRYjMo7JeAAA==", dominant: "#989898", w: 2176, h: 1600 },
  "/themes/paper.webp": { lqip: "data:image/webp;base64,UklGRjIAAABXRUJQVlA4ICYAAACwAgCdASoUAAwAPu1iqU2ppaOiMAgBMB2JaQAAeyAA/vB6K2cgAA==", dominant: "#f8f8f8", w: 2560, h: 1600 },
  "/themes/savannah.webp": { lqip: "data:image/webp;base64,UklGRlQAAABXRUJQVlA4IEgAAABQAwCdASoUAAwAPu1iqU2ppaQiMAgBMB2JagCdMoAEZxAMIgD+6YA/ePMug76ktUlAt/tT5NOD6a9bu+h9Xg8s70fKph1AAAA=", dominant: "#b83828", w: 2560, h: 1600 },
  "/themes/sunset-silhouette.webp": { lqip: "data:image/webp;base64,UklGRloAAABXRUJQVlA4IE4AAADwAwCdASoUAAwAPu1iqU2ppaQiMAgBMB2JaACdACHe0FVvu270/xq4AP7o1qJdNfZmOw3B3l9i222uMXcT8Xds2w4J+GJHJt8diKm0AAA=", dominant: "#080808", w: 2560, h: 1600 },
  "/themes/tea-fields.webp": { lqip: "data:image/webp;base64,UklGRooAAABXRUJQVlA4IH4AAAAwBQCdASoUABwAPu1krE+ppSQiMBgIATAdiUAUu3gQHIsNlahq5jo+9jXkR9vzN6UZAAD9JdqhQc1LcbjGU9bsuUcTWCE0ButWAIXmlOcZjwdYewDMzMtSutcaR+Nfsb1Nns6vroDjqphrFgVnx5aRCQOm28C7imQmETcAAAA=", dominant: "#081808", w: 1152, h: 1600 },
};

export const metaFor = (src: string | null | undefined): MediaMeta | null => (src ? MEDIA[src] ?? null : null);
