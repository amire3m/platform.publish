"use client";

import { useEffect, useState } from "react";
import type { BoardChannelId } from "./types";

const KEY = "board-report:avatars:v1";
const TTL_MS = 24 * 3600 * 1000;

/** Real YouTube avatars keyed by board channel id; missing → undefined/null (monogram fallback). */
export function useChannelAvatars(): Partial<Record<BoardChannelId, string | null>> {
  const [avatars, setAvatars] = useState<Partial<Record<BoardChannelId, string | null>>>({});

  useEffect(() => {
    let cancelled = false;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const cached = JSON.parse(raw) as { at?: number; urls?: Record<string, string | null> };
        if (cached?.at && Date.now() - cached.at < TTL_MS && cached.urls) {
          setAvatars(cached.urls as Partial<Record<BoardChannelId, string | null>>);
          return;
        }
      }
    } catch {
      // fetch fresh
    }
    (async () => {
      try {
        const res = await fetch("/api/board/channel-avatars");
        if (!res.ok) return;
        const body = (await res.json()) as { avatars?: Record<string, { url?: string | null }> };
        const urls: Record<string, string | null> = {};
        for (const [id, v] of Object.entries(body?.avatars ?? {})) urls[id] = v?.url ?? null;
        if (cancelled) return;
        setAvatars(urls as Partial<Record<BoardChannelId, string | null>>);
        try {
          localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), urls }));
        } catch {
          // private mode
        }
      } catch {
        // offline → monogram fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return avatars;
}
