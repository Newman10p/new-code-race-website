# CodeQuest AI backend contract

The browser never holds provider API keys. Point the workspace at a CodeQuest-hosted
proxy via `VITE_CODEQUEST_AI_URL`, `window.CODEQUEST.aiUrl`, or Preferences → AI connection.
Requests are sent with `credentials: "include"` so the existing CodeQuest session
authenticates the student; **authorise every request server-side**.

## GET /models
```json
{ "models": [
  { "id": "provider-model-id", "name": "Display name", "available": true,
    "capabilities": ["text", "code", "vision"], "limits": "50 messages / hour" }
] }
```
Only list models that are actually configured. The workspace hides nothing else and invents nothing.

## POST /chat
Request:
```json
{ "model": "provider-model-id",
  "system": "teaching instructions + student context (built client-side, visible to the student)",
  "messages": [{ "role": "user", "content": "…", "images": ["data:image/png;base64,…"] }] }
```
Response: `text/event-stream`, one event per chunk:
```
data: {"delta":"Recursion is…"}
data: [DONE]
```
Errors: non-2xx with `{ "error": "message" }`, or `data: {"error":"…"}` mid-stream.
Plain chunked `text/plain` is also accepted.

## Policy
Inject `window.CODEQUEST = { aiPolicy: "open" | "review_only" | "prohibited", policyReason }`
during competitions/assessments. **Also enforce it in the proxy** — the client check is UX only.

## Supabase Edge Function (included)

`supabase/functions/ai-chat/index.ts` implements both endpoints against any
OpenAI-compatible provider. It is the server-side place for the provider key.

```bash
supabase secrets set \
  AI_API_KEY=your-server-side-key \
  AI_MODELS="provider/model-a|CodeQuest Fast,provider/model-b|CodeQuest Reasoning" \
  AI_BASE_URL=https://openrouter.ai/api/v1 \
  AI_ALLOWED_ORIGINS=https://your-app.example

supabase functions deploy ai-chat
```

Optional secrets: `AI_MAX_TOKENS`, `AI_TEMPERATURE`, `AI_RATE_LIMIT_LABEL`.
`AI_MODELS` entries are `id` or `id|Display name`; only those ids are accepted.

Point the client at it with one of:

- `VITE_CODEQUEST_AI_URL=https://<ref>.supabase.co/functions/v1/ai-chat` at build time
- `window.CODEQUEST.aiUrl` from the host platform
- Preferences → AI connection (stored locally in this browser)

`supabase/config.toml` keeps JWT verification on for this function. The client
forwards `window.CODEQUEST.accessToken` as a Bearer token when the host supplies
one. Do not disable verification on a public deployment; if the host injects an
authenticated cookie instead, enforce that session in the function before
calling the provider.

## Persistence mapping
Client entities in `src/lib/store.ts` map onto `tutor_conversations`, `tutor_messages`,
`tutor_message_attachments`, `tutor_pinned_items`/`tutor_saved_notes` (library),
`tutor_projects`, `tutor_project_files`, `tutor_project_versions`,
`tutor_learning_preferences`, `tutor_context_items`, plus diagrams. Today they are stored
in localStorage, scoped by `window.CODEQUEST.student.id`.
