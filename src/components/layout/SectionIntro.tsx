import type { ReactNode } from "react";

export function SectionIntro({
  id,
  eyebrow,
  title,
  body,
  action,
}: {
  id?: string;
  eyebrow: string;
  title: ReactNode;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={id} className="home-h2 mt-5">
          {title}
        </h2>
        {body && (
          <p className="mt-4 text-small leading-relaxed text-ink-muted md:text-body">{body}</p>
        )}
      </div>
      {action}
    </div>
  );
}
