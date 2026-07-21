import { NoneAuthProvider } from "@/lib/adapters/auth-none";
import { AuthJsAuthProvider } from "@/lib/adapters/auth-authjs";
import { FakeAIProvider } from "@/lib/adapters/fake/ai";
import { OpenAIAIProvider } from "@/lib/adapters/openai/ai";
import {
  OpenAIVoiceProvider,
  voiceForRole as openaiVoiceForRole,
} from "@/lib/adapters/openai/voice-server";
import { createMemoryStore } from "@/lib/adapters/store-memory";
import { createPostgresStore } from "@/lib/adapters/store-postgres";
import { createSqliteStore } from "@/lib/adapters/store-sqlite";
import { buildDemoPersonas, buildDemoScenario } from "@/lib/store/demoScenario";
import type {
  AIProvider,
  AuthProvider,
  Store,
  VoiceProvider,
} from "@/lib/providers";

// Active auth provider name. Shared so the startup guard and per-request
// guards agree on when the app is running in anonymous mode.
const authProviderName = process.env.AUTH_PROVIDER || "none";

// Anonymous requests are legitimate only in anonymous mode (AUTH_PROVIDER=none).
// With a real provider (authjs) an unauthenticated request must be rejected on
// protected endpoints — selecting a provider does not gate per-request access
// by itself, so endpoints check this flag explicitly.
export const authAllowsAnonymous = authProviderName === "none";

function pickAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER || "openai";
  switch (provider) {
    case "fake":
      return new FakeAIProvider();
    case "openai":
    default:
      return new OpenAIAIProvider();
  }
}

function pickVoiceProvider(): VoiceProvider {
  const provider = process.env.VOICE_PROVIDER || "openai";
  switch (provider) {
    case "openai":
    default:
      return new OpenAIVoiceProvider();
  }
}

function pickAuthProvider(): AuthProvider {
  const provider = authProviderName;
  const isProductionBuild = process.env.NEXT_PHASE === "phase-production-build";
  // Secure by default: anonymous (AUTH_PROVIDER=none) is blocked in production.
  // Opt in explicitly with AUTH_ALLOW_ANONYMOUS=true to run the anonymous demo in production.
  const allowAnonymous = process.env.AUTH_ALLOW_ANONYMOUS === "true";
  if (
    process.env.NODE_ENV === "production" &&
    !isProductionBuild &&
    provider === "none" &&
    !allowAnonymous
  ) {
    throw new Error(
      "AUTH_PROVIDER=none is not allowed in production. Set AUTH_PROVIDER=authjs, or set AUTH_ALLOW_ANONYMOUS=true to allow anonymous access."
    );
  }
  switch (provider) {
    case "authjs":
      return new AuthJsAuthProvider(pickStore);
    case "none":
    default:
      return new NoneAuthProvider();
  }
}

let storeSingleton: Store | null = null;
let storePromise: Promise<Store> | null = null;

async function pickStore(): Promise<Store> {
  if (storeSingleton) return storeSingleton;
  if (storePromise) return storePromise;

  const provider = process.env.STORE_PROVIDER || "sqlite";
  storePromise = (async () => {
    switch (provider) {
      case "memory": {
        // Seed the demo scenario so the anonymous demo works with no filesystem
        // (mirrors the SQLite adapter's seedScenarioIfNeeded).
        const demoScenario = buildDemoScenario();
        storeSingleton = createMemoryStore({
          scenarios: [demoScenario],
          personas: buildDemoPersonas(demoScenario.id),
        });
        break;
      }
      case "postgres": {
        const databaseUrl = process.env.POSTGRES_DATABASE_URL;
        if (!databaseUrl) {
          throw new Error("POSTGRES_DATABASE_URL が設定されていません");
        }
        storeSingleton = await createPostgresStore(databaseUrl);
        break;
      }
      case "supabase": {
        const databaseUrl = process.env.SUPABASE_DATABASE_URL;
        if (!databaseUrl) {
          throw new Error("SUPABASE_DATABASE_URL is not set");
        }
        storeSingleton = await createPostgresStore(databaseUrl);
        break;
      }
      case "sqlite":
      default: {
        const dbPath = process.env.SQLITE_PATH || "./data/demo.db";
        storeSingleton = createSqliteStore(dbPath);
        break;
      }
    }
    return storeSingleton;
  })();

  return storePromise;
}

const ai = pickAIProvider();
const voice = pickVoiceProvider();
const auth = pickAuthProvider();

export const providers = {
  ai,
  voice,
  auth,
  getStore: pickStore,
};

export function voiceForRole(role: string): string {
  return openaiVoiceForRole(role);
}
