export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function messageFrom(text: string, fallback: string): string {
  if (!text) return fallback;
  try {
    const body = JSON.parse(text) as { message?: unknown };
    return typeof body.message === "string" && body.message ? body.message : fallback;
  } catch {
    return fallback;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...init, headers, credentials: "same-origin" });
  if (response.status === 401) {
    if (!path.startsWith("/api/login") && !path.startsWith("/api/me") && !window.location.pathname.startsWith("/login")) {
      window.location.assign("/login");
    }
    throw new ApiError("Sign in.", 401);
  }
  const text = await response.text();
  if (!response.ok) throw new ApiError(messageFrom(text, response.statusText || "Request failed."), response.status);
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError("The server returned a response that was not JSON.", response.status);
  }
}
