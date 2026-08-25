import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const pagePath = resolve(dirname(fileURLToPath(import.meta.url)), "../../app/(panel)/analytics/page.tsx");
const geoPath = resolve(dirname(fileURLToPath(import.meta.url)), "./GeoChart.tsx");
const audiencePath = resolve(dirname(fileURLToPath(import.meta.url)), "./AudienceChart.tsx");
const trafficPath = resolve(dirname(fileURLToPath(import.meta.url)), "./TrafficTable.tsx");
const searchPath = resolve(dirname(fileURLToPath(import.meta.url)), "./SearchTermsTable.tsx");
const retentionPath = resolve(dirname(fileURLToPath(import.meta.url)), "./RetentionChart.tsx");

describe("analytics tabs UI (Task 6)", () => {
  it('has tab "ترافیک" in page.tsx', () => {
    const content = readFileSync(pagePath, "utf8");
    expect(content).toContain("ترافیک");
  });

  it("has all 6 Persian tab labels", () => {
    const content = readFileSync(pagePath, "utf8");
    for (const label of ["نمای کلی", "ترافیک", "مخاطب", "جستجو", "ماندگاری", "درآمد"]) {
      expect(content, `missing tab ${label}`).toContain(label);
    }
  });

  it("persists tab via ?tab= query param", () => {
    const content = readFileSync(pagePath, "utf8");
    expect(content).toContain("searchParams.get(\"tab\")");
    expect(content).toContain("?tab=");
    // also check role tab present
    expect(content).toContain('role="tab"');
  });

  it("uses useSWR with dimension param per tab", () => {
    const content = readFileSync(pagePath, "utf8");
    expect(content).toContain("dimension=");
    expect(content).toContain("useSWR");
  });

  it("creates 5 dimension components with placeholder/empty state", () => {
    for (const p of [geoPath, audiencePath, trafficPath, searchPath, retentionPath]) {
      const c = readFileSync(p, "utf8");
      expect(c.length).toBeGreaterThan(50);
      expect(c).toContain("هنوز دیتایی");
    }
  });
});
