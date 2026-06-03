"use client";

import { useEffect, useMemo, useState } from "react";

import { apiRequest } from "@/lib/api";
import type { CharacterDef } from "@/app/components/game/types";

// In-memory cache shared across hook instances within a single page session.
// The roster is static for the duration of a match; refetching on every
// component mount is wasteful.
let cache: CharacterDef[] | null = null;
let inflight: Promise<CharacterDef[]> | null = null;

async function fetchRoster(): Promise<CharacterDef[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const res = await apiRequest("/characters", { method: "GET" });
    if (!res.ok) throw new Error(`Failed to load roster (${res.status})`);
    const data = (await res.json()) as CharacterDef[];
    cache = data;
    return data;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export function useCharacterRoster() {
  const [roster, setRoster] = useState<CharacterDef[] | null>(cache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cache) {
      setRoster(cache);
      return;
    }
    let alive = true;
    fetchRoster()
      .then((data) => {
        if (alive) setRoster(data);
      })
      .catch((err) => {
        if (alive) setError(err?.message ?? "Failed to load roster");
      });
    return () => {
      alive = false;
    };
  }, []);

  const byId = useMemo(() => {
    const map = new Map<string, CharacterDef>();
    if (roster) for (const c of roster) map.set(c.id, c);
    return map;
  }, [roster]);

  return { roster, byId, error, isLoading: roster === null && error === null };
}
