import { describe, expect, it } from "vitest";
import { restrictAccountScopeToOrganization } from "./organization";

describe("restrictAccountScopeToOrganization", () => {
  it("limits unrestricted users to organization accounts", () => {
    expect(restrictAccountScopeToOrganization(null, ["emro-1", "emro-2"])).toEqual(["emro-1", "emro-2"]);
  });

  it("intersects user and organization scopes", () => {
    expect(restrictAccountScopeToOrganization(["emro-2", "sana-1"], ["emro-1", "emro-2"])).toEqual(["emro-2"]);
  });
});
