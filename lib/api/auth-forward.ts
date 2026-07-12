import type { NextRequest } from "next/server";
import { providers } from "@/lib/composition";

function buildForwardedRequest(
  request: NextRequest,
  segments: string[],
  extraQuery?: Record<string, string>
): NextRequest {
  const url = new URL(request.url);
  url.pathname = `/api/auth/${segments.join("/")}`;
  if (extraQuery) {
    for (const [key, value] of Object.entries(extraQuery)) {
      url.searchParams.set(key, value);
    }
  }

  return new Request(url, request) as NextRequest;
}

function buildContext(segments: string[]) {
  return {
    params: Promise.resolve({ auth: segments }),
  };
}

export function forwardAuthGet(
  request: NextRequest,
  segments: string[],
  extraQuery?: Record<string, string>
) {
  const forwarded = buildForwardedRequest(request, segments, extraQuery);
  return providers.auth.handlers.GET(forwarded, buildContext(segments));
}

export function forwardAuthPost(
  request: NextRequest,
  segments: string[],
  extraQuery?: Record<string, string>
) {
  const forwarded = buildForwardedRequest(request, segments, extraQuery);
  return providers.auth.handlers.POST(forwarded, buildContext(segments));
}
