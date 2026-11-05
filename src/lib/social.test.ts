import { describe, expect, it } from "vitest";
import { socialEntries, socialHandle, socialHref } from "@/lib/social";

describe("socialHref", () => {
  it("keeps full links", () => {
    expect(socialHref("website", "https://www.onurik.space")).toBe("https://www.onurik.space");
    expect(socialHref("x", "https://linktr.ee/jane")).toBe("https://linktr.ee/jane");
  });

  it("turns handles into each network's address", () => {
    expect(socialHref("x", "@jasonmaina")).toBe("https://x.com/jasonmaina");
    expect(socialHref("instagram", "jason.maina")).toBe("https://www.instagram.com/jason.maina");
    expect(socialHref("tiktok", "@jason_maina")).toBe("https://www.tiktok.com/@jason_maina");
    expect(socialHref("facebook", "JasonMainaKabete")).toBe("https://www.facebook.com/JasonMainaKabete");
  });

  it("adds https:// to links typed without it", () => {
    expect(socialHref("x", "twitter.com/jasonmaina")).toBe("https://twitter.com/jasonmaina");
    expect(socialHref("tiktok", "tiktok.com/@jason")).toBe("https://tiktok.com/@jason");
    expect(socialHref("website", "onurik.space")).toBe("https://onurik.space");
  });

  it("turns a Kenyan phone number into a WhatsApp link", () => {
    expect(socialHref("whatsapp", "0712 345 678")).toBe("https://wa.me/254712345678");
    expect(socialHref("whatsapp", "+254 712 345678")).toBe("https://wa.me/254712345678");
    expect(socialHref("whatsapp", "wa.me/254712345678")).toBe("https://wa.me/254712345678");
  });

  it("refuses what can't be a link", () => {
    expect(socialHref("x", "javascript:alert(1)")).toBeUndefined();
    expect(socialHref("website", "not a site")).toBeUndefined();
    expect(socialHref("x", "@way_too_long_for_an_x_handle")).toBeUndefined();
    expect(socialHref("whatsapp", "12")).toBeUndefined();
  });
});

describe("socialHandle / socialEntries", () => {
  it("labels links for display", () => {
    expect(socialHandle("x", "https://x.com/jasonmaina")).toBe("@jasonmaina");
    expect(socialHandle("tiktok", "https://www.tiktok.com/@jason")).toBe("@jason");
    expect(socialHandle("website", "https://www.onurik.space/")).toBe("onurik.space");
    expect(socialEntries({ website: "https://www.onurik.space", x: "@jasonmaina", instagram: "" }).map((e) => e.key)).toEqual(["x", "website"]);
  });
});
