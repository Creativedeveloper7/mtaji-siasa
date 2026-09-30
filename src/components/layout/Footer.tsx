import Link from "next/link";
import { Logo } from "./Logo";

const links = [
  { href: "/leaders", label: "Leaders" },
  { href: "/projects", label: "Projects" },
  { href: "/opportunities", label: "Opportunities" },
  { href: "/media", label: "Media" },
  { href: "/polls", label: "Polls" },
  { href: "/adly", label: "Adly" },
];

export function Footer() {
  return (
    <footer className="bg-bg-soft py-12">
      <div className="container-wide flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
        <Logo />

        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-3">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-caption text-ink transition-colors hover:text-brand-green"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <p className="text-[11px] text-ink">Show the work. Bring people along.</p>
      </div>
    </footer>
  );
}
