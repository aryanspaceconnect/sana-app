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
 * 5. gemma-4-31b-it (Google Gemma 4 31B instruction-tuned dense multimodal model)
 * 6. gemma-4-26b-moe (Google Gemma 4 26B Mixture-of-Experts)
 * 7. gemma-3-27b-it (Google Gemma 3 27B instruction-tuned open weights model tier)
 * 8. gemma-2-27b-it (Google Gemma 2 27B open weights model tier)
 * 9. gemma-2-9b-it (Google Gemma 2 9B lightweight fast tier)
 * 10. gemini-2.5-pro (Pro tier fallback)
 */
export const GEMINI_MODEL_CASCADE = [
  'gemini-3.6-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemma-4-31b-it',
  'gemma-4-26b-moe',
  'gemma-3-27b-it',
  'gemma-2-27b-it',
  'gemma-2-9b-it',
  'gemini-2.5-pro'
];

export class RateLimiterTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimiterTimeoutError';
  }
}

export class SlidingWindowRateLimiter {
  private timestamps: number[] = [];
  private maxRequests: number;
  private windowMs: number;
  private name: string;

  constructor(name: string, maxRequests: number, windowMs: number = 60000) {
    this.name = name;
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  public async acquire(maxWaitMs: number = 10000): Promise<void> {
    const startTime = Date.now();
    while (true) {
      const now = Date.now();
      this.timestamps = this.timestamps.filter((ts) => now - ts < this.windowMs);

      if (this.timestamps.length < this.maxRequests) {
        this.timestamps.push(now);
        return;
      }

      const elapsed = now - startTime;
      if (elapsed >= maxWaitMs) {
        throw new RateLimiterTimeoutError(
          `[RateLimiter:${this.name}] Timed out after waiting ${elapsed}ms for quota slot (${this.timestamps.length}/${this.maxRequests} req/min).`
        );
      }

      const oldest = this.timestamps[0];
      const waitMs = Math.min((oldest + this.windowMs) - now + 100, maxWaitMs - elapsed);
      if (waitMs > 0) {
        console.log(`[RateLimiter:${this.name}] Active limit reached (${this.timestamps.length}/${this.maxRequests} req/min). Pacing request, waiting ${Math.ceil(waitMs)}ms...`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }

  public get activeCount(): number {
    const now = Date.now();
    return this.timestamps.filter((ts) => now - ts < this.windowMs).length;
  }
}

// Global rate limiters configured to user thresholds:
// Google Gemini API: Max 120 RPM to support multi-turn reasoning loops
export const googleRateLimiter = new SlidingWindowRateLimiter('GoogleGemini', 120, 60000);

// NVIDIA API Endpoint (z-ai/glm-5.2): Max 35 RPM
export const nvidiaRateLimiter = new SlidingWindowRateLimiter('NvidiaGLM', 35, 60000);

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
 * Helper to determine if a query is a straightforward/simple turn (e.g., time, greetings, lookups)
 */
export function isSimpleTurn(contents: any): boolean {
  if (!contents) return true;
  let text = '';
  if (typeof contents === 'string') {
    text = contents;
  } else if (Array.isArray(contents)) {
    const last = contents[contents.length - 1];
    if (typeof last === 'string') text = last;
    else if (last?.parts) {
      text = last.parts.map((p: any) => (typeof p === 'string' ? p : p.text || '')).join(' ');
    } else if (last?.content) {
      text = String(last.content);
    }
  }

  const trimmed = text.trim().toLowerCase();
  if (trimmed.length < 150) return true;
  if (/time|date|today|hello|hi|what is|clock|hour|minute|status|weather/i.test(trimmed)) return true;
  return false;
}

/**
 * Execute NVIDIA API call with AbortController timeout protection to prevent hanging requests.
 */
async function fetchNvidiaCompletion(
  model: string,
  messages: any[],
  options: LLMRouterOptions,
  timeoutMs = 25000,
  enableThinking = true
) {
  const apiKey = process.env.GAMMA_API_KEY || process.env.GAMMA_DIFFUSION_API_KEY || process.env.NVIDIA_API_KEY || "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";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const bodyPayload: any = {
      model,
      messages,
      temperature: options.temperature !== undefined ? options.temperature : 1,
      top_p: model.includes('diffusiongemma') ? 0.95 : 1,
      max_tokens: model.includes('diffusiongemma') ? 4096 : 16384,
      seed: 42
    };

    if (enableThinking && model.includes('diffusiongemma')) {
      bodyPayload.chat_template_kwargs = { enable_thinking: true };
    }

    // Convert Gemini tools to OpenAI function format for Nvidia endpoints
    if (options.tools && options.tools.length > 0) {
      const openAiTools: any[] = [];
      for (const t of options.tools) {
        if (t.functionDeclarations && Array.isArray(t.functionDeclarations)) {
          for (const fd of t.functionDeclarations) {
            openAiTools.push({
              type: 'function',
              function: {
                name: fd.name,
                description: fd.description,
                parameters: fd.parameters
              }
            });
          }
        }
      }
      if (openAiTools.length > 0) {
        bodyPayload.tools = openAiTools;
        bodyPayload.tool_choice = 'auto';
      }
    }

    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(bodyPayload),
      signal: controller.signal
    });

    clearTimeout(timer);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`NVIDIA API call failed [HTTP ${response.status}] for model '${model}': ${errText}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const responseText = choice?.message?.content || "";
    const reasoningContent = choice?.message?.reasoning_content || data.additional_kwargs?.reasoning_content;

    const functionCalls: LLMFunctionCall[] = [];

    // Parse native OpenAI tool calls if present
    if (choice?.message?.tool_calls && Array.isArray(choice.message.tool_calls)) {
      for (const tc of choice.message.tool_calls) {
        if (tc.function?.name) {
          let parsedArgs: Record<string, any> = {};
          try {
            parsedArgs = typeof tc.function.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : (tc.function.arguments || {});
          } catch {}
          functionCalls.push({
            name: tc.function.name,
            args: parsedArgs
          });
        }
      }
    }

    // Monologue Fallback Parser: If text describes tool invocation (e.g. "I'll call access_file with /daily_scans/...")
    if (functionCalls.length === 0 && responseText) {
      const accessFileMatch = responseText.match(/(?:access_file|path|read)\s*(?:with\s*)?(?:\/|path\s*:?\s*)?((?:\/daily_scans|\/intermediate_scans|\/)[a-zA-Z0-9_\-\.\/]+)/i);
      if (accessFileMatch) {
        functionCalls.push({
          name: 'access_file',
          args: { filePathOrId: accessFileMatch[1].trim() }
        });
      } else if (/retrieve_skin_scan_vault|facial scan record|latest scan|face scan data/i.test(responseText)) {
        functionCalls.push({
          name: 'retrieve_skin_scan_vault',
          args: { scanType: 'all', limit: 5 }
        });
      }
    }

    return {
      text: responseText,
      functionCalls,
      data,
      reasoningContent
    };
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error(`NVIDIA API call timed out after ${timeoutMs}ms on model '${model}'`);
    }
    throw err;
  }
}

/**
 * NVIDIA AI Endpoint fallback client using Cascade:
 * 1. google/diffusiongemma-26b-a4b-it (Fast Diffusion Model)
 * 2. z-ai/glm-5.2 (Deep Reasoning Model for complex turns)
 */
export async function callNvidiaFallback(options: LLMRouterOptions): Promise<LLMRouterResult> {
  await nvidiaRateLimiter.acquire();
  const messages = formatContentsForNvidia(options.contents, options.systemInstruction);
  const simpleQuery = isSimpleTurn(options.contents);

  console.log(`[LLMRouter] Activating NVIDIA fallback (Simple query: ${simpleQuery})...`);

  // Step 1: Try Fast Google Diffusion Gemma model first for simple/routine queries or initial attempt
  try {
    console.log("[LLMRouter] Attempting fast diffusion model (google/diffusiongemma-26b-a4b-it)...");
    const res = await fetchNvidiaCompletion("google/diffusiongemma-26b-a4b-it", messages, options, 20000, true);

    if (res.text || res.functionCalls.length > 0) {
      console.log("[LLMRouter] Successfully served via fast model google/diffusiongemma-26b-a4b-it!");
      return {
        text: res.text,
        functionCalls: res.functionCalls,
        modelUsed: "google/diffusiongemma-26b-a4b-it (NVIDIA AI Endpoint)",
        attemptsCount: 1,
        thoughts: res.reasoningContent ? [res.reasoningContent] : ["[Fast Diffusion Model Active] Served via google/diffusiongemma-26b-a4b-it"],
        rawResponse: res.data
      };
    }
  } catch (diffusionErr: any) {
    console.warn(`[LLMRouter] Diffusion Gemma model failed or timed out (${diffusionErr?.message || String(diffusionErr)}). Funneling down to z-ai/glm-5.2...`);
  }

  // Step 2: Funnel down to GLM deep reasoning model (z-ai/glm-5.2) with strict 30s timeout
  console.log("[LLMRouter] Funneling down to deep reasoning model (z-ai/glm-5.2)...");
  try {
    const res = await fetchNvidiaCompletion("z-ai/glm-5.2", messages, options, 30000, false);
    return {
      text: res.text,
      functionCalls: res.functionCalls,
      modelUsed: "z-ai/glm-5.2 (NVIDIA AI Endpoint)",
      attemptsCount: 2,
      thoughts: ["[Deep Thinking GLM Active] Served via z-ai/glm-5.2 model"],
      rawResponse: res.data
    };
  } catch (glmErr: any) {
    console.error("[LLMRouter] Deep reasoning model z-ai/glm-5.2 failed:", glmErr?.message || glmErr);
    throw glmErr;
  }
}

/**
 * NVIDIA AI Endpoint streaming fallback client using Diffusion Gemma -> GLM-5.2 cascade
 */
export async function* streamNvidiaFallback(options: LLMRouterOptions) {
  await nvidiaRateLimiter.acquire();
  const apiKey = process.env.GAMMA_API_KEY || process.env.GAMMA_DIFFUSION_API_KEY || process.env.NVIDIA_API_KEY || "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";
  const messages = formatContentsForNvidia(options.contents, options.systemInstruction);

  const modelToUse = "google/diffusiongemma-26b-a4b-it";
  console.log(`[LLMRouter Stream] Activating NVIDIA streaming fallback (model: ${modelToUse})...`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelToUse,
        messages,
        temperature: options.temperature !== undefined ? options.temperature : 1,
        top_p: 0.95,
        max_tokens: 4096,
        seed: 42,
        stream: true,
        chat_template_kwargs: {
          enable_thinking: true
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timer);

    if (!response.ok || !response.body) {
      throw new Error(`NVIDIA Stream API call failed [HTTP ${response.status}]`);
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
                modelUsed: `${modelToUse} (NVIDIA AI Endpoint)`
              };
            }
          } catch {
            // ignore chunk parse error
          }
        }
      }
    }
  } catch (streamErr: any) {
    clearTimeout(timer);
    console.warn("[LLMRouter Stream] Diffusion Gemma streaming failed, falling back to GLM-5.2 stream...");

    // Streaming Fallback to GLM-5.2
    const glmResponse = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
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

    if (!glmResponse.ok || !glmResponse.body) {
      const errText = await glmResponse.text();
      throw new Error(`NVIDIA GLM Stream failed [HTTP ${glmResponse.status}]: ${errText}`);
    }

    const reader = glmResponse.body.getReader();
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

  let googleQuotaExhausted = false;

  for (const model of GEMINI_MODEL_CASCADE) {
    if (googleQuotaExhausted) break;

    attemptsCount++;
    let modelRetries = 0;
    const maxModelRetries = 2; // Retry up to 2 times on transient 503/429/500 errors per model

    while (modelRetries <= maxModelRetries) {
      try {
        await googleRateLimiter.acquire();
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
            const actualTextParts: string[] = [];

            if (response.candidates?.[0]?.content?.parts) {
              for (const part of response.candidates[0].content.parts) {
                if ((part as any).thought) {
                  const tVal = typeof (part as any).thought === 'string'
                    ? (part as any).thought
                    : (part.text || '');
                  if (tVal) thoughts.push(tVal);
                } else if (part.text) {
                  actualTextParts.push(part.text);
                }

                if (part.functionCall) {
                  functionCalls.push({
                    name: part.functionCall.name,
                    args: (part.functionCall.args as Record<string, any>) || {}
                  });
                }
              }
            } else if (response.text) {
              actualTextParts.push(response.text);
            }

            if (response.functionCalls && response.functionCalls.length > 0) {
              for (const fc of response.functionCalls) {
                if (!functionCalls.some(f => f.name === fc.name)) {
                  functionCalls.push({
                    name: fc.name,
                    args: (fc.args as Record<string, any>) || {}
                  });
                }
              }
            }

            const text = actualTextParts.join('').trim();

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

        const isQuotaExceeded = err instanceof RateLimiterTimeoutError || /429|RESOURCE_EXHAUSTED|RATE_LIMIT|quota|limit/i.test(errMsg);
        const isTransient = /503|UNAVAILABLE|500|high demand/i.test(errMsg);

        if (isQuotaExceeded) {
          console.warn(`[LLMRouter] Model '${model}' hit quota/rate-limit. Trying next Gemini model in cascade...`);
          break; // Move to next model in GEMINI_MODEL_CASCADE
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
      await googleRateLimiter.acquire();
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

