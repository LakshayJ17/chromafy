import { ConfigError } from "@/lib/config/env";
import { getServices } from "@/lib/security/services";
import { createTransformHandler, errorResponse } from "@/lib/transform/handler";

// sharp and the provider adapters need Node.js APIs.
export const runtime = "nodejs";
// Provider edits can take up to about two minutes; keep headroom on platforms that honour this.
export const maxDuration = 180;

let handler: ((request: Request) => Promise<Response>) | null = null;

function getHandler() {
  handler ??= createTransformHandler(getServices());
  return handler;
}

export async function POST(request: Request): Promise<Response> {
  try {
    return await getHandler()(request);
  } catch (error) {
    // Only reachable when configuration itself is invalid. Field names are logged, values never.
    console.error(JSON.stringify({ event: "transform.config_error", issues: error instanceof ConfigError ? error.issues : undefined }));
    return errorResponse("internal");
  }
}
