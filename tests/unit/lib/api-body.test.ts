import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  fieldError,
  invalidBody,
  parseBody,
  parseOptionalBody,
} from "@/lib/api/body";

function request(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

function brokenRequest(): Request {
  return {
    json: async () => {
      throw new SyntaxError("Unexpected token");
    },
  } as unknown as Request;
}

const schema = z.object({
  code: z.string().trim().toUpperCase(),
  amount: z.number().int().min(0),
});

describe("parseBody", () => {
  it("returns the parsed data on success", async () => {
    const result = await parseBody(
      request({ code: " cash ", amount: 100 }),
      schema,
      "Payload inválido",
    );

    expect(result.error).toBeNull();
    expect(result.data).toEqual({ code: "CASH", amount: 100 });
  });

  it("reports malformed JSON as 'Cuerpo inválido'", async () => {
    const result = await parseBody(brokenRequest(), schema, "Payload inválido");

    expect(result.data).toBeNull();
    expect(result.error?.status).toBe(400);
    expect(await result.error!.json()).toEqual({ error: "Cuerpo inválido" });
  });

  it("reports a shape failure with the route message", async () => {
    const result = await parseBody(request({ code: 1 }), schema, "Payload inválido");

    expect(result.data).toBeNull();
    expect(result.error?.status).toBe(400);
    expect(await result.error!.json()).toEqual({ error: "Payload inválido" });
  });

  it("rejects a negative amount", async () => {
    const result = await parseBody(
      request({ code: "CASH", amount: -1 }),
      schema,
      "Payload inválido",
    );

    expect(result.data).toBeNull();
  });
});

describe("parseOptionalBody", () => {
  const optional = z.object({ notes: z.string().optional() });

  it("treats a malformed or absent body as an empty object", async () => {
    const malformed = await parseOptionalBody(brokenRequest(), optional, "Inválido");
    const empty = await parseOptionalBody(request(undefined), optional, "Inválido");

    expect(malformed.error).toBeNull();
    expect(malformed.data).toEqual({});
    expect(empty.error).toBeNull();
    expect(empty.data).toEqual({});
  });

  it("still rejects a body whose shape is wrong", async () => {
    const result = await parseOptionalBody(request({ notes: 5 }), optional, "Inválido");

    expect(result.data).toBeNull();
    expect(await result.error!.json()).toEqual({ error: "Inválido" });
  });
});

describe("response helpers", () => {
  it("invalidBody returns 400 'Cuerpo inválido'", async () => {
    const res = invalidBody();

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Cuerpo inválido" });
  });

  it("fieldError returns 400 with the given message", async () => {
    const res = fieldError("Faltan datos");

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Faltan datos" });
  });
});
