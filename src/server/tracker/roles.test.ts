import { describe, expect, it } from "vitest";
import { normalizeUserType, signUpMetadata, siasaRoleFor } from "@/server/tracker/roles";

describe("siasaRoleFor", () => {
  it.each([
    [{ userType: "individual" }, "citizen"],
    [{ userType: "organization" }, "organization"],
    [{ userType: "government" }, "organization"],
    [{ userType: "political_figure", figureStatus: "active" }, "leader"],
    [{ userType: "political_figure", figureStatus: "seeking_reelection" }, "leader"],
    [{ userType: "political_figure", figureStatus: "aspirant" }, "aspirant"],
    [{ userType: "political_figure" }, "leader"],
    [{ userType: "political_figure", siasaRole: "aspirant" }, "aspirant"],
    [{}, "citizen"],
  ] as const)("maps %j to %s", (facts, role) => {
    expect(siasaRoleFor(facts)).toBe(role);
  });

  it("makes admin only from app_metadata.role", () => {
    expect(siasaRoleFor({ appRole: "admin", userType: "individual" })).toBe("admin");
    // user_metadata (siasa_role) and profiles.role are user-editable and never grant admin.
    expect(siasaRoleFor({ userType: "individual", siasaRole: "admin" })).toBe("citizen");
    expect(siasaRoleFor({ userType: "admin" })).toBe("citizen");
  });

  it("lets a political_figures row win over the sign-up choice", () => {
    expect(
      siasaRoleFor({ userType: "political_figure", figureStatus: "active", siasaRole: "aspirant" })
    ).toBe("leader");
  });

  it("ignores siasa_role for non-politicians", () => {
    expect(siasaRoleFor({ userType: "individual", siasaRole: "aspirant" })).toBe("citizen");
  });
});

describe("normalizeUserType", () => {
  it("follows the Tracker handle_new_user trigger", () => {
    expect(normalizeUserType("Political_Figure")).toBe("political_figure");
    expect(normalizeUserType("politician")).toBe("political_figure");
    expect(normalizeUserType("citizen")).toBe("individual");
    expect(normalizeUserType("ministry")).toBe("government");
    expect(normalizeUserType("ngo")).toBe("organization");
    expect(normalizeUserType("something-else")).toBe("individual");
    expect(normalizeUserType(undefined)).toBeUndefined();
  });
});

describe("signUpMetadata", () => {
  const base = { fullName: "Wanjiru Kamau", phone: "+254700000001" };

  it.each([
    ["citizen", "individual"],
    ["leader", "political_figure"],
    ["aspirant", "political_figure"],
    ["organization", "organization"],
  ] as const)("maps %s to user_type %s", (role, userType) => {
    expect(signUpMetadata({ ...base, role })).toEqual({
      full_name: "Wanjiru Kamau",
      phone: "+254700000001",
      user_type: userType,
      siasa_role: role,
    });
  });

  it("never signs anyone up as admin", () => {
    const metadata = signUpMetadata({ ...base, role: "admin" });
    expect(metadata.user_type).toBe("individual");
    expect(metadata.siasa_role).toBe("citizen");
    expect(Object.values(metadata)).not.toContain("admin");
  });
});
