export interface Config {
  region?: string;
  cognitoDomain?: string;
  clientId?: string;
  controlUrl?: string;
  proxyUrl?: string;
  redirectUri?: string;
  /** Dev/test bypass: skip auth and use this URL as both control and proxy. */
  devBackend?: string | null;
}

/** The dev backend URL, or undefined when the bypass is off (missing, null or empty). */
export const devBackend = (config: Config): string | undefined => config.devBackend || undefined;

const REQUIRED = ["cognitoDomain", "clientId", "controlUrl", "proxyUrl", "redirectUri"] as const;

export async function loadConfig(): Promise<Config> {
  const response = await fetch("/config.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`config.json: HTTP ${response.status}`);
  const config = (await response.json()) as Config;
  if (!devBackend(config)) {
    const missing = REQUIRED.filter((key) => typeof config[key] !== "string" || !config[key]);
    if (missing.length > 0) throw new Error(`config.json is missing: ${missing.join(", ")}`);
  }
  return config;
}
