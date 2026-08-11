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
 * Helper to convert arbitrary contents & systemInstruction into OpenAI chat messages format
 * for ChatNVIDIA / NVIDIA AI Foundation Endpoints.
 */
export function formatContentsForNvidia(contents: any, systemInstruction?: string) {
  const messages: { role: string; content: string }[] = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }

  if (Array.isArray(contents)) {
    for (const msg of contents) {
      if (typeof msg === 'string') {
        messages.push({ role: 'user', content: msg });
      } else if (msg.role && Array.isArray(msg.parts)) {
        const textParts = msg.parts
          .map((p: any) => (typeof p === 'string' ? p : p.text || ''))
          .filter(Boolean)
          .join('\n');
        const role = msg.role === 'model' ? 'assistant' : msg.role;
        messages.push({ role, content: textParts });
      } else if (msg.content) {
        messages.push({ role: msg.role || 'user', content: String(msg.content) });
      }
    }
  } else if (typeof contents === 'string') {
    messages.push({ role: 'user', content: contents });
  }

  if (messages.length === 0) {
    messages.push({ role: 'user', content: 'Hello' });
  }

  return messages;
}

/**
 * NVIDIA AI Endpoint fallback client using ChatNVIDIA parameters (z-ai/glm-5.2)
 * Triggers seamlessly when Gemini tokens/quota are completely exhausted.
 */
export async function callNvidiaFallback(options: LLMRouterOptions): Promise<LLMRouterResult> {
  const apiKey = process.env.NVIDIA_API_KEY || "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";
  const messages = formatContentsForNvidia(options.contents, options.systemInstruction);

  console.log("[LLMRouter] Gemini quota/tokens exhausted or client unavailable. Triggering ChatNVIDIA fallback (model: z-ai/glm-5.2)...");

  try {
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "z-ai/glm-5.2",
        messages,
        temperature: options.temperature !== undefined ? options.temperature : 1,
        top_p: 1,
        max_tokens: 16384,
        seed: 42
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`NVIDIA API call failed [HTTP ${response.status}]: ${errText}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const responseText = choice?.message?.content || "";

    return {
      text: responseText,
      functionCalls: [],
      modelUsed: "z-ai/glm-5.2 (NVIDIA AI Endpoint)",
      attemptsCount: 1,
      thoughts: ["[NVIDIA ChatNVIDIA Active] Served via z-ai/glm-5.2 model when Gemini tokens were exhausted."],
      rawResponse: data
    };
  } catch (err: any) {
    console.error("[LLMRouter] NVIDIA Fallback error:", err?.message || err);
    throw err;
  }
}

/**
 * NVIDIA AI Endpoint streaming fallback client using ChatNVIDIA parameters (z-ai/glm-5.2)
 */
export async function* streamNvidiaFallback(options: LLMRouterOptions) {
  const apiKey = process.env.NVIDIA_API_KEY || "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";
  const messages = formatContentsForNvidia(options.contents, options.systemInstruction);

  console.log("[LLMRouter Stream] Gemini quota/tokens exhausted. Triggering ChatNVIDIA streaming fallback (model: z-ai/glm-5.2)...");

  const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "z-ai/glm-5.2",
      messages,
      temperature: options.temperature !== undefined ? options.temperature : 1,
      top_p: 1,
      max_tokens: 16384,
      seed: 42,
      stream: true
    })
  });

  if (!response.ok || !response.body) {
    const errText = await response.text();
    throw new Error(`NVIDIA Stream API call failed [HTTP ${response.status}]: ${errText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;
      if (trimmed === 'data: [DONE]') return;
      if (trimmed.startsWith('data: ')) {
        try {
          const json = JSON.parse(trimmed.slice(6));
          const deltaText = json.choices?.[0]?.delta?.content;
          if (deltaText) {
            yield {
              chunk: {
                candidates: [
                  {
                    content: {
                      parts: [{ text: deltaText }]
                    }
                  }
                ]
              },
              modelUsed: "z-ai/glm-5.2 (NVIDIA AI Endpoint)"
            };
          }
        } catch {
          // ignore chunk parse error
        }
      }
    }
  }
}

/**
 * Executes a Gemini content generation request through a paranoid fallback router.
 * Automatically tries descending models if quota, rate-limit (429), timeouts, or model errors occur.
 * If all Gemini models run out of tokens/quota, seamlessly falls back to ChatNVIDIA (z-ai/glm-5.2).
 */
export async function generateContentWithRouter(
  options: LLMRouterOptions
): Promise<LLMRouterResult> {
  const ai = getGenAIClient();
  if (!ai) {
    console.warn("[LLMRouter] GEMINI_API_KEY is missing. Directly falling back to ChatNVIDIA (z-ai/glm-5.2).");
    return callNvidiaFallback(options);
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

  console.warn(`[LLMRouter] All Gemini models in cascade failed. Activating ChatNVIDIA (z-ai/glm-5.2) fallback...`);
  try {
    return await callNvidiaFallback(options);
  } catch (nvidiaErr: any) {
    throw new AllModelsExhaustedError(
      `All Gemini models and NVIDIA fallback failed in router. Gemini last error: ${lastError?.message || String(lastError)}. NVIDIA error: ${nvidiaErr?.message || String(nvidiaErr)}`,
      lastError
    );
  }
}

export async function* generateContentStreamWithRouter(options: LLMRouterOptions) {
  const ai = getGenAIClient();
  if (!ai) {
    console.warn("[LLMRouter Stream] GEMINI_API_KEY is missing. Streaming via ChatNVIDIA (z-ai/glm-5.2) fallback.");
    yield* streamNvidiaFallback(options);
    return;
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

  console.warn(`[LLMRouter Stream] All Gemini models in stream cascade failed. Streaming via ChatNVIDIA (z-ai/glm-5.2)...`);
  try {
    yield* streamNvidiaFallback(options);
  } catch (nvidiaErr: any) {
    throw new AllModelsExhaustedError(
      `All Gemini models and NVIDIA stream fallback failed. Gemini error: ${lastError?.message || String(lastError)}. NVIDIA error: ${nvidiaErr?.message || String(nvidiaErr)}`,
      lastError
    );
  }
}

