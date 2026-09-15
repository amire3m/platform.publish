"use client";

import { useCallback, useEffect, useState } from "react";
import type { BoardDataset, CsvRow } from "./types";
import { demoRows } from "./demo";

const KEY = "board-report:dataset:v1";
const LIVE_KEY = "board-report:live:v1";
const LIVE_TTL_MS = 6 * 3600 * 1000;

function readStored(): BoardDataset | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BoardDataset;
    if (!Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readLiveCache(): BoardDataset | null {
  try {
    const raw = localStorage.getItem(LIVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BoardDataset & { cachedAt?: number };
    if (!Array.isArray(parsed.rows) || !parsed.rows.length) return null;
    if (!parsed.cachedAt || Date.now() - parsed.cachedAt > LIVE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Dataset state: CSV override → live YouTube data → demo fallback. */
export function useBoardDataset() {
  const [dataset, setDataset] = useState<BoardDataset>({ rows: demoRows(), source: "demo" });
  const [liveLoading, setLiveLoading] = useState(false);

  const applyLive = useCallback(async (force = false) => {
    if (!force) {
      const cached = readLiveCache();
      if (cached) {
        setDataset(cached);
        return;
      }
    }
    setLiveLoading(true);
    try {
      const res = await fetch("/api/board/live-data");
      if (!res.ok) return;
      const body = (await res.json()) as {
        data?: { rows?: CsvRow[]; meta?: BoardDataset["liveMeta"] };
      };
      const rows = body?.data?.rows;
      if (!rows?.length) return;
      const next: BoardDataset = {
        rows,
        source: "live",
        loadedAt: new Date().toISOString(),
        liveMeta: body.data?.meta,
      };
      setDataset(next);
      try {
        localStorage.setItem(LIVE_KEY, JSON.stringify({ ...next, cachedAt: Date.now() }));
      } catch {}
    } catch {
      // offline → stay on demo/csv
    } finally {
      setLiveLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = readStored();
    if (stored && stored.rows.length) {
      setDataset(stored);
      return;
    }
    void applyLive(false);
  }, [applyLive]);

  const refreshLive = useCallback(() => applyLive(true), [applyLive]);

  const replace = useCallback((rows: CsvRow[], fileName: string) => {
    const next: BoardDataset = { rows, source: rows.some((r) => r.demo) ? "mixed" : "csv", fileName, loadedAt: new Date().toISOString() };
    setDataset(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const resetDemo = useCallback(() => {
    const next: BoardDataset = { rows: demoRows(), source: "demo" };
    setDataset(next);
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(LIVE_KEY);
    } catch {}
  }, []);

  return { dataset, replace, resetDemo, refreshLive, liveLoading };
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Print current view (browser print → PDF). */
export function printReport() {
  window.print();
}

/** Download an SVG chart node as PNG. */
export async function downloadSvgAsPng(svg: SVGSVGElement, filename: string, scale = 2): Promise<void> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const { width, height } = svg.getBoundingClientRect();
  clone.setAttribute("width", String(Math.max(1, Math.round(width * scale))));
  clone.setAttribute("height", String(Math.max(1, Math.round(height * scale))));
  const text = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([text], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("render"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = filename;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
