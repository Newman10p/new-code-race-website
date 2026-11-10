/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** Base URL of the Lumen tutor backend proxy (never an API key). */
  readonly VITE_LUMEN_API_URL?: string;
}
interface Window {
  /** Optional host config injected by the CodeQuest platform. */
  CODEQUEST?: {
    apiUrl?: string;
    student?: { id: string; name?: string };
    /** AI-assistance policy for the current context (e.g. a live competition). */
    aiPolicy?: "open" | "review_only" | "prohibited";
    policyReason?: string;
  };
}
