/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTHORIZE_NET_PUBLIC_CLIENT_KEY?: string;
  // Add other environment variables here as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
