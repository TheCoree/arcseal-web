import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Derive backend origin from NEXT_PUBLIC_API_URL (e.g. http://localhost:8000/api/v1 -> http://localhost:8000).
function getBackendOrigin(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
  try {
    return new URL(apiUrl).origin;
  } catch {
    return "http://localhost:8000";
  }
}

// Server returns avatar paths as "/uploads/avatars/...". Prefix the backend origin
// so the browser fetches them from the API host rather than the frontend host.
export function absolutizeAvatarUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${getBackendOrigin()}${url}`;
}

// Generic version used for character portraits / ability icons. Identical
// behaviour to absolutizeAvatarUrl; named separately so the call sites read
// clearly. Returns null when the path is missing, so callers can fall back
// to a placeholder.
export function absolutizeMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${getBackendOrigin()}${url}`;
}
