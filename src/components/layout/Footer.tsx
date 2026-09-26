import Link from "next/link";
import { Logo } from "./Logo";

const columns = [
  {
    title: "Explore",
    links: [
      { href: "/leaders", label: "Leaders" },
      { href: "/projects", label: "Projects" },
      { href: "/opportunities", label: "Opportunities" },
      { href: "/media", label: "Media" },
      { href: "/polls", label: "Polls" },
      { href: "/adly", label: "Adly" },
    ],
  },
  {
    title: "Engage",
    links: [
      { href: "/signup", label: "Create account" },
      { href: "/#faida", label: "Connect with Faida" },
      { href: "/adly", label: "Open Adly" },
    ],
  },
  {
    title: "About",
    links: [
      { href: "/#platform", label: "How it works" },
      { href: "/#ai-gis", label: "AI + GIS" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-bg-elevated">
      <div className="container-wide section-y-sm">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-sm text-small text-ink-muted">
              Civic visibility for leaders, projects and citizens — powered by
              GIS evidence and WhatsApp engagement through Faida.
            </p>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <p className="meta-label">{col.title}</p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.href + link.label}>
                    <Link
                      href={link.href}
                      className="text-small text-ink-muted transition-colors hover:text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-border pt-6 text-caption text-ink-subtle md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} M-Taji Siasa. Demo prototype.</p>
          <p>Fictional leaders and projects for demonstration only.</p>
        </div>
      </div>
    </footer>
  );
}
