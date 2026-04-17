import { LandingHeader } from "@/components/landing/header"
import { Footer } from "@/components/landing/footer"

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <LandingHeader />
      <main className="flex-1 container mx-auto px-4 py-12 max-w-3xl">
        {children}
      </main>
      <Footer />
    </div>
  )
}
