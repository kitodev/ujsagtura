// Egységes JSON-válaszok az API-útvonalakhoz.

/** Ellenőrzött hiba: a kliens a `status` kódot és a `body` tartalmát kapja. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** Kéréskezelő, ami a `HttpError`-t a megfelelő JSON-válasszá alakítja. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A): Promise<Response> => {
    try {
      const result = await fn(...args);
      return result instanceof Response ? result : Response.json(result ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message, ...e.extra }, { status: e.status });
      throw e;
    }
  };
}

/** Az URL egy paramétere. */
export const param = (req: Request, name: string) => new URL(req.url).searchParams.get(name);
