// TODO: Implement the code here to add rate limiting with Redis
// Refer to the Next.js Docs: https://nextjs.org/docs/app/building-your-application/routing/middleware
// Refer to Redis docs on Rate Limiting: https://upstash.com/docs/redis/sdks/ratelimit-ts/algorithms

import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ratelimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(4, "60 s"),
  analytics: true,
});

export async function middleware(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1";

    const { success, limit, reset, remaining } = await ratelimit.limit(ip);

    //return response with rate limit headers
    const response = success
      ? NextResponse.next()
      : NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
    //Add ratelimit info to response headers
    response.headers.set("X-Ratelimit-Limit", limit.toString());
    response.headers.set("X-Ratelimit-Reset", reset.toString());
    response.headers.set("X-Ratelimit-Remaining", remaining.toString());

    return response;
  } catch (error) {
    console.error("Error in middleware:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

// Configure which paths the middleware runs on
export const config = {
  matcher: [
    /*
     * Match all request paths except static files and images
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
