import type { Metadata } from "next";
import {
  Caveat,
  DM_Sans,
  Instrument_Serif,
  JetBrains_Mono,
} from "next/font/google";
import { SiteShell } from "@/components/layout/SiteShell";
import { FaidaProvider } from "@/components/faida/FaidaProvider";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ContentProvider } from "@/components/content/ContentProvider";
import { themeInitScript } from "@/lib/theme-script";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "M-Taji Siasa — Campaigns, Projects & Opportunities for Leaders",
    template: "%s · M-Taji Siasa",
  },
  description:
    "M-Taji Siasa is an AI-powered digital media platform that enables leaders to showcase, communicate, and promote their development projects and vision through live GIS mapping, AI-powered simulations, and targeted social media advertising, while enabling young people to discover, track, and access opportunities within public projects.",
  icons: {
    icon: [{ url: "/mtaji-logo.png", type: "image/png" }],
    apple: [{ url: "/mtaji-logo.png", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${dmSans.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} ${caveat.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeProvider>
          <AuthProvider>
            <ContentProvider>
              <FaidaProvider>
                <SiteShell>{children}</SiteShell>
              </FaidaProvider>
            </ContentProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
