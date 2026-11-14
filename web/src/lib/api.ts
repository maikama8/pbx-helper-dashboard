export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
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
  const body = text ? (JSON.parse(text) as { message?: string }) : {};
  if (!response.ok) throw new ApiError(body.message || response.statusText, response.status);
  return body as T;
}
