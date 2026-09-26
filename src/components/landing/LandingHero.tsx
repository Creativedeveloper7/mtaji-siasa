import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";

/** Cinematic GIS-style hero visualisation — original, not copied from M-Taji */
export function HeroGISVisual() {
  return (
    <div className="relative aspect-[4/5] w-full overflow-hidden rounded-lg border border-border bg-[#0f1916] sm:aspect-[5/4] lg:aspect-auto lg:min-h-[520px]">
      <div className="absolute inset-0 bg-grid-subtle opacity-60" />

      {/* Abstract satellite terrain */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 800 600"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <defs>
          <radialGradient id="terrain" cx="55%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#1f3d34" />
            <stop offset="55%" stopColor="#152820" />
            <stop offset="100%" stopColor="#0c1412" />
          </radialGradient>
          <linearGradient id="road" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4a4a40" stopOpacity="0.2" />
            <stop offset="50%" stopColor="#8a8570" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#4a4a40" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        <rect width="800" height="600" fill="url(#terrain)" />
        <path
          d="M0 320 C120 280, 200 360, 320 300 S520 240, 640 290 S760 350, 800 320"
          fill="none"
          stroke="url(#road)"
          strokeWidth="14"
        />
        <path
          d="M180 0 C200 140, 160 260, 220 600"
          fill="none"
          stroke="#3d4a40"
          strokeWidth="6"
          opacity="0.5"
        />
        <path
          d="M480 0 C500 180, 460 320, 520 600"
          fill="none"
          stroke="#3d4a40"
          strokeWidth="4"
          opacity="0.35"
        />
        {/* Project boundary */}
        <polygon
          points="360,220 520,200 560,320 400,360 340,290"
          fill="rgba(229,177,42,0.12)"
          stroke="#e5b12a"
          strokeWidth="2"
          strokeDasharray="6 4"
        />
        {/* Marker pulse */}
        <circle cx="440" cy="270" r="28" fill="rgba(229,177,42,0.15)">
          <animate
            attributeName="r"
            values="20;36;20"
            dur="2.8s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.5;0.15;0.5"
            dur="2.8s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="440" cy="270" r="7" fill="#e5b12a" stroke="#0b0b0b" strokeWidth="2" />
      </svg>

      {/* Overlay cards */}
      <div className="absolute left-4 top-4 space-y-2 sm:left-6 sm:top-6">
        <div className="rounded-md border border-border bg-bg/80 px-3 py-2.5 backdrop-blur-md animate-slide-up">
          <p className="meta-label">Project status</p>
          <div className="mt-1.5">
            <StatusBadge status="In Progress" tone="accent" pulse />
          </div>
        </div>
        <div
          className="rounded-md border border-border bg-bg/80 px-3 py-2.5 backdrop-blur-md animate-slide-up"
          style={{ animationDelay: "80ms" }}
        >
          <p className="meta-label">Location</p>
          <p className="mt-1 text-small text-ink">Kiambu County</p>
        </div>
      </div>

      <div
        className="absolute bottom-4 right-4 rounded-md border border-border bg-bg/80 px-4 py-3 backdrop-blur-md sm:bottom-6 sm:right-6 animate-slide-up"
        style={{ animationDelay: "140ms" }}
      >
        <p className="meta-label">Progress</p>
        <p className="mt-1 font-mono text-h2 text-accent">68%</p>
        <div className="mt-2 h-1 w-28 overflow-hidden rounded-full bg-surface-hover">
          <div className="h-full w-[68%] rounded-full bg-accent" />
        </div>
      </div>

      <div className="absolute bottom-4 left-4 rounded-md border border-success/30 bg-bg/80 px-3 py-2 backdrop-blur-md sm:bottom-6 sm:left-6">
        <p className="flex items-center gap-2 text-meta uppercase tracking-[0.06em] text-success">
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-soft" />
          Live GIS overlay
        </p>
      </div>
    </div>
  );
}

export function LandingHero() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(229,177,42,0.08),transparent_50%)]" />
      <div className="container-wide grid items-center gap-10 py-12 md:gap-12 md:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
        <div className="animate-slide-up">
          <p className="meta-label text-accent">Civic visibility platform</p>
          <h1 className="mt-4 max-w-xl text-display text-ink">
            See the work.{" "}
            <span className="editorial-serif text-accent">Shape the future.</span>
          </h1>
          <p className="mt-6 max-w-lg text-body text-ink-muted">
            M-Taji Siasa brings leaders, public projects and citizens together
            through AI-powered visibility, live GIS tracking and simple digital
            engagement.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="/leaders" size="lg">
              Explore Leaders
            </Button>
            <Button href="/projects" size="lg" variant="outline">
              Explore Projects
            </Button>
          </div>
        </div>
        <div className="animate-fade-in" style={{ animationDelay: "120ms" }}>
          <HeroGISVisual />
        </div>
      </div>
    </section>
  );
}
