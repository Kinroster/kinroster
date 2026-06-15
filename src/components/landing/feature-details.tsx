import { Mic, CheckSquare, FileText, Check } from "lucide-react";

const details = [
  {
    id: "voice-ai",
    tag: "Voice AI",
    icon: Mic,
    headline: "Your AI companion, always on call.",
    description:
      "Whether it's 2pm or 2am, Kinroster is ready to answer your care questions. Ask about medication interactions, document an observation, or just talk through what you noticed during a shift — the AI listens, responds, and helps you stay on top of it.",
    benefits: [
      "Conversational voice interface — no typing, no forms",
      "Understands care context, medications, and symptoms",
      "Asks clarifying questions to capture complete notes",
      "Available 24/7 with sub-second response times",
    ],
    visual: (
      <div className="relative rounded-2xl border border-white/10 bg-white/5 p-6">
        {/* Mock voice conversation UI */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary">
            <Mic className="h-4 w-4" />
          </div>
          <div className="h-2 w-32 rounded-full bg-primary/40" />
          <div className="h-2 w-16 rounded-full bg-primary/20" />
        </div>
        <div className="space-y-3">
          <div className="flex justify-end">
            <div className="max-w-[200px] rounded-2xl rounded-tr-sm bg-primary/20 px-4 py-2.5 text-xs text-foreground">
              Margaret seemed a bit confused after lunch today and didn&apos;t finish her meal.
            </div>
          </div>
          <div className="flex justify-start">
            <div className="max-w-[220px] rounded-2xl rounded-tl-sm bg-white/8 px-4 py-2.5 text-xs text-muted-foreground">
              Got it. Did she have any trouble recognizing family members or staff during the visit?
            </div>
          </div>
          <div className="flex justify-end">
            <div className="max-w-[180px] rounded-2xl rounded-tr-sm bg-primary/20 px-4 py-2.5 text-xs text-foreground">
              No, she knew everyone. Just seemed tired.
            </div>
          </div>
          <div className="flex justify-start">
            <div className="max-w-[220px] rounded-2xl rounded-tl-sm bg-white/8 px-4 py-2.5 text-xs text-muted-foreground">
              Noted. I&apos;ve logged this under mood and nutrition. Should I flag it for the doctor report?
            </div>
          </div>
        </div>
        {/* Recording indicator */}
        <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/5 py-3">
          <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          <span className="text-xs text-primary">Listening...</span>
        </div>
      </div>
    ),
  },
  {
    id: "task-management",
    tag: "Task Management",
    icon: CheckSquare,
    headline: "Every task, every shift, nothing missed.",
    description:
      "Build care routines once and Kinroster handles the rest — reminding your team, tracking completions, and generating handoff summaries automatically. No more sticky notes or text chains to keep everyone in sync.",
    benefits: [
      "Daily routines with recurring schedules",
      "Assign tasks to specific team members",
      "Automatic shift handoff summaries",
      "Completion tracking with time stamps and notes",
    ],
    visual: (
      <div className="relative rounded-2xl border border-white/10 bg-white/5 p-6">
        {/* Mock task list UI */}
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Today&apos;s Tasks</span>
          <span className="rounded-full bg-primary/20 px-2.5 py-0.5 text-xs text-primary">4 of 7 done</span>
        </div>
        <div className="space-y-2">
          {[
            { label: "Morning medications", done: true, time: "8:00 AM" },
            { label: "Breakfast assistance", done: true, time: "8:30 AM" },
            { label: "Physical therapy exercises", done: true, time: "10:00 AM" },
            { label: "Vitals check", done: true, time: "12:00 PM" },
            { label: "Afternoon walk", done: false, time: "3:00 PM" },
            { label: "Evening medications", done: false, time: "6:00 PM" },
            { label: "Shift handoff notes", done: false, time: "7:00 PM" },
          ].map((task) => (
            <div
              key={task.label}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                task.done ? "bg-primary/10" : "bg-white/5"
              }`}
            >
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  task.done
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-white/20"
                }`}
              >
                {task.done && <Check className="h-3 w-3" />}
              </div>
              <span
                className={`flex-1 text-xs ${
                  task.done ? "text-muted-foreground line-through" : "text-foreground"
                }`}
              >
                {task.label}
              </span>
              <span className="text-xs text-muted-foreground">{task.time}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "doctor-reports",
    tag: "Doctor Reports",
    icon: FileText,
    headline: "Reports your doctor will actually read.",
    description:
      "Stop spending an hour writing summaries before appointments. Kinroster pulls from your daily voice notes and task logs to generate a structured clinical report — formatted, organized, and ready to share in seconds.",
    benefits: [
      "Auto-generated from voice notes and care logs",
      "Covers mood, nutrition, mobility, and medications",
      "Shareable via secure link with expiry controls",
      "Formatted to physician expectations — no translation needed",
    ],
    visual: (
      <div className="relative rounded-2xl border border-white/10 bg-white/5 p-6">
        {/* Mock report UI */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Weekly Care Summary</p>
            <p className="text-xs text-muted-foreground">Margaret T. · Jun 9–15, 2025</p>
          </div>
          <div className="rounded-full bg-green-500/20 px-2.5 py-0.5 text-xs text-green-400">
            Ready to share
          </div>
        </div>
        <div className="space-y-3">
          {[
            { label: "Mood & Cognition", value: "Generally positive; mild confusion noted Tue afternoon, resolved by evening.", color: "bg-primary/20" },
            { label: "Nutrition", value: "Eating well. Skipped lunch twice. Prefers soft foods in the morning.", color: "bg-cyan-500/20" },
            { label: "Mobility", value: "Daily walks completed 5/7 days. No falls reported this week.", color: "bg-violet-500/20" },
            { label: "Medications", value: "All doses administered on schedule. No adverse reactions observed.", color: "bg-green-500/20" },
          ].map((item) => (
            <div key={item.label} className="rounded-xl bg-white/5 p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <div className={`h-1.5 w-1.5 rounded-full ${item.color.replace("bg-", "bg-").replace("/20", "")}`} />
                <span className="text-xs font-medium text-foreground">{item.label}</span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{item.value}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <div className="flex-1 rounded-lg border border-primary/30 bg-primary/10 py-2 text-center text-xs font-medium text-primary">
            Copy share link
          </div>
          <div className="flex-1 rounded-lg border border-white/10 bg-white/5 py-2 text-center text-xs text-muted-foreground">
            Download PDF
          </div>
        </div>
      </div>
    ),
  },
];

export function FeatureDetails() {
  return (
    <section id="how-it-works" className="py-20 md:py-28 scroll-mt-16">
      <div className="container mx-auto px-4">
        <div className="mb-14 text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground md:text-5xl">
            See it in action
          </h2>
          <p className="mx-auto max-w-xl text-muted-foreground md:text-lg">
            Each feature is designed around the real workflow of a caretaker — not a hospital system.
          </p>
        </div>

        <div className="space-y-24 md:space-y-32">
          {details.map((feature, index) => {
            const Icon = feature.icon;
            const isReversed = index % 2 === 1;

            return (
              <div
                key={feature.id}
                id={feature.id}
                className={`flex flex-col items-center gap-12 scroll-mt-16 md:flex-row md:gap-16 ${
                  isReversed ? "md:flex-row-reverse" : ""
                }`}
              >
                {/* Visual */}
                <div className="w-full md:w-1/2">{feature.visual}</div>

                {/* Content */}
                <div className="w-full md:w-1/2">
                  <div className="mb-4 flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-medium uppercase tracking-wider text-primary">
                      {feature.tag}
                    </span>
                  </div>

                  <h3 className="mb-4 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                    {feature.headline}
                  </h3>

                  <p className="mb-6 leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>

                  <ul className="space-y-3">
                    {feature.benefits.map((benefit) => (
                      <li key={benefit} className="flex items-start gap-3 text-sm">
                        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                          <Check className="h-3 w-3" />
                        </div>
                        <span className="text-foreground">{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
