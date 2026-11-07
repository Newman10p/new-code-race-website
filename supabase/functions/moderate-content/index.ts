// Edge Function: moderate-content
//
// Thin auth-gated proxy between the frontend and the hardened ai-gateway's
// /v1/moderate endpoint. The frontend never sees the AI gateway's
// INTERNAL_API_TOKEN — it only sees its own Supabase session.
//
// Flow:
//   frontend  --POST-->  moderate-content (Supabase JWT verified)
//                \`--->  ai-gateway /v1/moderate (X-Internal-Token)
//                <\-\-  verdict + persist to content_moderation_log
//   frontend  <--200--   { flagged, categories, reasoning }
//
// Env vars (set in Supabase → Project Settings → Edge Functions → Secrets):
//   AI_GATEWAY_URL    base URL of the ai-gateway, e.g. http://ai-gateway:8000
//   AI_GATEWAY_TOKEN  the gateway's INTERNAL_API_TOKEN value
//
// The function is JWT-verified (verify_jwt = true in config.toml) so anon
// callers can't reach it. We extract `sub` from the caller's JWT so the
// gateway's per-user rate limit + daily token quota apply per actual user.

import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const aiGatewayUrl = Deno.env.get("AI_GATEWAY_URL");
const aiGatewayToken = Deno.env.get("AI_GATEWAY_TOKEN");

if (!supabaseUrl || !serviceKey) {
  throw new Error("Supabase environment variables are not configured.");
}
if (!aiGatewayUrl || !aiGatewayToken) {
  throw new Error(
    "AI_GATEWAY_URL and AI_GATEWAY_TOKEN must be set. " +
      "Point at the hardened ai-gateway (see ai-gateway/README.md).",
  );
}

const supabase = createClient(supabaseUrl, serviceKey);

interface ModerateResponse {
  flagged: boolean;
  categories: string[];
  reasoning: string;
  model: string;
  provider: string;
}

// Decode the `sub` claim from a JWT without verifying (Supabase's Edge
// Function platform already verified it before invoking us — verify_jwt is
// true). Used only to tag the moderation log row + the gateway's user_id.
function userIdFromJwt(authHeader: string): string | null {
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    // atob in Deno handles base64. JWT payload is base64url.
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(b64));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const userId = userIdFromJwt(req.headers.get("Authorization") ?? "");

  let body: { text?: unknown; context?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.text !== "string" || !body.text.trim()) {
    return Response.json({ error: "Field 'text' (string) is required" }, { status: 400 });
  }
  const context =
    typeof body.context === "string" && body.context.trim()
      ? body.context.slice(0, 80)
      : "unknown";

  // Forward to the ai-gateway. Truncate input to the gateway's own limit
  // (8 KB) so we never send a body the gateway will reject.
  let verdict: ModerateResponse;
  try {
    const r = await fetch(
      `${aiGatewayUrl.replace(/\/+$/, "")}/v1/moderate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Token": aiGatewayToken,
        },
        body: JSON.stringify({
          input: body.text.slice(0, 8000),
          user_id: userId ?? undefined,
        }),
      },
    );
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 200);
      return Response.json(
        {
          error: `AI gateway returned ${r.status}`,
          detail,
        },
        { status: 502 },
      );
    }
    verdict = (await r.json()) as ModerateResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "network error";
    return Response.json(
      { error: "AI gateway unreachable", detail: msg },
      { status: 502 },
    );
  }

  // Persist the verdict (auditable trail). Best-effort: never fail the user's
  // request because the log insert broke.
  try {
    await supabase.from("content_moderation_log").insert({
      user_id: userId,
      context,
      input_text: body.text.slice(0, 1000),
      flagged: verdict.flagged,
      categories: verdict.categories,
      reasoning: verdict.reasoning,
      model: verdict.model,
      provider: verdict.provider,
    });
  } catch (err) {
    console.warn("content_moderation_log insert failed:", err);
  }

  return Response.json(verdict);
});
