"use client";

import { useState } from "react";
import { Button, ErrorState, Input, Label, Select } from "@/components/ui";
import { uploadFileResumable, type ResumableProgress, type ResumableResult } from "@/lib/media/chunked-upload-client";

export interface UploaderBinding {
  partId?: string | null;
  productId?: string | null;
  channel?: string | null;
  kind?: string | null;
}

const KINDS = [
  { value: "final", label: "نسخه نهایی" },
  { value: "highlight", label: "برش" },
  { value: "reel", label: "ریلز" },
  { value: "clean", label: "کلین" },
  { value: "cover", label: "کاور" },
  { value: "video", label: "ویدیو کامل" },
  { value: "report", label: "گزارش" },
];

export function ResumableUploader({
  binding,
  uploadFn = uploadFileResumable,
  onDone,
}: {
  binding: UploaderBinding;
  uploadFn?: typeof uploadFileResumable;
  onDone?: (result: ResumableResult) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState(binding.kind ?? "final");
  const [phase, setPhase] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [pct, setPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResumableResult | null>(null);

  async function start() {
    if (!file || phase === "uploading") return;
    setPhase("uploading");
    setPct(0);
    setError(null);
    try {
      const out = await uploadFn(file as never, { ...binding, kind } as never, {
        onProgress: (p: ResumableProgress) => setPct(p.totalChunks ? Math.round((p.sentChunks / p.totalChunks) * 100) : 0),
      } as never);
      setResult(out);
      setPhase("done");
      onDone?.(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "آپلود ناموفق بود.");
      setPhase("error");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Label>فایل (تا ۸ گیگابایت، resume خودکار)</Label>
        <Input
          type="file"
          accept="video/*,image/*"
          disabled={phase === "uploading"}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
            setError(null);
            if (phase === "done" || phase === "error") setPhase("idle");
          }}
        />
      </div>
      <div>
        <Label>نوع خروجی</Label>
        <Select value={kind} disabled={phase === "uploading"} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
      </div>
      {phase === "uploading" && (
        <div className="flex flex-col gap-1" aria-label="پیشرفت آپلود">
          <div className="h-2 overflow-hidden rounded-full bg-tg-hover">
            <div className="h-full rounded-full bg-tg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-tg-secondary">{pct}٪ ارسال شد</span>
        </div>
      )}
      {phase === "done" && result && (
        <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
          آپلود کامل شد — نسخه {result.version}
        </p>
      )}
      {phase === "error" && error && <ErrorState message={error} />}
      {(phase === "idle" || phase === "done") && (
        <Button disabled={!file} onClick={start}>
          شروع آپلود
        </Button>
      )}
      {phase === "error" && (
        <Button
          onClick={() => {
            setPhase("idle");
            setError(null);
            void start();
          }}
        >
          تلاش مجدد
        </Button>
      )}
    </div>
  );
}
