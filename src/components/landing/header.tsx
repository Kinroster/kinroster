import Link from "next/link";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { MobileMenuButton } from "./mobile-menu-button";

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/8 bg-background/80 backdrop-blur-xl">
      <div className="container relative mx-auto flex h-16 items-center justify-between px-4">
        <Logo />

        <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
          <a
            href="#features"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Features
          </a>
          <a
            href="#how-it-works"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            How it Works
          </a>
          <a
            href="#testimonials"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Reviews
          </a>
          <Link href="/login">
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
              <LogIn className="h-4 w-4" />
              Sign In
            </Button>
          </Link>
          <Link href="/signup">
            <Button size="sm" className="gap-2">
              Get Started
            </Button>
          </Link>
        </nav>

        <MobileMenuButton />
      </div>
    </header>
  );
}
