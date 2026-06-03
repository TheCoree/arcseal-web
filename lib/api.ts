const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface RequestOptions extends RequestInit {
  json?: any;
  params?: Record<string, string>;
  formData?: FormData;
}

export async function apiRequest(endpoint: string, options: RequestOptions = {}) {
  const { json, params, formData, headers, ...restOptions } = options;

  let url = `${BASE_URL}${endpoint}`;

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
        const refreshResponse = await fetch(`${BASE_URL}/auth/refresh`, {
          method: "POST",
          credentials: "include"
        });

        if (refreshResponse.ok) {
          const data = await refreshResponse.json();
          if (typeof window !== "undefined") {
            localStorage.setItem("token", data.access_token);
          }
          // Retry original request with new token
          if (config.headers) {
             (config.headers as Record<string, string>)["Authorization"] = `Bearer ${data.access_token}`;
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
