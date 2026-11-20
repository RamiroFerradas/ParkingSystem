import { NextResponse } from "next/server";
import type { ZodType } from "zod";

/**
 * Result of reading a request body: either validated data or a ready-to-return
 * `NextResponse`. Routes only have to check `error`.
 */
export type BodyResult<T> =
  | { data: T; error: null }
  | { data: null; error: NextResponse };

/**
 * Reads the JSON body and validates it against `schema`.
 *
 * Two different failures are reported exactly like the hand-rolled parsers did:
 * malformed JSON is always `400 {"error":"Cuerpo inválido"}`, while a shape
 * failure returns the route's own message.
 */
export async function parseBody<T>(
  request: Request,
  schema: ZodType<T>,
  message: string,
): Promise<BodyResult<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { data: null, error: invalidBody() };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { data: null, error: fieldError(message) };
  }
  return { data: parsed.data, error: null };
}

/**
 * Same as {@link parseBody} for routes where the body is optional (a missing or
 * malformed body is treated as `{}`). Shape failures still return a 400.
 */
export async function parseOptionalBody<T>(
  request: Request,
  schema: ZodType<T>,
  message: string,
): Promise<BodyResult<T>> {
  let raw: unknown = {};
  try {
    raw = (await request.json()) ?? {};
  } catch {
    raw = {};
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { data: null, error: fieldError(message) };
  }
  return { data: parsed.data, error: null };
}

/** `400` for a body that is not valid JSON. */
export function invalidBody(): NextResponse {
  return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
}

/** `400` carrying the route-specific validation message. */
export function fieldError(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}
