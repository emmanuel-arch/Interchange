import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Hero from "@/components/landing/Hero";
import PerformanceTicker from "@/components/landing/PerformanceTicker";
import BacktestCarousel from "@/components/landing/BacktestCarousel";
import HowItWorks from "@/components/landing/HowItWorks";
import WaitlistForm from "@/components/landing/WaitlistForm";
import TrustSignals from "@/components/landing/TrustSignals";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <PerformanceTicker />
        <BacktestCarousel />
        <HowItWorks />
        <TrustSignals />
        <WaitlistForm />
      </main>
      <Footer className="border-t" />
    </div>
  );
}
