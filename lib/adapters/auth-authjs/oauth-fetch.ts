import {
  Agent,
  ProxyAgent,
  fetch as undiciFetch,
  type Dispatcher,
} from "undici";

const OAUTH_FETCH_TIMEOUT_MS = 15_000;

function resolveProxyUrl(): string | undefined {
  return (
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    undefined
  );
}

let dispatcher: Dispatcher | undefined;

function resolveDispatcher(): Dispatcher {
  if (dispatcher) return dispatcher;

  const proxyUrl = resolveProxyUrl();
  if (proxyUrl) {
    dispatcher = new ProxyAgent(proxyUrl);
    return dispatcher;
  }

  dispatcher = new Agent({
    connect: {
      timeout: OAUTH_FETCH_TIMEOUT_MS,
    },
  });
  return dispatcher;
}

type UndiciRequestInit = NonNullable<Parameters<typeof undiciFetch>[1]>;

function toUndiciInit(
  init: RequestInit | undefined,
  dispatcher: Dispatcher,
  signal: AbortSignal
): UndiciRequestInit {
  return {
    ...init,
    dispatcher,
    signal,
  } as UndiciRequestInit;
}

/**
 * Auth.js uses fetch for OAuth token exchange. Node's built-in fetch ignores
 * HTTP(S)_PROXY and uses a short connect timeout, which breaks Google sign-in
 * behind Cursor/corporate proxies or flaky IPv6 routes.
 */
export function createOAuthFetch(): typeof fetch {
  const dispatcher = resolveDispatcher();

  return (...args: Parameters<typeof fetch>): ReturnType<typeof fetch> => {
    const [input, init] = args;
    const signal = init?.signal ?? AbortSignal.timeout(OAUTH_FETCH_TIMEOUT_MS);

    if (input instanceof Request) {
      const requestInit = toUndiciInit(
        {
          ...init,
          method: input.method,
          headers: input.headers,
          body: input.body,
          redirect: input.redirect,
        },
        dispatcher,
        signal
      );
      return undiciFetch(input.url, requestInit) as unknown as ReturnType<
        typeof fetch
      >;
    }

    return undiciFetch(
      input,
      toUndiciInit(init, dispatcher, signal)
    ) as unknown as ReturnType<typeof fetch>;
  };
}
