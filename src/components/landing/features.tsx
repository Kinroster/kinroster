import { Mic, CheckSquare, FileText, ArrowRight } from "lucide-react";

const products = [
  {
    id: "voice-ai",
    icon: Mic,
    tag: "Voice AI",
    title: "Answers when you need them",
    description:
      "Ask your AI companion anything about care routines, medications, symptoms, or best practices — in plain language, any time of day or night. No hold music. No waiting.",
    bullets: [
      "Natural voice conversations, no typing needed",
      "Understands care context and medical terminology",
      "Follows up to ensure nothing is missed",
      "Available 24/7, even offline via app",
    ],
    href: "#voice-ai",
    gradient: "from-primary/20 to-primary/5",
    glow: "group-hover:shadow-primary/20",
  },
  {
    id: "task-management",
    icon: CheckSquare,
    tag: "Task Management",
    title: "Stay on top of every care task",
    description:
      "Create, assign, and track daily care routines across your whole team. Get reminders, log completions, and see at a glance what's done and what's coming up.",
    bullets: [
      "Daily and recurring task scheduling",
      "Team assignments with completion tracking",
      "Smart reminders before tasks are due",
      "Handoff summaries for shift changes",
    ],
    href: "#task-management",
    gradient: "from-cyan-500/20 to-cyan-500/5",
    glow: "group-hover:shadow-cyan-500/20",
  },
  {
    id: "doctor-reports",
    icon: FileText,
    tag: "Doctor Reports",
    title: "Professional reports in seconds",
    description:
      "Kinroster turns your voice notes and care logs into structured clinical summaries ready to share with your doctor — saving hours of manual write-up every week.",
    bullets: [
      "Auto-generated from your daily logs",
      "Formatted for physician review",
      "Shareable link with access controls",
      "Covers mood, nutrition, mobility, medications",
    ],
    href: "#doctor-reports",
    gradient: "from-violet-500/20 to-violet-500/5",
    glow: "group-hover:shadow-violet-500/20",
  },
];

export function Features() {
  return (
    <section id="features" className="py-20 md:py-28 scroll-mt-16">
      <div className="container mx-auto px-4">
        {/* Section header */}
        <div className="mb-14 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-muted-foreground">
            <span>Everything caretakers need</span>
          </div>
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground md:text-5xl">
            Three tools. One platform.
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground md:text-lg">
            Kinroster combines voice AI, task management, and clinical reporting
            into a single app designed for the way caretakers actually work.
          </p>
        </div>

        {/* Product cards */}
        <div className="grid gap-6 md:grid-cols-3">
          {products.map((product) => {
            const Icon = product.icon;
            return (
              <a
                key={product.id}
                href={product.href}
                className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${product.gradient} p-7 transition-all duration-300 hover:border-white/20 hover:shadow-xl ${product.glow}`}
              >
                {/* Tag */}
                <div className="mb-5 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {product.tag}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100" />
                </div>

                {/* Icon */}
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-foreground">
                  <Icon className="h-6 w-6" />
                </div>

                {/* Content */}
                <h3 className="mb-3 text-xl font-semibold text-foreground">
                  {product.title}
                </h3>
                <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
                  {product.description}
                </p>

                {/* Bullets */}
                <ul className="space-y-2">
                  {product.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2 text-sm">
                      <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span className="text-muted-foreground">{bullet}</span>
                    </li>
                  ))}
                </ul>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
