/// <reference types="vinxi/types/client" />

interface ImportMetaEnv {
  readonly VITE_GRAPHQL_BASE_URL: string;
  readonly BASE_PATH: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
