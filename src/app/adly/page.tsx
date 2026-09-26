import type { Metadata } from "next";
import { AdlyPublicPage } from "@/components/adly/public/AdlyPublicPage";

export const metadata: Metadata = {
  title: "Adly — AI-Powered Campaign & Development Intelligence | M-Taji Siasa",
  description:
    "Adly helps campaigns create, visualize, advertise and measure political and development stories through AI, GIS, creative production and advertising intelligence.",
};

export default function AdlyPublicRoute() {
  return <AdlyPublicPage />;
}
