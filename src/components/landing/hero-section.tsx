import Link from "next/link";
import { Sparkles, ArrowRight, Mic, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden py-20 md:py-32">
      {/* Background gradient blobs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-64 -top-64 h-[600px] w-[600px] rounded-full bg-primary/15 blur-[120px]" />
        <div className="absolute -left-32 top-1/2 h-[400px] w-[400px] -translate-y-1/2 rounded-full bg-primary/8 blur-[100px]" />
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      <div className="container relative mx-auto px-4 text-center">
        {/* Badge */}
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Voice AI built for caretakers</span>
        </div>

        {/* Main Headline */}
        <h1 className="mx-auto mb-6 max-w-4xl text-balance text-5xl font-bold tracking-tight text-foreground md:text-7xl">
          Care smarter.
          <br />
          <span className="bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
            Always supported.
          </span>
        </h1>

        {/* Subheadline */}
        <p className="mx-auto mb-10 max-w-2xl text-pretty text-lg text-muted-foreground md:text-xl">
          Kinroster gives caretakers a voice AI to answer care questions anytime,
          tools to manage daily tasks, and auto-generated reports for their doctor —
          all in one place.
        </p>

        {/* CTAs */}
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/signup">
            <Button size="lg" className="gap-2 px-8 text-base">
              Get started free
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="#how-it-works">
            <Button size="lg" variant="outline" className="gap-2 px-8 text-base border-white/15 bg-white/5 hover:bg-white/10 text-foreground">
              <Mic className="h-4 w-4" />
              See how it works
            </Button>
          </Link>
        </div>

        {/* Trust indicators */}
        <div className="mt-14 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span>HIPAA-ready architecture</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <span>No credit card required</span>
          <div className="h-4 w-px bg-border" />
          <span>Set up in under 5 minutes</span>
        </div>
      </div>
    </section>
  );
}
