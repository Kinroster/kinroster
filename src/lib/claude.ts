import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const RETRY_DELAY_MS = 2000;
const TIMEOUT_MS = 10000;

/**
 * Anthropic prompt-cache defaults to 5 min; the SDK accepts a 1h TTL on
 * cache_control which costs more on write but amortizes across a shift.
 *
 * Cache breakpoints we use across the codebase (under the 4-breakpoint cap):
 *   #1  systemPrompt              — static template per call-site
 *   #2  systemPromptSuffix        — per-resident or per-tenant static block
 *   #3  userPromptCachedPrefix    — per-resident user-message header that
 *                                   repeats across calls in a shift
 *
 * The volatile tail (the actual user input) stays uncached. See
 * docs/engineering/resident-conversation-thread-plan.md §Caching strategy.
 */
interface ClaudeCallOptions {
  model?: string;
  systemPrompt: string;
  /**
   * Cached + uncached split of the system parameter. When set, the system
   * is sent as two content blocks: `systemPrompt` (cached) + this
   * (uncached). Use when the template is static but a tiny tail varies.
   */
  systemPromptSuffix?: string;
  userPrompt: string;
  /**
   * Cached prefix of the USER message. When set, the user message is sent
   * as two content blocks: `userPromptCachedPrefix` (cached) +
   * `userPrompt` (uncached tail). Enables the 3rd cache breakpoint for
   * per-resident static context (name, conditions, cultural register)
   * that repeats across every call in a shift.
   */
  userPromptCachedPrefix?: string;
  maxTokens?: number;
  /**
   * Set to false to disable prompt caching entirely. Defaults to true.
   */
  cacheSystem?: boolean;
  /**
   * Anthropic prompt-cache TTL applied to ALL cache_control blocks on
   * this call. Defaults to '5m'. '1h' is appropriate when the same
   * static block (e.g., per-resident header) will be reused many times
   * within a shift — the 1h cache write costs more but eliminates
   * repeated writes every 5 min.
   */
  cacheTtl?: "5m" | "1h";
}

export type ClaudeModel =
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5"
  | (string & {});

/**
 * Telemetry returned alongside the model output. Anthropic surfaces
 * cache hit / write counts on every response; we propagate them so
 * callers can persist them to notes.metadata.tokens_used and build
 * per-org cost dashboards. All fields default to 0 when the API
 * omits them.
 */
export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface ClaudeResponse {
  text: string;
  usage: ClaudeUsage;
}

/**
 * Pick a model for the workload. Use Sonnet for the one expensive call per
 * note (clinical structuring, clinician summary, family update). Use Haiku
 * for translation passes, classification, and rolling-summary refresh — it's
 * roughly 10× cheaper and quality is sufficient when the input is already
 * structured.
 */
export function modelFor(
  workload: "structure" | "translate" | "classify" | "summarize"
): ClaudeModel {
  switch (workload) {
    case "structure":
    case "summarize":
      return "claude-sonnet-4-6";
    case "translate":
    case "classify":
      return "claude-haiku-4-5";
  }
}

type CacheControl =
  | { type: "ephemeral" }
  | { type: "ephemeral"; ttl: "5m" | "1h" };

function cacheControl(ttl: "5m" | "1h" | undefined): CacheControl {
  if (ttl === "1h") return { type: "ephemeral", ttl: "1h" };
  return { type: "ephemeral" };
}

type TextBlock = {
  type: "text";
  text: string;
  cache_control?: CacheControl;
};

export async function callClaudeWithUsage({
  model = "claude-sonnet-4-6",
  systemPrompt,
  systemPromptSuffix,
  userPrompt,
  userPromptCachedPrefix,
  maxTokens = 1024,
  cacheSystem = true,
  cacheTtl,
}: ClaudeCallOptions): Promise<ClaudeResponse> {
  const cc = cacheControl(cacheTtl);

  // Build the system parameter. When caching is on, the static
  // systemPrompt is the first cache breakpoint; an optional
  // systemPromptSuffix is the second.
  const buildSystem = (): string | TextBlock[] => {
    if (!cacheSystem) {
      return systemPromptSuffix
        ? `${systemPrompt}\n\n${systemPromptSuffix}`
        : systemPrompt;
    }
    const blocks: TextBlock[] = [
      { type: "text", text: systemPrompt, cache_control: cc },
    ];
    if (systemPromptSuffix) {
      // Suffix is sent uncached so it can vary per call without
      // invalidating the cached prefix. If a caller wants the suffix
      // cached too, lift it into systemPrompt.
      blocks.push({ type: "text", text: systemPromptSuffix });
    }
    return blocks;
  };

  // Build the user message. When userPromptCachedPrefix is set, the
  // user message becomes two blocks: cached prefix + uncached tail.
  // This unlocks the third cache breakpoint for per-resident static
  // context shared across many calls in a shift.
  const buildUserContent = (): string | TextBlock[] => {
    if (!userPromptCachedPrefix) return userPrompt;
    const blocks: TextBlock[] = [
      {
        type: "text",
        text: userPromptCachedPrefix,
        cache_control: cc,
      },
      { type: "text", text: userPrompt },
    ];
    return blocks;
  };

  const makeCall = () =>
    anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system: buildSystem() as unknown as string,
      messages: [
        {
          role: "user",
          // The SDK types accept string | ContentBlockParam[]; we
          // conditionally build one or the other above.
          content: buildUserContent() as unknown as string,
        },
      ],
    });

  const extractText = (response: Awaited<ReturnType<typeof makeCall>>) => {
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from Claude");
    }
    return textBlock.text;
  };

  const extractUsage = (
    response: Awaited<ReturnType<typeof makeCall>>
  ): ClaudeUsage => {
    const u = response.usage as
      | {
          input_tokens?: number;
          output_tokens?: number;
          cache_read_input_tokens?: number | null;
          cache_creation_input_tokens?: number | null;
        }
      | undefined;
    return {
      input_tokens: u?.input_tokens ?? 0,
      output_tokens: u?.output_tokens ?? 0,
      cache_read_input_tokens: u?.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: u?.cache_creation_input_tokens ?? 0,
    };
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await makeCall();
    clearTimeout(timeout);
    return { text: extractText(response), usage: extractUsage(response) };
  } catch (error: unknown) {
    const isRetryable =
      error instanceof Anthropic.APIError
        ? error.status >= 500
        : error instanceof Error && error.name === "AbortError";

    if (isRetryable) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      const response = await makeCall();
      return { text: extractText(response), usage: extractUsage(response) };
    }

    throw error;
  }
}

/**
 * Thin wrapper for callers that don't need the usage telemetry. Existing
 * call sites can migrate to callClaudeWithUsage at their leisure.
 */
export async function callClaude(opts: ClaudeCallOptions): Promise<string> {
  const { text } = await callClaudeWithUsage(opts);
  return text;
}

export function parseJsonResponse<T>(raw: string): T {
  // Strip markdown code fences if present
  const cleaned = raw
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```$/m, "")
    .trim();
  return JSON.parse(cleaned) as T;
}
