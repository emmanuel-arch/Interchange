import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const DESCRIPTION =
  "Consent-gated data exchange for Kenyan lenders. Brokered, never pooled — identity is destroyed at the edge before anything crosses a boundary.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.INTERCHANGE_PUBLIC_ORIGIN ?? "https://interchange.servicesuitecloud.com"),
  // "%s · Interchange" on every child page, and the bare name on this one, so a
  // tab reads "Cashflow & Affordability · Interchange" rather than repeating
  // the product name twice.
  title: { default: "Interchange", template: "%s · Interchange" },
  applicationName: "Interchange",
  description: DESCRIPTION,
  // The tab and home-screen icons are app/icon.png and app/apple-icon.png,
  // which Next serves by file convention. They are generated from the supplied
  // artwork by scripts/build-brand-assets.ts — never hand-cut.
  openGraph: {
    siteName: "Interchange",
    type: "website",
    locale: "en_KE",
    title: "Interchange · Data Exchange Platform",
    description: DESCRIPTION,
    images: [{ url: "/brand/og-1200x630.png", width: 1200, height: 630, alt: "Interchange — Data Exchange Platform, X-Road Architecture" }],
  },
  twitter: { card: "summary_large_image", title: "Interchange", description: DESCRIPTION, images: ["/brand/og-1200x630.png"] },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
