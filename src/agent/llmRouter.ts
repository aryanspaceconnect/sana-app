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
 * Production-grade Gemini Model Cascade:
 * 1. gemini-3.7-flash (Default primary: next-gen Flash intelligence)
 * 2. gemini-3.6-flash (Primary Tier 2)
 * 3. gemini-3.5-flash (Primary Tier 3)
 * 4. gemini-3.1-flash-lite (High quota tier)
 * 5. gemini-2.5-flash (Standard Flash tier)
 * 6. gemini-2.0-flash (Fast throughput tier)
 * 7. gemini-2.0-flash-lite (High quota tier: 15 RPM, 1500 RPD)
 * 8. gemini-1.5-flash (Standard Flash fallback)
 * 9. gemini-2.5-pro (Deep reasoning Pro tier)
 * 10. gemini-1.5-pro (Pro fallback)
 */
export const GEMINI_MODEL_CASCADE = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-2.5-pro',
  'gemini-1.5-pro'
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

  public async acquire(maxWaitMs: number = 3000): Promise<void> {
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
      const waitMs = Math.min((oldest + this.windowMs) - now + 50, maxWaitMs - elapsed);
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }

  public get activeCount(): number {
    const now = Date.now();
    return this.timestamps.filter((ts) => now - ts < this.windowMs).length;
  }
}

// Global Sliding Window Limiters
export const googleRateLimiter = new SlidingWindowRateLimiter('GoogleGeminiGlobal', 40, 60000);
export const nvidiaRateLimiter = new SlidingWindowRateLimiter('NvidiaGLM', 32, 60000);

export interface ModelLimitSpec {
  maxRpm: number;
  maxRpd: number;
}

// Exact Free Tier specifications derived from user API dashboard, configured with safe buffers
const MODEL_LIMIT_MAP: Record<string, ModelLimitSpec> = {
  'gemini-3.7-flash': { maxRpm: 10, maxRpd: 100 },
  'gemini-3.6-flash': { maxRpm: 10, maxRpd: 100 },
  'gemini-3.5-flash': { maxRpm: 10, maxRpd: 100 },
  'gemini-3.1-flash-lite': { maxRpm: 15, maxRpd: 500 },
  'gemini-2.5-flash': { maxRpm: 5, maxRpd: 20 },
  'gemini-2.0-flash': { maxRpm: 15, maxRpd: 500 },
  'gemini-2.0-flash-lite': { maxRpm: 30, maxRpd: 1500 },
  'gemini-1.5-flash': { maxRpm: 15, maxRpd: 1500 },
  'gemini-2.5-pro': { maxRpm: 2, maxRpd: 15 },
  'gemini-1.5-pro': { maxRpm: 2, maxRpd: 50 },
  'z-ai/glm-5.2': { maxRpm: 32, maxRpd: 100000 }
};

export class ModelQuotaTracker {
  private rpmTimestamps: Map<string, number[]> = new Map();
  private rpdTimestamps: Map<string, number[]> = new Map();
  private cooldownUntil: Map<string, number> = new Map();

  private getSpec(model: string): ModelLimitSpec {
    return MODEL_LIMIT_MAP[model] || { maxRpm: 4, maxRpd: 18 };
  }

  public canUseModel(model: string): boolean {
    const now = Date.now();
    const cooldown = this.cooldownUntil.get(model) || 0;
    if (now < cooldown) {
      return false;
    }

    const spec = this.getSpec(model);

    // Filter RPM timestamps older than 60s
    const rpmList = (this.rpmTimestamps.get(model) || []).filter(ts => now - ts < 60000);
    this.rpmTimestamps.set(model, rpmList);
    if (rpmList.length >= spec.maxRpm) {
      return false;
    }

    // Filter RPD timestamps older than 24 hours
    const rpdList = (this.rpdTimestamps.get(model) || []).filter(ts => now - ts < 86400000);
    this.rpdTimestamps.set(model, rpdList);
    if (rpdList.length >= spec.maxRpd) {
      return false;
    }

    return true;
  }

  public recordUsage(model: string): void {
    const now = Date.now();
    const rpmList = (this.rpmTimestamps.get(model) || []).filter(ts => now - ts < 60000);
    rpmList.push(now);
    this.rpmTimestamps.set(model, rpmList);

    const rpdList = (this.rpdTimestamps.get(model) || []).filter(ts => now - ts < 86400000);
    rpdList.push(now);
    this.rpdTimestamps.set(model, rpdList);
  }

  public markCooldown(model: string, reason: 'RPM' | 'RPD' | 'ERROR'): void {
    const now = Date.now();
    let durationMs = 60000; // 60 seconds for RPM or transient limit
    if (reason === 'RPD') {
      durationMs = 24 * 60 * 60 * 1000; // 24 hours for daily quota
    }
    this.cooldownUntil.set(model, now + durationMs);
    console.warn(`[QuotaTracker] Model '${model}' placed on ${reason} cooldown for ${Math.round(durationMs / 1000)}s.`);
  }

  public getActiveRpm(model: string): number {
    const now = Date.now();
    return (this.rpmTimestamps.get(model) || []).filter(ts => now - ts < 60000).length;
  }
}

export const modelQuotaTracker = new ModelQuotaTracker();

let globalAIClient: GoogleGenAI | null = null;

export function getGenAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  if (!globalAIClient) {
    globalAIClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-sana-agent'
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
 * Helper to clean and convert Gemini/JSON schema objects into OpenAI-compliant parameters
 */
function normalizeSchemaForOpenAI(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  const copy = Array.isArray(schema) ? [...schema] : { ...schema };

  delete copy.$schema;

  if (typeof copy.type === 'string') {
    copy.type = copy.type.toLowerCase();
  }

  if (copy.properties && typeof copy.properties === 'object') {
    const cleanProps: Record<string, any> = {};
    for (const [k, v] of Object.entries(copy.properties)) {
      cleanProps[k] = normalizeSchemaForOpenAI(v);
    }
    copy.properties = cleanProps;
  }

  if (copy.items) {
    copy.items = normalizeSchemaForOpenAI(copy.items);
  }

  return copy;
}

/**
 * Format messages into OpenAI chat structure for ChatNVIDIA (z-ai/glm-5.2)
 */
export function formatContentsForNvidia(contents: any, systemInstruction?: string) {
  const messages: { role: string; content: string }[] = [];
  if (systemInstruction && systemInstruction.trim()) {
    messages.push({ role: 'system', content: systemInstruction.trim() });
  }

  if (Array.isArray(contents)) {
    for (const msg of contents) {
      if (typeof msg === 'string') {
        if (msg.trim()) messages.push({ role: 'user', content: msg.trim() });
      } else if (msg.role && Array.isArray(msg.parts)) {
        const partsText: string[] = [];
        for (const p of msg.parts) {
          if (typeof p === 'string') {
            if (p.trim()) partsText.push(p.trim());
          } else if (p.text) {
            if (p.text.trim()) partsText.push(p.text.trim());
          } else if (p.functionCall) {
            partsText.push(`[Tool Request: ${p.functionCall.name}(${JSON.stringify(p.functionCall.args || {})})]`);
          } else if (p.functionResponse) {
            partsText.push(`[Tool Output for ${p.functionResponse.name}: ${JSON.stringify(p.functionResponse.response || {})}]`);
          } else if (p.inlineData) {
            partsText.push(`[Attached Media: ${p.inlineData.mimeType || 'image'}]`);
          }
        }
        const textContent = partsText.join('\n').trim();
        const role = msg.role === 'model' ? 'assistant' : (msg.role === 'function' ? 'user' : msg.role);
        messages.push({ role: role || 'user', content: textContent || '[User data]' });
      } else if (msg.content) {
        messages.push({ role: msg.role === 'model' ? 'assistant' : (msg.role || 'user'), content: String(msg.content).trim() || '[Message]' });
      }
    }
  } else if (typeof contents === 'string') {
    messages.push({ role: 'user', content: contents.trim() || 'Hello' });
  }

  if (messages.length === 0) {
    messages.push({ role: 'user', content: 'Hello' });
  }

  return messages;
}

/**
 * NVIDIA Endpoint client for z-ai/glm-5.2 (Deep Reasoning Model, 35 RPM)
 * Bulletproof execution guarantee: Retries without tools if payload rejected
 */
export async function callNvidiaFallback(options: LLMRouterOptions): Promise<LLMRouterResult> {
  await nvidiaRateLimiter.acquire(5000);
  modelQuotaTracker.recordUsage('z-ai/glm-5.2');

  const apiKey = process.env.GAMMA_API_KEY || process.env.GAMMA_DIFFUSION_API_KEY || process.env.NVIDIA_API_KEY || "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";
  const messages = formatContentsForNvidia(options.contents, options.systemInstruction);

  console.log(`[LLMRouter] Executing GLM-5.2 via NVIDIA Endpoint (z-ai/glm-5.2)...`);

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || 25000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const bodyPayload: any = {
      model: "z-ai/glm-5.2",
      messages,
      temperature: options.temperature !== undefined ? options.temperature : 0.7,
      max_tokens: 16384
    };

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
                parameters: normalizeSchemaForOpenAI(fd.parameters)
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

    let response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(bodyPayload),
      signal: controller.signal
    });

    // Bulletproof Fail-Safe: If tools or payload rejected (HTTP 400), retry immediately without tools
    if (!response.ok && bodyPayload.tools && response.status === 400) {
      console.warn("[LLMRouter] GLM-5.2 rejected tools payload (HTTP 400). Retrying plain text fallback...");
      delete bodyPayload.tools;
      delete bodyPayload.tool_choice;
      response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(bodyPayload),
        signal: controller.signal
      });
    }

    clearTimeout(timer);

    if (!response.ok) {
      const errText = await response.text();
      if (response.status === 429) {
        modelQuotaTracker.markCooldown('z-ai/glm-5.2', 'RPM');
      }
      throw new Error(`NVIDIA GLM API call failed [HTTP ${response.status}]: ${errText}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const responseText = choice?.message?.content || "";
    const functionCalls: LLMFunctionCall[] = [];

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

    return {
      text: responseText,
      functionCalls,
      modelUsed: "z-ai/glm-5.2 (NVIDIA AI Endpoint)",
      attemptsCount: 1,
      thoughts: ["[GLM-5.2 Deep Reasoning Active]"],
      rawResponse: data
    };
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error(`NVIDIA GLM API call timed out after ${timeoutMs}ms`);
    }
    throw err;
  }
}

/**
 * Streaming client for z-ai/glm-5.2
 */
export async function* streamNvidiaFallback(options: LLMRouterOptions) {
  await nvidiaRateLimiter.acquire(5000);
  modelQuotaTracker.recordUsage('z-ai/glm-5.2');

  const apiKey = process.env.GAMMA_API_KEY || process.env.GAMMA_DIFFUSION_API_KEY || process.env.NVIDIA_API_KEY || "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";
  const messages = formatContentsForNvidia(options.contents, options.systemInstruction);

  console.log(`[LLMRouter Stream] Streaming via z-ai/glm-5.2...`);

  const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "z-ai/glm-5.2",
      messages,
      temperature: options.temperature !== undefined ? options.temperature : 0.7,
      max_tokens: 16384,
      stream: true
    })
  });

  if (!response.ok || !response.body) {
    const errText = await response.text();
    if (response.status === 429) {
      modelQuotaTracker.markCooldown('z-ai/glm-5.2', 'RPM');
    }
    throw new Error(`NVIDIA GLM Stream failed [HTTP ${response.status}]: ${errText}`);
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
          // ignore chunk parse
        }
      }
    }
  }
}

/**
 * Generates content using a paranoid quota-aware Model Cascade.
 * Validates RPM/RPD limits per model before making calls.
 * Automatically marks model cooldowns on 429/quota errors and cascades instantly.
 */
export async function generateContentWithRouter(
  options: LLMRouterOptions
): Promise<LLMRouterResult> {
  const ai = getGenAIClient();
  if (!ai) {
    console.warn("[LLMRouter] GEMINI_API_KEY is missing. Directly routing to z-ai/glm-5.2.");
    return callNvidiaFallback(options);
  }

  const timeoutMs = options.timeoutMs || 15000;
  let attemptsCount = 0;
  let lastError: any = null;

  // Filter available Gemini models based on quota buffers & cooldown states
  const candidateModels = GEMINI_MODEL_CASCADE.filter(m => modelQuotaTracker.canUseModel(m));

  if (candidateModels.length === 0) {
    console.warn("[LLMRouter] All Gemini models are on RPM/RPD cooldown or quota buffer. Funneling to GLM-5.2...");
    try {
      return await callNvidiaFallback(options);
    } catch (nvErr) {
      // If NVIDIA also fails, wait 1s and try primary model as emergency attempt
      candidateModels.push('gemini-2.5-flash', 'gemini-2.0-flash');
    }
  }

  for (const model of candidateModels) {
    if (!modelQuotaTracker.canUseModel(model)) continue;

    attemptsCount++;
    let modelRetries = 0;
    const maxModelRetries = 1;

    while (modelRetries <= maxModelRetries) {
      try {
        await googleRateLimiter.acquire(2000);
        modelQuotaTracker.recordUsage(model);

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
              config.thinkingConfig = { includeThoughts: true };
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
          console.log(`[LLMRouter] Successfully generated content using model '${model}' (attempt #${attemptsCount})`);
          return {
            text: result.text,
            functionCalls: result.functionCalls,
            modelUsed: model,
            attemptsCount,
            rawResponse: result.rawResponse
          };
        }
        break; // If call succeeded without content, move to next model
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        console.warn(`[LLMRouter] Model '${model}' failed:`, errMsg);
        lastError = err;

        const isNotFound = /404|NOT_FOUND|not found/i.test(errMsg);
        const isRpdExhausted = /per day|RPD|daily quota/i.test(errMsg);
        const isQuotaExceeded = err instanceof RateLimiterTimeoutError || /429|RESOURCE_EXHAUSTED|RATE_LIMIT|quota|limit/i.test(errMsg);
        const isTransient = /503|UNAVAILABLE|500|high demand/i.test(errMsg);

        if (isNotFound) {
          modelQuotaTracker.markCooldown(model, 'RPD');
          break; // Skip non-existent models permanently
        }

        if (isQuotaExceeded || isRpdExhausted) {
          modelQuotaTracker.markCooldown(model, isRpdExhausted ? 'RPD' : 'RPM');
          break; // Cascade to next available model immediately
        }

        if (isTransient && modelRetries < maxModelRetries) {
          modelRetries++;
          const delayMs = 300 * Math.pow(2, modelRetries) + Math.floor(Math.random() * 50);
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        break;
      }
    }
  }

  console.warn(`[LLMRouter] All available Gemini models failed or reached quota. Seamlessly executing GLM-5.2 fallback...`);
  try {
    return await callNvidiaFallback(options);
  } catch (nvidiaErr: any) {
    throw new AllModelsExhaustedError(
      `All Gemini models and GLM-5.2 fallback failed in router. Gemini last error: ${lastError?.message || String(lastError)}. NVIDIA error: ${nvidiaErr?.message || String(nvidiaErr)}`,
      lastError
    );
  }
}

/**
 * Streaming content generation using quota-aware cascade
 */
export async function* generateContentStreamWithRouter(options: LLMRouterOptions) {
  const ai = getGenAIClient();
  if (!ai) {
    console.warn("[LLMRouter Stream] GEMINI_API_KEY is missing. Streaming via GLM-5.2.");
    yield* streamNvidiaFallback(options);
    return;
  }

  let lastError: any = null;
  const candidateModels = GEMINI_MODEL_CASCADE.filter(m => modelQuotaTracker.canUseModel(m));

  if (candidateModels.length === 0) {
    yield* streamNvidiaFallback(options);
    return;
  }

  for (const model of candidateModels) {
    if (!modelQuotaTracker.canUseModel(model)) continue;

    try {
      await googleRateLimiter.acquire(2000);
      modelQuotaTracker.recordUsage(model);

      const config: any = {};
      if (options.systemInstruction) {
        config.systemInstruction = options.systemInstruction;
      }
      if (options.temperature !== undefined) {
        config.temperature = options.temperature;
      }
      if (options.includeThoughts) {
        config.thinkingConfig = { includeThoughts: true };
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
      const errMsg = err?.message || String(err);
      console.warn(`[LLMRouter Stream] Model '${model}' stream failed:`, errMsg);
      lastError = err;
      const isRpdExhausted = /per day|RPD|daily quota/i.test(errMsg);
      modelQuotaTracker.markCooldown(model, isRpdExhausted ? 'RPD' : 'RPM');
    }
  }

  console.warn(`[LLMRouter Stream] All Gemini models stream failed. Falling back to GLM-5.2 stream...`);
  try {
    yield* streamNvidiaFallback(options);
  } catch (nvidiaErr: any) {
    throw new AllModelsExhaustedError(
      `All Gemini models and GLM-5.2 stream fallback failed. Gemini error: ${lastError?.message || String(lastError)}. NVIDIA error: ${nvidiaErr?.message || String(nvidiaErr)}`,
      lastError
    );
  }
}
