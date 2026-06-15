import Link from "next/link";
import { Logo } from "@/components/logo";

const links = {
  Product: [
    { label: "Voice AI", href: "#voice-ai" },
    { label: "Task Management", href: "#task-management" },
    { label: "Doctor Reports", href: "#doctor-reports" },
  ],
  Company: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
    { label: "HIPAA Compliance", href: "/hipaa" },
    { label: "Support", href: "/support" },
  ],
  Account: [
    { label: "Sign In", href: "/login" },
    { label: "Create Account", href: "/signup" },
  ],
};

export function Footer() {
  return (
    <footer className="border-t border-white/8">
      <div className="container mx-auto px-4 py-14">
        <div className="grid gap-10 md:grid-cols-4">
          {/* Brand */}
          <div className="md:col-span-1">
            <Logo />
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Voice AI, task management, and doctor reports — built for the people who care for others.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(links).map(([group, items]) => (
            <div key={group}>
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group}
              </p>
              <ul className="space-y-2.5">
                {items.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/8 pt-8 md:flex-row">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Kinroster. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground">
            Built for caretakers. HIPAA-ready architecture.
          </p>
        </div>
      </div>
    </footer>
  );
}
