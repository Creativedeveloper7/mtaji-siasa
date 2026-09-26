"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isChromeLess =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/dashboard") ||
    (pathname.startsWith("/adly/") && pathname !== "/adly");

  if (isChromeLess) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
