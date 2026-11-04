import { describe, expect, it } from "vitest";
import { endsMidSentence } from "@/lib/ad-text";

describe("endsMidSentence", () => {
  it("flags text cut off mid-sentence", () => {
    expect(endsMidSentence("…through civic engagement, strategic")).toBe(true);
    expect(endsMidSentence("See the plan")).toBe(true);
  });

  it("accepts finished text", () => {
    expect(endsMidSentence("See the plan.")).toBe(false);
    expect(endsMidSentence("Join us!")).toBe(false);
    expect(endsMidSentence("Read more: https://www.m-taji.co.ke/projects/faida")).toBe(false);
    expect(endsMidSentence("")).toBe(false);
  });
});
