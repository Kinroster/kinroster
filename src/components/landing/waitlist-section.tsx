import { WaitlistForm } from "./waitlist-form";

export function WaitlistSection() {
  return (
    <section className="py-20 md:py-28">
      <div className="container mx-auto px-4">
        <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-10 text-center md:p-16">
          {/* Glow */}
          <div className="pointer-events-none absolute -right-32 -top-32 h-64 w-64 rounded-full bg-primary/20 blur-[80px]" />
          <div className="pointer-events-none absolute -bottom-32 -left-32 h-64 w-64 rounded-full bg-primary/10 blur-[80px]" />

          <div className="relative">
            <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground md:text-5xl">
              Start caring smarter today.
            </h2>
            <p className="mx-auto mb-10 max-w-xl text-muted-foreground md:text-lg">
              Join caretakers who are saving hours each week with voice AI, organized tasks,
              and reports their doctors actually read.
            </p>
            <WaitlistForm />
          </div>
        </div>
      </div>
    </section>
  );
}
