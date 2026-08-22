"use client";

import { useState, useMemo } from "react";

type WizardStep = "url" | "mapping" | "preview" | "decisions" | "confirm" | "result";

interface DuplicateInfo {
  rowIndex: number;
  normalizedTitle: string;
  title: string;
  candidates: Array<{ programId: string; title: string }>;
}

interface RowPreview {
  rowIndex: number;
  title: string;
  normalizedTitle: string;
  cells: Array<{ column: number; raw: string; mapped: unknown }>;
}

interface PreviewData {
  previewId: string;
  token: string;
  csvHash: string;
  mapping: unknown;
  mappingDetails: unknown;
  duplicates: DuplicateInfo[];
  unknowns: Array<{ raw: string; row: number; column: number }>;
  rows: RowPreview[];
}

export default function ImportWizard() {
  const [step, setStep] = useState<WizardStep>("url");
  const [sheetUrl, setSheetUrl] = useState("");
  const [csvDirect, setCsvDirect] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [decisions, setDecisions] = useState<
    Record<number, { action: "skip" | "create" | "update"; programId?: string; skipCells: Record<string, boolean>; mappedValues: Record<string, unknown> }>
  >({});
  const [result, setResult] = useState<unknown>(null);

  const unresolved = useMemo(() => {
    if (!preview) return true;
    for (const row of preview.rows) {
      const dec = decisions[row.rowIndex];
      if (!dec) return true; // need decision per row
      if (dec.action === "update" && !dec.programId) return true;
      // unknowns for this row must be resolved
      const rowUnknowns = preview.unknowns.filter((u) => u.row === row.rowIndex + 1);
      for (const u of rowUnknowns) {
        const key = `${u.row}:${u.column}`;
        const alt = `${row.rowIndex}:${u.column}`;
        const skip = dec.skipCells[key] || dec.skipCells[alt];
        const mapped = dec.mappedValues[key] !== undefined || dec.mappedValues[alt] !== undefined;
        if (!skip && !mapped) return true;
      }
      // duplicate update without selection
      const dup = preview.duplicates.find((d) => d.rowIndex === row.rowIndex);
      if (dup && dec.action === "update" && !dec.programId) return true;
    }
    return false;
  }, [preview, decisions]);

  async function handlePreview() {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (sheetUrl.trim()) body.sheetUrl = sheetUrl.trim();
      else if (csvDirect.trim()) body.csv = csvDirect;
      else throw new Error("آدرس شیت یا CSV را وارد کنید.");

      const res = await fetch("/api/workflow/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "خطا در پیش‌نمایش");
      const data: PreviewData = json.data;
      setPreview(data);
      // init decisions default skip for duplicates
      const init: typeof decisions = {};
      for (const row of data.rows) {
        const dup = data.duplicates.find((d) => d.rowIndex === row.rowIndex);
        if (dup) init[row.rowIndex] = { action: "skip", skipCells: {}, mappedValues: {} };
        else init[row.rowIndex] = { action: "create", skipCells: {}, mappedValues: {} };
      }
      setDecisions(init);
      setStep("preview");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCommit() {
    if (!preview) return;
    setLoading(true);
    setError(null);
    try {
      const rows = preview.rows.map((r) => {
        const dec = decisions[r.rowIndex];
        return {
          rowIndex: r.rowIndex,
          action: dec.action,
          programId: dec.programId,
          skipCells: dec.skipCells,
          mappedValues: dec.mappedValues,
        };
      });
      const res = await fetch("/api/workflow/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: preview.token, rows }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "خطا در ورود");
      setResult(json.data);
      setStep("result");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6" dir="rtl">
      <h1 className="text-2xl font-bold">ورود از Google Sheet</h1>

      {/* Step indicator */}
      <div className="flex gap-2 text-sm">
        {(["url", "preview", "decisions", "confirm", "result"] as WizardStep[]).map((s) => (
          <span key={s} className={`px-3 py-1 rounded-full ${step === s ? "bg-black text-white" : "bg-gray-100"}`}>
            {s === "url" ? "آدرس شیت" : s === "preview" ? "پیش‌نمایش" : s === "decisions" ? "تصمیمات" : s === "confirm" ? "تأیید" : "نتیجه"}
          </span>
        ))}
      </div>

      {error && <div className="bg-red-50 text-red-700 p-3 rounded border border-red-200">{error}</div>}

      {step === "url" && (
        <section className="space-y-4 border rounded-xl p-6 bg-white">
          <h2 className="font-semibold">۱. آدرس Google Sheet</h2>
          <p className="text-sm text-gray-600">فقط آدرس‌های عمومی docs.google.com پذیرفته می‌شوند. پیش‌نمایش هیچ داده عملیاتی ایجاد نمی‌کند.</p>
          <input
            placeholder="https://docs.google.com/spreadsheets/d/..."
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            className="w-full border rounded-lg px-3 py-2"
            dir="ltr"
          />
          <details className="text-sm">
            <summary className="cursor-pointer text-gray-700">یا CSV مستقیم (برای تست)</summary>
            <textarea
              placeholder={"نام برنامه,ریلز ۱ در تلگرام\nفرات قسمت 31,کامل"}
              value={csvDirect}
              onChange={(e) => setCsvDirect(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 mt-2 min-h-[120px]"
            />
          </details>
          <button onClick={handlePreview} disabled={loading || (!sheetUrl.trim() && !csvDirect.trim())} className="bg-black text-white px-6 py-2 rounded-lg disabled:opacity-50">
            {loading ? "در حال دریافت..." : "نمایش پیش‌نمایش"}
          </button>
        </section>
      )}

      {step === "preview" && preview && (
        <section className="space-y-4 border rounded-xl p-6 bg-white">
          <h2 className="font-semibold">۲. نگاشت ستون‌ها</h2>
          <pre className="bg-gray-50 p-3 rounded text-xs overflow-auto max-h-40" dir="ltr">{JSON.stringify(preview.mappingDetails, null, 2)}</pre>
          <button onClick={() => setStep("decisions")} className="border px-4 py-2 rounded-lg">مرحله بعد: تصمیمات</button>

          <h2 className="font-semibold mt-6">۳. پیش‌نمایش تمام ردیف‌ها</h2>
          <div className="overflow-auto border rounded">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 text-right">#</th>
                  <th className="p-2 text-right">عنوان</th>
                  <th className="p-2 text-right">وضعیت‌ها</th>
                  <th className="p-2 text-right">هشدار</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => {
                  const dup = preview.duplicates.find((d) => d.rowIndex === row.rowIndex);
                  const unknowns = preview.unknowns.filter((u) => u.row === row.rowIndex + 1);
                  return (
                    <tr key={row.rowIndex} className="border-t">
                      <td className="p-2">{row.rowIndex + 1}</td>
                      <td className="p-2">{row.title} <span className="text-gray-500 text-xs">({row.normalizedTitle})</span></td>
                      <td className="p-2">{row.cells.map((c) => `${c.raw}`).join(" | ")}</td>
                      <td className="p-2">
                        {dup && <span className="text-amber-700 bg-amber-50 px-2 py-1 rounded text-xs">تکراری: {dup.candidates.map((c) => c.programId).join(",")}</span>}
                        {unknowns.length > 0 && <span className="text-red-700 bg-red-50 px-2 py-1 rounded text-xs">ناشناخته: {unknowns.map((u) => u.raw).join(",")}</span>}
                        {!dup && unknowns.length === 0 && <span className="text-green-700 text-xs">آماده</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button onClick={() => setStep("decisions")} className="bg-black text-white px-6 py-2 rounded-lg">رفتن به تصمیمات</button>
        </section>
      )}

      {step === "decisions" && preview && (
        <section className="space-y-4 border rounded-xl p-6 bg-white">
          <h2 className="font-semibold">۴. تصمیمات تکراری و ناشناخته</h2>
          <p className="text-sm text-gray-600">برای هر ردیف تکراری انتخاب برنامه الزامی است. سلول‌های ناشناخته باید نگاشت شوند یا پرش شوند.</p>
          <div className="space-y-3">
            {preview.rows.map((row) => {
              const dup = preview.duplicates.find((d) => d.rowIndex === row.rowIndex);
              const unknowns = preview.unknowns.filter((u) => u.row === row.rowIndex + 1);
              const dec = decisions[row.rowIndex];
              return (
                <div key={row.rowIndex} className="border rounded-lg p-3 space-y-2">
                  <div className="font-medium">{row.title} <span className="text-xs text-gray-500">ردیف {row.rowIndex + 1}</span></div>
                  {dup && (
                    <div className="flex gap-2 items-center">
                      <label className="text-sm">اقدام:</label>
                      <select
                        value={dec.action}
                        onChange={(e) => setDecisions((prev) => ({ ...prev, [row.rowIndex]: { ...prev[row.rowIndex], action: e.target.value as never } }))}
                        className="border rounded px-2 py-1 text-sm"
                      >
                        <option value="skip">پرش (پیش‌فرض)</option>
                        <option value="create">ایجاد جداگانه</option>
                        <option value="update">به‌روزرسانی وضعیت‌ها</option>
                      </select>
                      {dec.action === "update" && (
                        <select
                          value={dec.programId ?? ""}
                          onChange={(e) => setDecisions((prev) => ({ ...prev, [row.rowIndex]: { ...prev[row.rowIndex], programId: e.target.value } }))}
                          className="border rounded px-2 py-1 text-sm"
                        >
                          <option value="">انتخاب برنامه...</option>
                          {dup.candidates.map((c) => (
                            <option key={c.programId} value={c.programId}>
                              {c.title} ({c.programId})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                  {!dup && (
                    <div className="flex gap-2 items-center">
                      <label className="text-sm">اقدام:</label>
                      <select
                        value={dec.action}
                        onChange={(e) => setDecisions((prev) => ({ ...prev, [row.rowIndex]: { ...prev[row.rowIndex], action: e.target.value as never } }))}
                        className="border rounded px-2 py-1 text-sm"
                      >
                        <option value="create">ایجاد</option>
                        <option value="skip">پرش</option>
                      </select>
                    </div>
                  )}
                  {unknowns.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs text-red-600">سلول‌های ناشناخته:</div>
                      {unknowns.map((u) => {
                        const key = `${u.row}:${u.column}`;
                        const skipped = !!dec.skipCells[key];
                        return (
                          <div key={key} className="flex gap-2 items-center text-sm">
                            <span className="bg-gray-100 px-2 py-1 rounded">&quot;{u.raw}&quot; (ستون {u.column})</span>
                            <label className="flex items-center gap-1">
                              <input
                                type="checkbox"
                                checked={skipped}
                                onChange={(e) => setDecisions((prev) => ({ ...prev, [row.rowIndex]: { ...prev[row.rowIndex], skipCells: { ...prev[row.rowIndex].skipCells, [key]: e.target.checked } } }))}
                              />
                              پرش این سلول
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep("preview")} className="border px-4 py-2 rounded-lg">بازگشت</button>
            <button onClick={() => setStep("confirm")} className="border px-4 py-2 rounded-lg">مرحله تأیید</button>
          </div>
        </section>
      )}

      {step === "confirm" && preview && (
        <section className="space-y-4 border rounded-xl p-6 bg-white">
          <h2 className="font-semibold">۵. تأیید نهایی</h2>
          <p className="text-sm text-gray-600">پیش‌نمایش ذخیره‌شده با این توکن مصرف خواهد شد و شیت دوباره خوانده نمی‌شود.</p>
          <div className="text-xs bg-gray-50 p-3 rounded" dir="ltr">Preview ID: {preview.previewId} | Hash: {preview.csvHash.slice(0, 16)}...</div>
          {unresolved && <div className="text-sm text-red-600">برخی ردیف‌ها تصمیمات ناقص دارند. لطفاً همه موارد تکراری و ناشناخته را حل کنید.</div>}
          <div className="flex gap-2">
            <button onClick={() => setStep("decisions")} className="border px-4 py-2 rounded-lg">بازگشت</button>
            <button onClick={handleCommit} disabled={loading || unresolved} className="bg-black text-white px-6 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? "در حال ورود..." : "تأیید و ورود"}
            </button>
          </div>
        </section>
      )}

      {step === "result" && (
        <section className="space-y-4 border rounded-xl p-6 bg-white">
          <h2 className="font-semibold">۶. گزارش نتیجه</h2>
          <pre className="bg-gray-50 p-3 rounded text-xs overflow-auto" dir="ltr">{JSON.stringify(result, null, 2)}</pre>
          <button onClick={() => { setStep("url"); setPreview(null); setResult(null); setSheetUrl(""); setCsvDirect(""); }} className="border px-4 py-2 rounded-lg">ورود جدید</button>
        </section>
      )}
    </div>
  );
}
