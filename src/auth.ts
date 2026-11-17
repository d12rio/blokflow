import { authHandler, type AuthHandlerParams } from "@storyblok/app-extension-auth";

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return value;
}

const REQUIRED = ["STORYBLOK_PLUGIN_CLIENT_IDENTIFIER", "STORYBLOK_PLUGIN_CLIENT_SECRET", "STORYBLOK_PLUGIN_BASE_URL"] as const;

// The names (never the values) of required settings the server doesn't have, so the page can say so
// instead of failing to render.
export function missingConfig(): string[] {
  return REQUIRED.filter((name) => !process.env[name]);
}

// Read lazily so `next build` works without the plugin's secrets.
export function getAuthParams(): AuthHandlerParams {
  return {
    clientId: env("STORYBLOK_PLUGIN_CLIENT_IDENTIFIER"),
    clientSecret: env("STORYBLOK_PLUGIN_CLIENT_SECRET"),
    baseUrl: env("STORYBLOK_PLUGIN_BASE_URL"),
    sessionKey: "auth",
    successCallback: "/",
    errorCallback: "/401",
    endpointPrefix: "/api/connect",
  };
}

let handler: ReturnType<typeof authHandler> | undefined;
export const handleConnect: ReturnType<typeof authHandler> = (req, res) => {
  handler ??= authHandler(getAuthParams());
  return handler(req, res);
};
