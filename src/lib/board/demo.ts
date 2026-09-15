import type { CsvRow } from "./types";

/** Deterministic demo rows (flagged) until a real CSV is uploaded. */
export function demoRows(): CsvRow[] {
  const channels = [
    { channel: "زاویه نو", programs: [{ p: "فرات", w: 5 }, { p: "قابل توجه", w: 2 }, { p: "سایر", w: 1 }] },
    { channel: "ضد روایت", programs: [{ p: "پرونده اجتماعی", w: 2 }, { p: "سایر", w: 1 }] },
    { channel: "تماشین", programs: [{ p: "مشاور ۱", w: 3 }, { p: "سایر", w: 1 }] },
    { channel: "Iranian Frame", programs: [{ p: "سایر", w: 1 }] },
  ];
  const rows: CsvRow[] = [];
  let seed = 42;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const start = new Date("2026-04-01T00:00:00Z").getTime();
  for (const c of channels) {
    for (let v = 0; v < 10; v++) {
      const pick = rnd();
      let acc = 0;
      let program = c.programs[c.programs.length - 1].p;
      for (const pr of c.programs) {
        acc += pr.w / c.programs.reduce((s, x) => s + x.w, 0);
        if (pick <= acc) {
          program = pr.p;
          break;
        }
      }
      const views = Math.round(2000 + rnd() * (program === "فرات" ? 60000 : 15000));
      const subs = Math.round(views * (0.004 + rnd() * 0.01));
      const d = new Date(start + v * 13 * 86400000 + Math.round(rnd() * 5) * 86400000);
      rows.push({
        channel: c.channel,
        date: d.toISOString().slice(0, 10),
        videoTitle: `${program} — قسمت ${v + 1}`,
        program,
        contentType: program === "مشاور ۱" ? "سریال" : "گفت‌وگو",
        views,
        watchMinutes: Math.round(views * (2 + rnd() * 4)),
        avgViewSeconds: Math.round(120 + rnd() * 240),
        impressions: Math.round(views * (6 + rnd() * 6)),
        ctr: +(2 + rnd() * 6).toFixed(1),
        likes: Math.round(views * 0.03),
        comments: Math.round(views * 0.004),
        shares: Math.round(views * 0.002),
        subsGained: subs,
        subsLost: Math.round(subs * 0.08),
        subsTotal: null,
        monetized: "نامشخص",
        country: "ایران",
        trafficSource: "پیشنهاد یوتیوب",
        demo: true,
      });
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}
