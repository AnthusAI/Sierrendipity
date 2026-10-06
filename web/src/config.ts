export interface Config {
  region?: string;
  cognitoDomain?: string;
  clientId?: string;
  controlUrl?: string;
  proxyUrl?: string;
  redirectUri?: string;
  /** Dev/test bypass: skip auth and use this URL as both control and proxy. */
  devBackend?: string;
}

export async function loadConfig(): Promise<Config> {
  const response = await fetch("/config.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`config.json: HTTP ${response.status}`);
  return (await response.json()) as Config;
}
