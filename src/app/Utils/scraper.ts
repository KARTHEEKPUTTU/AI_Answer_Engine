import axios from "axios";
import * as cheerio from "cheerio";
import { Logger } from "./logger";
import { Redis } from "@upstash/redis";

const logger = new Logger("scraper");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Cache TTL in seconds (7 days)
const CACHE_TTL = 7 * (24 * 60 * 60);
const MAX_CACHE_SIZE = 1024000; // 1MB limit for cached content

export const urlPattern =
  /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").replace(/\n+/g, "").trim();
}

export async function scrape_url(url: string) {
  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    $("script").remove();
    $("style").remove();
    $("noscript").remove();
    $("iframe").remove();
    $("img").remove();
    $("video").remove();
    $("audio").remove();
    $("form").remove();
    $("button").remove();

    const title = $("title").text();
    const metaDescription = $('meta[name="description"]').attr("content") || "";
    const h1 = $("h1")
      .map((i, el) => $(el).text())
      .get()
      .join(" ");
    const h2 = $("h2")
      .map((i, el) => $(el).text())
      .get()
      .join(" ");

    const articleText = $("article")
      .map((i, el) => $(el).text())
      .get()
      .join(" ");
    const mainText = $("main")
      .map((i, el) => $(el).text())
      .get()
      .join(" ");

    const contentText = $('.content, #content, [class*="content"]')
      .map((i, el) => $(el).text())
      .get()
      .join(" ");

    const paragraphText = $("p")
      .map((i, el) => $(el).text())
      .get()
      .join(" ");
    const listText = $("li")
      .map((i, el) => $(el).text())
      .get()
      .join(" ");

    let combinedText = [
      title,
      metaDescription,
      h1,
      h2,
      articleText,
      mainText,
      contentText,
      paragraphText,
      listText,
    ].join(" ");
    combinedText = cleanText(combinedText).slice(0, 40000);

    return {
      url,
      title: cleanText(title),
      headings: {
        h1: cleanText(h1),
        h2: cleanText(h2),
      },
      metaDescription: cleanText(metaDescription),
      content: combinedText,
      error: null,
    };
  } catch (error) {
    console.error("Error scraping $(url):", error);
    return {
      url,
      title: "",
      headings: {
        h1: "",
        h2: "",
      },
      metaDescription: "",
      content: "",
      error: "Failed to scrape URL",
    };
  }
}
export interface scraped_content {
  url: string;
  title: "string";
  headings: {
    h1: "string";
    h2: "string";
  };
  metaDescription: "string";
  content: "string";
  error: "string | null";
  cachedAt?: number;
}

// Validation function for ScrapedContent
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isValidscraped_content(data: any): data is scraped_content {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof data.url === "string" &&
    typeof data.title === "string" &&
    typeof data.headings === "object" &&
    typeof data.headings.h1 === "string" &&
    typeof data.headings.h2 === "string" &&
    typeof data.metaDescription === "string" &&
    typeof data.content === "string" &&
    (data.error === null || typeof data.error === "string")
  );
}

//Function to get cache key for a url with sanitization
function getCacheKey(url: string): string {
  const sanitizedURL = url.substring(0, 200); // Limit key length
  return `scrape : ${sanitizedURL}`;
}
//Function to get cached content with error handling
async function getCachedContent(url: string): Promise<scraped_content | null> {
  try {
    const cachekey = getCacheKey(url);
    logger.info(`checking cache for key: ${cachekey}`);
    const cached = await redis.get(cachekey);

    if (!cached) {
      logger.info(`Cache miss - No cached content found for: ${url}`);
      return null;
    }

    logger.info(`Cache hit - Found cached content for: ${url}`);

    // Handle both string and object responses from Redis
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: any;
    if (typeof cached === "string") {
      try {
        parsed = JSON.parse(cached);
      } catch (parseError) {
        logger.error(`JSON parse error for cached content: ${parseError}`);
        await redis.del(cachekey);
        return null;
      }
    } else {
      parsed = cached;
    }

    if (!isValidscraped_content(parsed)) {
      const age = Date.now() - (parsed.cachedAt || 0);
      logger.info(`Cache content age: ${Math.round(age / 1000 / 60)} minutes`);
      return parsed;
    }

    logger.warn(`Invalid cached content format for URL: ${url}`);
    await redis.del(cachekey);
    return null;
  } catch (error) {
    logger.error(`Cache retrieval error: ${error}`);
    return null;
  }
}
// Function to cache scraped content with error handling
async function cacheContent(
  url: string,
  content: scraped_content
): Promise<void> {
  try {
    const cachekey = getCacheKey(url);
    content.cachedAt = Date.now();

    // Validate content before serializing
    if (!isValidscraped_content(content)) {
      logger.error(`Attempted to cache invalid content format for URL: ${url}`);
      return;
    }

    const serialized = JSON.stringify(content);

    if (serialized.length > MAX_CACHE_SIZE) {
      logger.warn(
        `Content too large to cache for URL: ${url} (${serialized.length} bytes)`
      );
      return;
    }

    await redis.set(cachekey, serialized, { ex: CACHE_TTL });
    logger.info(
      `Successfully cached content for: ${url} (${serialized.length} bytes, TTL: ${CACHE_TTL})`
    );
  } catch (error) {
    logger.error(`Cache storage error: ${error}`);
  }
}

