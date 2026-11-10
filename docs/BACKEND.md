# Lumen backend contract

The browser never holds provider API keys. Point Lumen at a CodeQuest-hosted
proxy via `VITE_LUMEN_API_URL`, `window.CODEQUEST.apiUrl`, or Preferences → AI connection.
Requests are sent with `credentials: "include"` so the existing CodeQuest session
authenticates the student; **authorise every request server-side**.

## GET /models
```json
{ "models": [
  { "id": "provider-model-id", "name": "Display name", "available": true,
    "capabilities": ["text", "code", "vision"], "limits": "50 messages / hour" }
] }
```
Only list models that are actually configured. Lumen hides nothing else and invents nothing.

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

## Persistence mapping
Client entities in `src/lib/store.ts` map onto `tutor_conversations`, `tutor_messages`,
`tutor_message_attachments`, `tutor_pinned_items`/`tutor_saved_notes` (library),
`tutor_projects`, `tutor_project_files`, `tutor_project_versions`,
`tutor_learning_preferences`, `tutor_context_items`, plus diagrams. Today they are stored
in localStorage, scoped by `window.CODEQUEST.student.id`.
