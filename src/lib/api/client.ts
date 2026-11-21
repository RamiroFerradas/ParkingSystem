/**
 * Single client-side HTTP entry point for the app.
 *
 * Every admin manager used to carry its own `call()` copy with three subtly
 * different contracts. This one keeps the behavior those copies relied on:
 * - `fetch` never receives a body on GET/HEAD (the browser throws `TypeError`).
 * - A failed request never throws: the caller gets `{ ok: false, error }`.
 * - A network failure reports "Sin conexión con el servidor".
 */

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };

export interface ApiRequestOptions {
  method?: "GET" | "HEAD" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
}

/** Reads a JSON response without throwing on an empty or malformed body. */
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function apiRequest<T>(
  url: string,
  options: ApiRequestOptions = {},
): Promise<ApiResponse<T>> {
  const method = options.method ?? "GET";
  const allowsBody = method !== "GET" && method !== "HEAD";

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: allowsBody && options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    return { ok: false, error: "Sin conexión con el servidor" };
  }

  const data = (await readJson(response)) as (T & { error?: string }) | null;

  if (!response.ok) {
    return { ok: false, error: data?.error ?? `Error ${response.status}` };
  }
  return { ok: true, data: data as T };
}

/** Convenience wrapper for mutations. */
export function apiSend<T>(
  url: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown,
): Promise<ApiResponse<T>> {
  return apiRequest<T>(url, { method, body });
}
