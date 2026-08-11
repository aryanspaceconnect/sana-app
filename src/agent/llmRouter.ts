import { GoogleGenAI } from '@google/genai';

export interface LLMRouterOptions {
  contents: any;
  systemInstruction?: string;
  tools?: any[];
  responseMimeType?: string;
  temperature?: number;
  timeoutMs?: number;
  includeThoughts?: boolean;
}

export interface LLMFunctionCall {
  name: string;
  args: Record<string, any>;
}

export interface LLMRouterResult {
  text: string;
  functionCalls: LLMFunctionCall[];
  modelUsed: string;
  attemptsCount: number;
  thoughts?: string[];
  rawResponse?: any;
}

/**
 * Descending cascade of Gemini models by intelligence, capability, and throughput:
 * 1. gemini-3.6-flash (Default primary: state-of-the-art Flash intelligence)
 * 2. gemini-2.5-flash (High intelligence fallback)
 * 3. gemini-2.0-flash (Fast, reliable high-throughput fallback)
 * 4. gemini-2.0-flash-lite (Ultra-fast, high quota availability fallback)
 * 5. gemini-2.5-pro (Pro tier fallback)
 */
export const GEMINI_MODEL_CASCADE = [
  'gemini-3.6-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.5-pro'
];

let globalAIClient: GoogleGenAI | null = null;

export function getGenAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  if (!globalAIClient) {
    globalAIClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return globalAIClient;
}

export class AllModelsExhaustedError extends Error {
  public lastError: any;
  constructor(message: string, lastError?: any) {
    super(message);
    this.name = 'AllModelsExhaustedError';
    this.lastError = lastError;
  }
}

/**
 * Executes a Gemini content generation request through a paranoid fallback router.
 * Automatically tries descending models if quota, rate-limit (429), timeouts, or model errors occur.
 * Supports native Function Calling and tool outputs.
 */
export async function generateContentWithRouter(
  options: LLMRouterOptions
): Promise<LLMRouterResult> {
  const ai = getGenAIClient();
  if (!ai) {
    throw new AllModelsExhaustedError('GEMINI_API_KEY environment variable is missing.');
  }

  const timeoutMs = options.timeoutMs || 15000;
  let attemptsCount = 0;
  let lastError: any = null;

  for (const model of GEMINI_MODEL_CASCADE) {
    attemptsCount++;
    let modelRetries = 0;
    const maxModelRetries = 2; // Retry up to 2 times on transient 503/429/500 errors per model

    while (modelRetries <= maxModelRetries) {
      try {
        const result = await Promise.race([
          (async () => {
            const config: any = {};
            if (options.systemInstruction) {
              config.systemInstruction = options.systemInstruction;
            }
            if (options.responseMimeType) {
              config.responseMimeType = options.responseMimeType;
            }
            if (options.temperature !== undefined) {
              config.temperature = options.temperature;
            }
            if (options.includeThoughts) {
              config.thinkingConfig = {
                includeThoughts: true
              };
            }
            if (options.tools && options.tools.length > 0) {
              config.tools = options.tools;
            }

            const response = await ai.models.generateContent({
              model,
              contents: options.contents,
              config: Object.keys(config).length > 0 ? config : undefined
            });

            const functionCalls: LLMFunctionCall[] = [];
            const thoughts: string[] = [];

            if (response.candidates?.[0]?.content?.parts) {
              for (const part of response.candidates[0].content.parts) {
                if ((part as any).thought) {
                  thoughts.push((part as any).thought);
                }
              }
            }

            if (response.functionCalls && response.functionCalls.length > 0) {
              for (const fc of response.functionCalls) {
                functionCalls.push({
                  name: fc.name,
                  args: (fc.args as Record<string, any>) || {}
                });
              }
            } else if (response.candidates?.[0]?.content?.parts) {
              for (const part of response.candidates[0].content.parts) {
                if (part.functionCall) {
                  functionCalls.push({
                    name: part.functionCall.name,
                    args: (part.functionCall.args as Record<string, any>) || {}
                  });
                }
              }
            }

            const text = response.text || '';

            return {
              text,
              functionCalls,
              thoughts: thoughts.length > 0 ? thoughts : undefined,
              rawResponse: response
            };
          })(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Timeout after ${timeoutMs}ms on model '${model}'`)),
              timeoutMs
            )
          )
        ]);

        if (result.text || (result.functionCalls && result.functionCalls.length > 0)) {
          console.log(`[LLMRouter] Successfully generated content using model '${model}' (attempt #${attemptsCount}, functionCalls: ${result.functionCalls.length})`);
          return {
            text: result.text,
            functionCalls: result.functionCalls,
            modelUsed: model,
            attemptsCount,
            rawResponse: result.rawResponse
          };
        }
        break; // If executed without throwing but gave no content, break out to next model
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        console.warn(`[LLMRouter] Model '${model}' failed (attempt #${attemptsCount}, retry #${modelRetries}):`, errMsg);
        lastError = err;

        const isQuotaExceeded = /429|RESOURCE_EXHAUSTED|RATE_LIMIT|quota|limit/i.test(errMsg);
        const isTransient = /503|UNAVAILABLE|500|high demand/i.test(errMsg);

        if (isQuotaExceeded) {
          console.log(`[LLMRouter] Model '${model}' quota/rate limit exceeded. Immediately falling through to next model in cascade.`);
          break; // Skip retrying this model and proceed immediately to next model
        }

        if (isTransient && modelRetries < maxModelRetries) {
          modelRetries++;
          const delayMs = 300 * Math.pow(2, modelRetries) + Math.floor(Math.random() * 100);
          console.log(`[LLMRouter] Backing off for ${delayMs}ms before retrying '${model}' (retry #${modelRetries})`);
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        break; // Move to next model in cascade
      }
    }
  }

  throw new AllModelsExhaustedError(
    `All LLM fallback models failed in router. Last error: ${lastError?.message || String(lastError)}`,
    lastError
  );
}

export async function* generateContentStreamWithRouter(options: LLMRouterOptions) {
  const ai = getGenAIClient();
  if (!ai) {
    throw new AllModelsExhaustedError('GEMINI_API_KEY environment variable is missing.');
  }

  let lastError: any = null;

  for (const model of GEMINI_MODEL_CASCADE) {
    try {
      const config: any = {};
      if (options.systemInstruction) {
        config.systemInstruction = options.systemInstruction;
      }
      if (options.temperature !== undefined) {
        config.temperature = options.temperature;
      }
      if (options.includeThoughts) {
        config.thinkingConfig = {
          includeThoughts: true
        };
      }

      const responseStream = await ai.models.generateContentStream({
        model,
        contents: options.contents,
        config: Object.keys(config).length > 0 ? config : undefined
      });

      for await (const chunk of responseStream) {
        yield { chunk, modelUsed: model };
      }
      return;
    } catch (err: any) {
      console.warn(`[LLMRouter Stream] Model '${model}' stream failed:`, err?.message || err);
      lastError = err;
      // Fallback to next model in cascade
    }
  }

  throw new AllModelsExhaustedError(
    `All LLM fallback models failed in stream router. Last error: ${lastError?.message || String(lastError)}`,
    lastError
  );
}

