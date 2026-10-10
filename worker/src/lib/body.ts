import type { ZodError } from "zod";
import type { Ctx } from "../types";
import { appError } from "./errors";

/**
 * Parse a JSON request body, treating "no body" and "malformed JSON" as the
 * client mistakes they are.
 *
 * `c.req.json()` throws a SyntaxError on an empty body, and every route let it
 * escape to `onError`, which reported INTERNAL — so a POST with no payload came
 * back as a 500 and looked like a server fault. The contract (§1) says a failed
 * parse is VALIDATION_FAILED, so it is mapped to a 400 with a field the form can
 * highlight, the same shape every other validation refusal uses.
 */
export async function readJson(c: Ctx): Promise<unknown> {
  let text: string;
  try {
    text = await c.req.text();
  } catch {
    throw bodyError();
  }
  if (!text.trim()) throw bodyError();
  try {
    return JSON.parse(text);
  } catch {
    throw bodyError();
  }
}

/**
 * Turn a zod failure into the contract's structured refusal (§1): a
 * VALIDATION_FAILED carrying `detail.fields`, which the client maps onto
 * `ApiError.fieldErrors` so a form can highlight the offending input.
 *
 * Routes used to throw `appError("VALIDATION_FAILED")` with no detail, so the
 * screen could only show the generic "CHECK THE HIGHLIGHTED FIELDS" line with
 * nothing highlighted.
 */
export function validationError(error: ZodError) {
  return appError("VALIDATION_FAILED", {
    fields: error.issues.map((i) => ({
      field: i.path.join(".") || "body",
      message: i.message,
    })),
  });
}

function bodyError() {
  return appError("VALIDATION_FAILED", {
    fields: [{ field: "body", message: "Send a JSON object" }],
  });
}

