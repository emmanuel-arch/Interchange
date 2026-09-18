import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

// The public face: landing, developer docs, the sample gallery and document
// verification. Nothing in this group reads the Registry, so it renders on a
// deployment that has no database — which is exactly what the preview is.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col bg-[#040605] text-white">
      <div aria-hidden className="pointer-events-none fixed inset-0 site-grid opacity-60" />
      <div
        aria-hidden
        className="pointer-events-none fixed -top-40 left-1/2 h-[520px] w-[900px] max-w-[140vw] -translate-x-1/2 rounded-full bg-emerald-500/[0.07] blur-[120px]"
      />
      <SiteHeader />
      <main className="relative z-10 flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
