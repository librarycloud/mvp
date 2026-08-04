export interface AppConfig {
  host: string;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  uploadDir: string;
  pdfFontPath?: string | null;
  openAiApiKey: string | null;
  aiModel: string | null;
  openAiBaseUrl: string | null;
  cmbApiAllowedHosts?: string[];
  nodeEnv: string;
}

function required(name: string, env: NodeJS.ProcessEnv): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function positiveInt(name: string, fallback: string, env: NodeJS.ProcessEnv): number {
  const value = Number(env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const jwtSecret = required("JWT_SECRET", env);
  if (jwtSecret.length < 32) throw new Error("JWT_SECRET must contain at least 32 characters");

  return {
    host: env.HOST?.trim() || "127.0.0.1",
    port: positiveInt("PORT", "3000", env),
    databaseUrl: required("DATABASE_URL", env),
    jwtSecret,
    jwtIssuer: env.JWT_ISSUER?.trim() || "china-finance-mvp",
    jwtAudience: env.JWT_AUDIENCE?.trim() || "china-finance-web",
    accessTokenTtlSeconds: positiveInt("ACCESS_TOKEN_TTL_SECONDS", "900", env),
    refreshTokenTtlSeconds: positiveInt("REFRESH_TOKEN_TTL_SECONDS", "604800", env),
    uploadDir: env.UPLOAD_DIR?.trim() || "./data/uploads",
    pdfFontPath: env.PDF_FONT_PATH?.trim() || null,
    openAiApiKey: env.OPENAI_API_KEY?.trim() || null,
    aiModel: env.AI_MODEL?.trim() || null,
    openAiBaseUrl: env.OPENAI_BASE_URL?.trim() || null,
    cmbApiAllowedHosts: (env.CMB_API_ALLOWED_HOSTS?.split(",") ?? ["cdc.cmbchina.com"])
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
    nodeEnv: env.NODE_ENV?.trim() || "development",
  };
}
