import { getApiBaseUrl } from "@/lib/utils";

interface RequestOptions extends RequestInit {
  json?: any;
  params?: Record<string, string>;
  formData?: FormData;
}

// One in-flight refresh shared by every caller, so a burst of 401s (or a
// socket reconnect racing an API call) rotates the refresh cookie only once.
let refreshInflight: Promise<string | null> | null = null;

// Exchange the HTTP-only refresh cookie for a new access token and store it.
// Resolves to null when the server rejects the refresh (session is over);
// rejects on network errors so callers can decide to retry.
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshInflight) {
    refreshInflight = (async () => {
      const res = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) return null;
      const data = await res.json();
      localStorage.setItem("token", data.access_token);
      return data.access_token as string;
    })().finally(() => {
      refreshInflight = null;
    });
  }
  return refreshInflight;
}

// A stored token is reused only if it stays valid at least this long.
const TOKEN_MIN_TTL_SECONDS = 60;

function tokenExpiresAt(token: string): number | null {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const exp = JSON.parse(atob(payload)).exp;
    return typeof exp === "number" ? exp : null;
  } catch {
    return null;
  }
}

// The stored access token, refreshed first if it has (nearly) expired. For
// callers the 401-retry in apiRequest can't cover — e.g. the match websocket,
// which authenticates once, at connect time.
export async function getFreshAccessToken(): Promise<string | null> {
  const token = localStorage.getItem("token");
  if (!token) return null;
  const exp = tokenExpiresAt(token);
  if (exp !== null && exp - Date.now() / 1000 > TOKEN_MIN_TTL_SECONDS) return token;
  return refreshAccessToken();
}

export async function apiRequest(endpoint: string, options: RequestOptions = {}) {
  const { json, params, formData, headers, ...restOptions } = options;

  const baseUrl = getApiBaseUrl();
  let url = `${baseUrl}${endpoint}`;

  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const defaultHeaders: Record<string, string> = {};

  if (json) {
    defaultHeaders["Content-Type"] = "application/json";
    restOptions.body = JSON.stringify(json);
  } else if (formData) {
    // Note: Do not set Content-Type header when sending FormData,
    // the browser needs to set the boundary automatically.
    restOptions.body = formData;
  }

  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) {
      defaultHeaders["Authorization"] = `Bearer ${token}`;
    }
  }

  const config: RequestInit = {
    headers: {
      ...defaultHeaders,
      ...headers,
    },
    credentials: "include", // Important for sending/receiving HTTP-Only cookies
    ...restOptions,
  };

  try {
    let response = await fetch(url, config);

    // Intercept 401 for token refresh
    if (response.status === 401 && !url.includes("/auth/refresh") && !url.includes("/auth/login")) {
      try {
        const newToken = await refreshAccessToken();

        if (newToken) {
          // Retry original request with new token
          if (config.headers) {
             (config.headers as Record<string, string>)["Authorization"] = `Bearer ${newToken}`;
          }
          response = await fetch(url, config);
        } else {
           throw new Error("Refresh failed");
        }
      } catch (err) {
        // If refresh fails, log out
        if (typeof window !== "undefined") {
          localStorage.removeItem("token");
          const path = window.location.pathname;
          if (!path.startsWith("/login") && !path.startsWith("/register")) {
            window.location.href = "/login?redirect=" + encodeURIComponent(path);
          }
        }
      }
    } else if (response.status === 401) {
       // Direct 401 on login/refresh or unhandled
       if (typeof window !== "undefined") {
          localStorage.removeItem("token");
          const path = window.location.pathname;
          if (!path.startsWith("/login") && !path.startsWith("/register")) {
            window.location.href = "/login?redirect=" + encodeURIComponent(path);
          }
        }
    }

    return response;
  } catch (error) {
    console.error("API request failed:", error);
    throw error;
  }
}
