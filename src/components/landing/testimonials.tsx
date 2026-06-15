const testimonials = [
  {
    quote:
      "I used to spend my Sunday evenings writing up notes for Margaret's doctor. Now I just talk to Kinroster after each shift and the report is ready by Friday. It's given me my weekends back.",
    name: "Sandra K.",
    role: "Home caretaker, 8 years",
    initials: "SK",
  },
  {
    quote:
      "The voice AI actually understands what I'm describing. I said 'she seemed off today' and it asked the right follow-up questions to help me document what was really going on.",
    name: "David R.",
    role: "Family caretaker",
    initials: "DR",
  },
  {
    quote:
      "Our team of three shares care for my father-in-law. The task management means everyone knows what's been done and what's coming — no more overlap or missed medications.",
    name: "Priya M.",
    role: "Coordinating caretaker",
    initials: "PM",
  },
];

export function Testimonials() {
  return (
    <section id="testimonials" className="py-20 md:py-28 scroll-mt-16">
      <div className="container mx-auto px-4">
        <div className="mb-14 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-muted-foreground">
            <span>From the people who use it</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-5xl">
            Caretakers love it.
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="flex flex-col rounded-2xl border border-white/10 bg-white/5 p-7"
            >
              {/* Stars */}
              <div className="mb-5 flex gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <svg
                    key={i}
                    className="h-4 w-4 fill-primary text-primary"
                    viewBox="0 0 20 20"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>

              <blockquote className="flex-1 text-sm leading-relaxed text-muted-foreground">
                &ldquo;{t.quote}&rdquo;
              </blockquote>

              <div className="mt-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary">
                  {t.initials}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
