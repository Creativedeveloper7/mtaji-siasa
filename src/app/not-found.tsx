import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <section className="container-narrow flex min-h-[50vh] flex-col items-center justify-center py-20 text-center">
      <p className="meta-label text-accent">404</p>
      <h1 className="mt-3 text-h1 text-ink">Page not found</h1>
      <p className="mt-3 text-body text-ink-muted">
        The page you requested is not part of this prototype.
      </p>
      <div className="mt-8 flex gap-3">
        <Button href="/">Home</Button>
        <Button href="/leaders" variant="outline">
          Explore Leaders
        </Button>
      </div>
      <Link href="/projects" className="mt-6 text-small text-ink-subtle hover:text-ink">
        Or browse projects
      </Link>
    </section>
  );
}
