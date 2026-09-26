import type { AdlyContent } from "@/types/adly";
import { createSeedAdlyContent } from "@/data/adly";
import { readJson, writeJson } from "@/lib/store";

export const ADLY_STORAGE_KEY = "mtaji-siasa-adly-v1";

export function loadAdlyContent(): AdlyContent {
  const seed = createSeedAdlyContent();
  const stored = readJson<AdlyContent | null>(ADLY_STORAGE_KEY, null);
  if (
    stored?.campaigns?.length &&
    Array.isArray(stored.creatives) &&
    Array.isArray(stored.insights)
  ) {
    return stored;
  }
  writeJson(ADLY_STORAGE_KEY, seed);
  return seed;
}

export function saveAdlyContent(content: AdlyContent) {
  writeJson(ADLY_STORAGE_KEY, content);
}
