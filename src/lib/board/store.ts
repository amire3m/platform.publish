"use client";

import { useCallback, useEffect, useState } from "react";
import type { BoardDataset, CsvRow } from "./types";
import { demoRows } from "./demo";

const KEY = "board-report:dataset:v1";

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

/** Dataset state: demo until a CSV replaces it (persisted in localStorage). */
export function useBoardDataset() {
  const [dataset, setDataset] = useState<BoardDataset>({ rows: demoRows(), source: "demo" });

  useEffect(() => {
    const stored = readStored();
    if (stored && stored.rows.length) setDataset(stored);
  }, []);

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
    } catch {}
  }, []);

  return { dataset, replace, resetDemo };
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
