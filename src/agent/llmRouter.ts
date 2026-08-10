import { GoogleGenAI } from '@google/genai';

export interface LLMRouterOptions {
  contents: any;
  systemInstruction?: string;
  tools?: any[];
  responseMimeType?: string;
  temperature?: number;
  timeoutMs?: number;
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
  rawResponse?: any;
}

/**
 * Descending cascade of Gemini models by intelligence, capability, and availability:
 * 1. gemini-3.6-flash (Primary: top Flash intelligence & reasoning)
 * 2. gemini-3.1-pro-preview (Pro tier fallback)
 * 3. gemini-3.1-flash-lite (Lite tier fallback: ultra-fast, high quota availability)
 * 4. gemini-flash-latest (General alias fallback)
 * 5. gemini-2.5-flash (Legacy compatibility fallback)
 */
export const GEMINI_MODEL_CASCADE = [
  'gemini-3.6-flash',
  'gemini-3.1-pro-preview',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-2.5-flash'
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
          if (options.tools && options.tools.length > 0) {
            config.tools = options.tools;
          }

          const response = await ai.models.generateContent({
            model,
            contents: options.contents,
            config: Object.keys(config).length > 0 ? config : undefined
          });

          const functionCalls: LLMFunctionCall[] = [];
          
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
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      console.warn(`[LLMRouter] Model '${model}' failed (attempt #${attemptsCount}):`, errMsg);
      lastError = err;
      // Brief backoff before attempting next model in cascade
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  throw new AllModelsExhaustedError(
    `All LLM fallback models failed in router. Last error: ${lastError?.message || String(lastError)}`,
    lastError
  );
}

