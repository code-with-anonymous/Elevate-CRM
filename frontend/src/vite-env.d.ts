/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_API_TIMEOUT: string;
  readonly VITE_APP_NAME: string;
  readonly VITE_APP_URL: string;
  readonly VITE_APP_VERSION: string;
  readonly VITE_SESSION_TIMEOUT_MS: string;
  readonly VITE_SESSION_WARNING_MS: string;
  readonly VITE_ACCESS_TOKEN_EXPIRY: string;
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_MICROSOFT_CLIENT_ID: string;
  readonly VITE_ENABLE_2FA: string;
  readonly VITE_ENABLE_SOCIAL_LOGIN: string;
  readonly VITE_ENABLE_INVITE_SYSTEM: string;
  readonly VITE_ENABLE_DEVTOOLS: string;
  readonly VITE_SENTRY_DSN: string;
  readonly VITE_ANALYTICS_ID: string;
  readonly VITE_MAX_UPLOAD_SIZE_MB: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
