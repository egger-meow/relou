export interface Env {
  DB: D1Database;
  ASSETS: { fetch(request: Request): Promise<Response> };
  EMAIL?: { send(message: { to: string; from: string; subject: string; text: string }): Promise<unknown> };
  SUBMIT_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  EMAIL_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  PUBLIC_HOST: string;
  ADMIN_HOST: string;
  PUBLIC_SITE_URL: string;
  ENVIRONMENT: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET_KEY?: string;
  RATE_HASH_PEPPER?: string;
  SUPPORT_EMAIL: string;
  EMAIL_DRY_RUN: string;
  EMAIL_ENABLED: string;
  EMAIL_FROM: string;
  MAIL_PROVIDER?: 'gmail_smtp' | 'cloudflare';
  GMAIL_SMTP_USER?: string;
  GMAIL_SMTP_APP_PASSWORD?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  ADMIN_EMAIL_ALLOWLIST?: string;
}
