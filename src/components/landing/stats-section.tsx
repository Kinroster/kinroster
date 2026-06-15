const stats = [
  { value: "2+", label: "Hours saved per caregiver daily" },
  { value: "24/7", label: "Voice AI always available" },
  { value: "3 min", label: "Average report generation time" },
  { value: "100%", label: "Audit-logged documentation" },
];

export function StatsSection() {
  return (
    <section className="border-y border-white/8 bg-white/2">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                {stat.value}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
