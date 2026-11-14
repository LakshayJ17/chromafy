import "server-only";
import type { ProviderConfig } from "@/lib/config/env";
import { createCloudflareImageProvider } from "./cloudflare-provider";
import { createOpenAIImageProvider, type ImageEditProvider } from "./image-provider";

export function createImageProvider(config: ProviderConfig | null): ImageEditProvider | null {
  if (!config) return null;
  switch (config.kind) {
    case "openai":
      return createOpenAIImageProvider(config);
    case "cloudflare":
      return createCloudflareImageProvider(config);
  }
}
