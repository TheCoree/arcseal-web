import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Backend API base URL. NEXT_PUBLIC_API_URL wins when set; otherwise assume the
// backend listens on :8000 of whatever host served this page, so both
// localhost and a LAN IP work without editing env files when DHCP changes it.
export function getApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
  return `http://${host}:8000/api/v1`;
}

// WebSocket base URL — NEXT_PUBLIC_WS_URL, or the API base with ws:// scheme.
export function getWsBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  return `${getApiBaseUrl().replace(/^http/, "ws")}/ws`;
}

// Derive backend origin from the API URL (e.g. http://localhost:8000/api/v1 -> http://localhost:8000).
function getBackendOrigin(): string {
  try {
    return new URL(getApiBaseUrl()).origin;
  } catch {
    return "http://localhost:8000";
  }
}

// Resolve an uploaded-media path against the *current* backend origin.
//
// The DB may hold either a clean relative path ("/uploads/avatars/x.jpg") or a
// legacy absolute URL baked to a specific host ("http://127.0.0.1:8000/uploads/
// avatars/x.jpg"). The latter only works on the machine running the backend and
// breaks on every other device. To be host-independent we strip everything up
// to "/uploads/" and re-prefix the live backend origin. Genuinely external URLs
// (no "/uploads/" segment, e.g. a CDN avatar) are returned untouched.
function resolveUploadUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const idx = url.indexOf("/uploads/");
  if (idx !== -1) return `${getBackendOrigin()}${url.slice(idx)}`;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${getBackendOrigin()}${url}`;
}

// Server returns avatar paths as "/uploads/avatars/...". Prefix the backend origin
// so the browser fetches them from the API host rather than the frontend host.
export function absolutizeAvatarUrl(url: string | null | undefined): string | null {
  return resolveUploadUrl(url);
}

// Generic version used for character portraits / ability icons. Identical
// behaviour to absolutizeAvatarUrl; named separately so the call sites read
// clearly. Returns null when the path is missing, so callers can fall back
// to a placeholder.
export function absolutizeMediaUrl(url: string | null | undefined): string | null {
  return resolveUploadUrl(url);
}
