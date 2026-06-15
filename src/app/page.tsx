import type { Metadata } from "next";
import { LandingHeader } from "@/components/landing/header";
import { HeroSection } from "@/components/landing/hero-section";
import { StatsSection } from "@/components/landing/stats-section";
import { Features } from "@/components/landing/features";
import { FeatureDetails } from "@/components/landing/feature-details";
import { Testimonials } from "@/components/landing/testimonials";
import { WaitlistSection } from "@/components/landing/waitlist-section";
import { Footer } from "@/components/landing/footer";

export const metadata: Metadata = {
  title: "Kinroster — Voice AI for Caretakers",
  description:
    "Get answers from a voice AI anytime, manage care tasks effortlessly, and generate reports for your doctor in seconds. Built for caretakers.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Kinroster — Voice AI for Caretakers",
    description:
      "Get answers from a voice AI anytime, manage care tasks effortlessly, and generate reports for your doctor in seconds.",
    url: "/",
    type: "website",
  },
  twitter: {
    title: "Kinroster — Voice AI for Caretakers",
    description:
      "Get answers from a voice AI anytime, manage care tasks effortlessly, and generate reports for your doctor in seconds.",
  },
};

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingHeader />
      <main>
        <HeroSection />
        <StatsSection />
        <Features />
        <FeatureDetails />
        <Testimonials />
        <WaitlistSection />
      </main>
      <Footer />
    </div>
  );
}
