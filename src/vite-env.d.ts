/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** Base URL of the CodeQuest AI proxy (never an API key). */
  readonly VITE_CODEQUEST_AI_URL?: string;
  /** Legacy name kept for older deployments. */
  readonly VITE_LUMEN_API_URL?: string;
}
interface Window {
  /** Optional host config injected by the CodeQuest platform. */
  CODEQUEST?: {
    apiUrl?: string;
    /** Base URL of a CodeQuest-hosted AI proxy (/models + /chat). */
    aiUrl?: string;
    /** Short-lived session token, forwarded as a Bearer token. Never a provider key. */
    accessToken?: string;
    student?: { id: string; name?: string };
    /** AI-assistance policy for the current context (e.g. a live competition). */
    aiPolicy?: "open" | "review_only" | "prohibited";
    policyReason?: string;
  };
}
