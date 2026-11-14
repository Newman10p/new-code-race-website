/**
 * CodeQuest AI proxy — Supabase Edge Function.
 *
 * Implements the browser contract in docs/BACKEND.md so provider keys never
 * reach the client:
 *   GET  …/ai-chat/models  -> { models: ModelInfo[] }
 *   POST …/ai-chat/chat    -> text/event-stream of { "delta": "…" } … [DONE]
 *
 * Required secrets (Supabase → Edge Functions → Secrets):
 *   AI_API_KEY   provider key (server-side only)
 *   AI_MODELS    comma-separated model ids, optionally `id|Display name`
 * Optional:
 *   AI_BASE_URL          OpenAI-compatible base URL (default https://api.openai.com/v1)
 *   AI_ALLOWED_ORIGINS   comma-separated browser origins; defaults to reflecting Origin
 *   AI_MAX_TOKENS        completion cap (default 2048)
 *   AI_TEMPERATURE       sampling temperature (default 0.4)
 *   AI_RATE_LIMIT_LABEL  human-readable limit shown in the model picker
 *
 * The gateway's JWT verification stays enabled (supabase/config.toml); the
 * client sends its CodeQuest/Supabase access token as a Bearer token.
 */

type Role = "user" | "assistant";

interface IncomingMessage {
  role?: Role;
  content?: string;
  images?: string[];
}

const providerBase = () => (Deno.env.get("AI_BASE_URL") || "https://api.openai.com/v1").replace(/\/+$/, "");
const providerKey = () => Deno.env.get("AI_API_KEY") || "";

function allowedOrigins(): string[] {
  return (Deno.env.get("AI_ALLOWED_ORIGINS") || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("origin") || "";
  const allowed = allowedOrigins();
  const value = allowed.length === 0 ? origin : allowed.includes("*") ? "*" : allowed.includes(origin) ? origin : "null";
  return {
    "Access-Control-Allow-Origin": value || "null",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function readModels() {
  const raw = (Deno.env.get("AI_MODELS") || "").trim();
  if (!raw) return [];
  const limit = Deno.env.get("AI_RATE_LIMIT_LABEL") || undefined;
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [id, ...rest] = entry.split("|");
      const name = rest.join("|").trim() || id.trim();
      return { id: id.trim(), name, available: true, capabilities: ["text", "code"], ...(limit ? { limits: limit } : {}) };
    })
    .filter((m) => m.id);
}

function normaliseMessages(system: string, incoming: IncomingMessage[]) {
  const messages: unknown[] = [];
  if (system.trim()) messages.push({ role: "system", content: system.trim() });

  for (const message of incoming.slice(-40)) {
    const role: Role = message.role === "assistant" ? "assistant" : "user";
    const text = typeof message.content === "string" ? message.content.slice(0, 120_000) : "";
    const images = (Array.isArray(message.images) ? message.images : [])
      .filter((url) => typeof url === "string" && url.startsWith("data:image/"))
      .slice(0, 6);

    if (!text && images.length === 0) continue;

    if (images.length === 0) {
      messages.push({ role, content: text });
      continue;
    }

    messages.push({
      role,
      content: [
        ...(text ? [{ type: "text", text }] : []),
        ...images.map((url) => ({ type: "image_url", image_url: { url } })),
      ],
    });
  }
  return messages;
}

async function chat(req: Request): Promise<Response> {
  if (!providerKey()) {
    return json(req, { error: "The AI provider is not configured on this server." }, 503);
  }

  let body: { model?: string; system?: string; messages?: IncomingMessage[]; policy?: string };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "Request body must be valid JSON." }, 400);
  }

  if (body.policy === "prohibited") {
    return json(req, { error: "AI assistance is disabled by the current competition or assessment policy." }, 403);
  }

  const models = readModels();
  const model = typeof body.model === "string" ? body.model : "";
  if (!model || !models.some((m) => m.id === model)) {
    return json(req, { error: "Choose a model configured on this server." }, 400);
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json(req, { error: "At least one message is required." }, 400);
  }

  const system = [
    typeof body.system === "string" ? body.system : "",
    body.policy === "review_only"
      ? "POLICY: review only. Explain concepts and review submitted work, but do not produce solutions to active assessment questions."
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const maxTokens = Number(Deno.env.get("AI_MAX_TOKENS") || "2048");
  const temperature = Number(Deno.env.get("AI_TEMPERATURE") || "0.4");

  let upstream: Response;
  try {
    upstream = await fetch(`${providerBase()}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${providerKey()}`,
      },
      body: JSON.stringify({
        model,
        messages: normaliseMessages(system, body.messages),
        stream: true,
        max_tokens: Number.isFinite(maxTokens) ? maxTokens : 2048,
        temperature: Number.isFinite(temperature) ? temperature : 0.4,
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    return json(req, { error: "Could not reach the AI provider." }, 502);
  }

  if (!upstream.ok || !upstream.body) {
    const detail = (await upstream.text().catch(() => "")).slice(0, 500);
    return json(req, { error: detail || `The AI provider returned ${upstream.status}.` }, 502);
  }

  const contentType = upstream.headers.get("content-type") || "";

  // Some OpenAI-compatible providers ignore stream:true. Adapt a plain JSON
  // completion into the same SSE contract the browser expects.
  if (!contentType.includes("event-stream")) {
    const payload = (await upstream.json().catch(() => null)) as
      | { choices?: { message?: { content?: string } }[]; error?: { message?: string } }
      | null;
    if (payload?.error?.message) return json(req, { error: payload.error.message }, 502);
    const content = payload?.choices?.[0]?.message?.content ?? "";
    const encoder = new TextEncoder();
    return new Response(
      new ReadableStream({
        start(controller) {
          if (content) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: content })}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      }),
      {
        headers: {
          ...corsHeaders(req),
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
        },
      }
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let buffer = "";
      const send = (text: string) => controller.enqueue(encoder.encode(text));

      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data) as {
                choices?: { delta?: { content?: string } }[];
                error?: { message?: string };
              };
              if (parsed.error?.message) {
                send(`data: ${JSON.stringify({ error: parsed.error.message })}\n\n`);
                continue;
              }
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) send(`data: ${JSON.stringify({ delta })}\n\n`);
            } catch {
              // Ignore provider keep-alives and non-JSON comments.
            }
          }
        }
        send("data: [DONE]\n\n");
      } catch {
        send(`data: ${JSON.stringify({ error: "The AI stream was interrupted." })}\n\n`);
      } finally {
        controller.close();
        reader.releaseLock();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders(req),
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });

  const path = new URL(req.url).pathname.replace(/\/+$/, "");

  if (req.method === "GET" && path.endsWith("/models")) {
    return json(req, { models: providerKey() ? readModels() : [] });
  }

  if (req.method === "POST" && path.endsWith("/chat")) {
    return chat(req);
  }

  return json(req, { error: "Not found. Use /models or /chat." }, 404);
});
