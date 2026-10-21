import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE_PATH = process.env.VERCEL
  ? path.resolve('/tmp', 'api-proxy-keys.json')
  : path.resolve(__dirname, 'api-proxy-keys.json');

// Initialize Gemini Client dynamically so any runtime env var (including Vercel) is used
function getGeminiClient(customKey?: string): GoogleGenAI {
  const activeKey = customKey || process.env.GEMINI_API_KEY || '';
  return new GoogleGenAI({
    apiKey: activeKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export interface CustomApiKeyEntry {
  id: string;
  label: string;
  providerType: 'groq' | 'gemini' | 'openrouter' | 'deepseek' | 'openai-compatible';
  apiKey: string;
  model: string;
  baseUrl?: string;
  enabled: boolean;
  isTestedWorking: boolean;
  lastTestedAt?: number;
  testLatencyMs?: number;
  createdAt: number;
  successCount?: number;
  errorCount?: number;
  lastError?: string;
  cooldownUntil?: number;
}

export interface ProviderState {
  id: 'groq' | 'gemini' | 'openrouter' | 'deepseek';
  name: string;
  defaultModel: string;
  fallbackModels: string[];
  enabled: boolean;
  priority: number;
  successCount: number;
  errorCount: number;
  consecutiveErrors: number;
  cooldownUntil: number; // Timestamp in ms
  lastError?: string;
  lastUsedAt?: number;
}

export interface ProxyConfig {
  groqApiKey: string;
  openRouterApiKey: string;
  deepSeekApiKey: string;
  rotationStrategy: 'round-robin' | 'priority-fallback';
  activeProviderIndex: number;
  updatedAt: number;
  customKeys?: CustomApiKeyEntry[];
}

// Initial API Keys loaded securely from environment (.env)
const DEFAULT_CONFIG: ProxyConfig = {
  groqApiKey: process.env.GROQ_API_KEY || '',
  openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
  deepSeekApiKey: process.env.DEEPSEEK_API_KEY || '',
  rotationStrategy: 'round-robin',
  activeProviderIndex: 0,
  updatedAt: Date.now(),
  customKeys: [],
};

let currentConfig: ProxyConfig = loadConfigFromDisk();

const providers: Record<string, ProviderState> = {
  groq: {
    id: 'groq',
    name: 'Groq (Ultra-Fast)',
    defaultModel: 'openai/gpt-oss-120b',
    fallbackModels: ['openai/gpt-oss-20b', 'allam-2-7b'],
    enabled: true,
    priority: 1,
    successCount: 0,
    errorCount: 0,
    consecutiveErrors: 0,
    cooldownUntil: 0,
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini (Flash Cascade)',
    defaultModel: 'gemini-3.5-flash',
    fallbackModels: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.6-flash'],
    enabled: true,
    priority: 2,
    successCount: 0,
    errorCount: 0,
    consecutiveErrors: 0,
    cooldownUntil: 0,
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter (Multi-Model Pool)',
    defaultModel: 'google/gemma-4-26b-a4b-it:free',
    fallbackModels: ['minimax/minimax-m3.1-flash:free'],
    enabled: true,
    priority: 3,
    successCount: 0,
    errorCount: 0,
    consecutiveErrors: 0,
    cooldownUntil: 0,
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek (DeepSeek-V3)',
    defaultModel: 'deepseek-chat',
    fallbackModels: ['deepseek-reasoner'],
    enabled: true,
    priority: 4,
    successCount: 0,
    errorCount: 0,
    consecutiveErrors: 0,
    cooldownUntil: 0,
  },
};

let roundRobinPointer = 0;

function loadConfigFromDisk(): ProxyConfig {
  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const raw = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed) {
        return {
          ...DEFAULT_CONFIG,
          ...parsed,
          groqApiKey: parsed.groqApiKey || process.env.GROQ_API_KEY || '',
          openRouterApiKey: parsed.openRouterApiKey || process.env.OPENROUTER_API_KEY || '',
          deepSeekApiKey: parsed.deepSeekApiKey || process.env.DEEPSEEK_API_KEY || '',
        };
      }
    }
  } catch (e) {
    console.warn('Could not read proxy config from disk:', e);
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfigToDisk(cfg: ProxyConfig) {
  try {
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to write proxy config to disk:', e);
  }
}

export function updateProxyKeys(newKeys: Partial<ProxyConfig>) {
  currentConfig = {
    ...currentConfig,
    ...newKeys,
    updatedAt: Date.now(),
  };
  saveConfigToDisk(currentConfig);
  // Reset errors when keys updated
  for (const key of Object.keys(providers)) {
    providers[key].cooldownUntil = 0;
    providers[key].consecutiveErrors = 0;
    providers[key].lastError = undefined;
  }
  return getProxyStatus();
}

export function addCustomKey(entry: CustomApiKeyEntry) {
  if (!currentConfig.customKeys) {
    currentConfig.customKeys = [];
  }
  const existingIdx = currentConfig.customKeys.findIndex((k) => k.id === entry.id);
  if (existingIdx >= 0) {
    currentConfig.customKeys[existingIdx] = { ...currentConfig.customKeys[existingIdx], ...entry };
  } else {
    currentConfig.customKeys.push(entry);
  }
  currentConfig.updatedAt = Date.now();
  saveConfigToDisk(currentConfig);
  return getProxyStatus();
}

export function deleteCustomKey(id: string) {
  if (currentConfig.customKeys) {
    currentConfig.customKeys = currentConfig.customKeys.filter((k) => k.id !== id);
    currentConfig.updatedAt = Date.now();
    saveConfigToDisk(currentConfig);
  }
  return getProxyStatus();
}

export function toggleCustomKey(id: string, enabled?: boolean) {
  if (currentConfig.customKeys) {
    currentConfig.customKeys = currentConfig.customKeys.map((k) => {
      if (k.id === id) {
        return { ...k, enabled: enabled !== undefined ? enabled : !k.enabled };
      }
      return k;
    });
    currentConfig.updatedAt = Date.now();
    saveConfigToDisk(currentConfig);
  }
  return getProxyStatus();
}

export function getProxyStatus() {
  const maskKey = (k: string) => {
    if (!k || k.length < 8) return '****';
    return k.slice(0, 4) + '...' + k.slice(-4);
  };

  return {
    strategy: currentConfig.rotationStrategy,
    activePointer: roundRobinPointer,
    updatedAt: currentConfig.updatedAt,
    keys: {
      groq: maskKey(currentConfig.groqApiKey || process.env.GROQ_API_KEY || ''),
      openRouter: maskKey(currentConfig.openRouterApiKey || process.env.OPENROUTER_API_KEY || ''),
      deepSeek: maskKey(currentConfig.deepSeekApiKey || process.env.DEEPSEEK_API_KEY || ''),
      gemini: maskKey(process.env.GEMINI_API_KEY || ''),
    },
    customKeys: (currentConfig.customKeys || []).map((k) => ({
      ...k,
      apiKeyMasked: maskKey(k.apiKey),
    })),
    providers: Object.values(providers).map((p) => ({
      id: p.id,
      name: p.name,
      model: p.defaultModel,
      enabled: p.enabled,
      priority: p.priority,
      successCount: p.successCount,
      errorCount: p.errorCount,
      isCooldown: Date.now() < p.cooldownUntil,
      cooldownSecondsRemaining: Math.max(0, Math.ceil((p.cooldownUntil - Date.now()) / 1000)),
      lastError: p.lastError,
      lastUsedAt: p.lastUsedAt,
    })),
  };
}

// -------------------------------------------------------------
// Provider Specific API Call Implementations
// -------------------------------------------------------------

async function callGroq(prompt: string, systemInstruction?: string): Promise<{ text: string; model: string }> {
  const apiKey = currentConfig.groqApiKey || process.env.GROQ_API_KEY || '';
  if (!apiKey) throw new Error('Groq API Key is not configured');

  const modelsToTry = [providers.groq.defaultModel, ...providers.groq.fallbackModels];
  let lastErr: any = null;

  for (const model of modelsToTry) {
    try {
      const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
      if (systemInstruction) {
        messages.push({ role: 'system', content: systemInstruction });
      }
      messages.push({ role: 'user', content: prompt });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.2,
          max_tokens: 4096,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message || `HTTP ${response.status}: ${JSON.stringify(data)}`);
      }

      const text = data.choices?.[0]?.message?.content;
      if (text && text.trim()) {
        return { text: text.trim(), model: `Groq (${model})` };
      }
    } catch (e: any) {
      lastErr = e;
      // If rate limit (429), break immediately to let failover happen
      if (e?.message?.includes('429') || e?.message?.includes('rate_limit')) {
        break;
      }
    }
  }

  throw lastErr || new Error('Groq execution failed');
}

async function callOpenRouter(prompt: string, systemInstruction?: string): Promise<{ text: string; model: string }> {
  const apiKey = currentConfig.openRouterApiKey || process.env.OPENROUTER_API_KEY || '';
  if (!apiKey) throw new Error('OpenRouter API Key is not configured');

  const modelsToTry = [providers.openrouter.defaultModel, ...providers.openrouter.fallbackModels];
  let lastErr: any = null;

  for (const model of modelsToTry) {
    try {
      const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
      if (systemInstruction) {
        messages.push({ role: 'system', content: systemInstruction });
      }
      messages.push({ role: 'user', content: prompt });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://sarpay.ai',
          'X-Title': 'SarPay AI Translation Studio',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.2,
          max_tokens: 4096,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message || `HTTP ${response.status}: ${JSON.stringify(data)}`);
      }

      const text = data.choices?.[0]?.message?.content;
      if (text && text.trim()) {
        return { text: text.trim(), model: `OpenRouter (${model})` };
      }
    } catch (e: any) {
      lastErr = e;
      if (e?.message?.includes('402') || e?.message?.includes('429')) {
        break;
      }
    }
  }

  throw lastErr || new Error('OpenRouter execution failed');
}

async function callDeepSeek(prompt: string, systemInstruction?: string): Promise<{ text: string; model: string }> {
  const apiKey = currentConfig.deepSeekApiKey || process.env.DEEPSEEK_API_KEY || '';
  if (!apiKey) throw new Error('DeepSeek API Key is not configured');

  const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: prompt });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: providers.deepseek.defaultModel,
      messages,
      temperature: 0.2,
      max_tokens: 4096,
    }),
    signal: controller.signal,
  });

  clearTimeout(timeout);

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `HTTP ${response.status}: ${JSON.stringify(data)}`);
  }

  const text = data.choices?.[0]?.message?.content;
  if (text && text.trim()) {
    return { text: text.trim(), model: `DeepSeek (${providers.deepseek.defaultModel})` };
  }

  throw new Error('DeepSeek returned empty response');
}

async function callGemini(prompt: string, systemInstruction?: string): Promise<{ text: string; model: string }> {
  const models = [providers.gemini.defaultModel, ...providers.gemini.fallbackModels];
  let lastErr: any = null;
  const ai = getGeminiClient();

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.2,
          maxOutputTokens: 8192,
        },
      });

      if (response && response.text && response.text.trim()) {
        return { text: response.text.trim(), model: `Gemini (${model})` };
      }
    } catch (e: any) {
      lastErr = e;
      if (e?.status === 429 || e?.status === 404) {
        continue;
      }
    }
  }

  throw lastErr || new Error('Gemini execution failed');
}



export async function callArbitraryProvider(
  cfg: {
    providerType: 'groq' | 'gemini' | 'openrouter' | 'deepseek' | 'openai-compatible';
    apiKey: string;
    model: string;
    baseUrl?: string;
  },
  prompt: string,
  systemInstruction?: string
): Promise<{ text: string; model: string }> {
  const { providerType, apiKey, model, baseUrl } = cfg;

  if (providerType === 'gemini') {
    const customAi = getGeminiClient(apiKey);
    const targetModel = model || 'gemini-3.5-flash';
    const response = await customAi.models.generateContent({
      model: targetModel,
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.2,
        maxOutputTokens: 8192,
      },
    });
    if (response && response.text && response.text.trim()) {
      return { text: response.text.trim(), model: `Gemini (${targetModel})` };
    }
    throw new Error('Gemini returned empty response');
  }

  // OpenAI-compatible format (Groq, OpenRouter, DeepSeek, or custom OpenAI-compatible)
  let endpoint = 'https://api.openai.com/v1/chat/completions';
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  if (providerType === 'groq') {
    endpoint = 'https://api.groq.com/openai/v1/chat/completions';
  } else if (providerType === 'openrouter') {
    endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    headers['HTTP-Referer'] = 'https://sarpay.ai';
    headers['X-Title'] = 'SarPay AI Translation Studio';
  } else if (providerType === 'deepseek') {
    endpoint = 'https://api.deepseek.com/chat/completions';
  } else if (providerType === 'openai-compatible') {
    const rawBase = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    endpoint = rawBase.endsWith('/chat/completions') ? rawBase : `${rawBase}/chat/completions`;
  }

  const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: prompt });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35000);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: model || 'default',
      messages,
      temperature: 0.2,
      max_tokens: 4096,
    }),
    signal: controller.signal,
  });

  clearTimeout(timeout);

  const data = await response.json();
  if (!response.ok) {
    const errText = data?.error?.message || data?.message || `HTTP ${response.status}: ${JSON.stringify(data)}`;
    throw new Error(errText);
  }

  const text = data.choices?.[0]?.message?.content;
  if (text && text.trim()) {
    return { text: text.trim(), model: `${providerType.toUpperCase()} (${model})` };
  }
  throw new Error('Provider returned empty response content');
}

export async function testArbitraryKey(params: {
  providerType: 'groq' | 'gemini' | 'openrouter' | 'deepseek' | 'openai-compatible';
  apiKey: string;
  model: string;
  baseUrl?: string;
}): Promise<{
  success: boolean;
  provider: string;
  model: string;
  output?: string;
  latencyMs: number;
  error?: string;
}> {
  const startTime = Date.now();
  const testPrompt = 'Translate into natural Burmese (မြန်မာဘာသာ): Artificial intelligence empowers human capabilities, critical thinking, and innovation.';
  const systemPrompt = 'You are a professional Burmese translator. Translate concisely into natural Burmese. Output ONLY the Burmese translation without notes.';

  try {
    if (!params.apiKey && params.providerType !== 'gemini') {
      throw new Error('API Key is required to test this provider');
    }
    if (!params.model) {
      throw new Error('Model name is required (e.g. openai/gpt-oss-120b, gemini-3.5-flash, deepseek-chat)');
    }

    const result = await callArbitraryProvider(params, testPrompt, systemPrompt);
    return {
      success: true,
      provider: params.providerType,
      model: result.model,
      output: result.text,
      latencyMs: Date.now() - startTime,
    };
  } catch (err: any) {
    return {
      success: false,
      provider: params.providerType,
      model: params.model || 'N/A',
      latencyMs: Date.now() - startTime,
      error: err?.message || 'Connection test failed',
    };
  }
}

// -------------------------------------------------------------
// Core Round-Robin & Automatic Fallback Engine
// -------------------------------------------------------------

interface RotationCandidate {
  id: string;
  name: string;
  enabled: boolean;
  cooldownUntil: number;
  consecutiveErrors: number;
  execute: (p: string, sys?: string) => Promise<{ text: string; model: string }>;
  onSuccess: () => void;
  onFailure: (err: any) => void;
}

export async function generateWithProxyRotation(
  prompt: string,
  systemInstruction?: string
): Promise<{ text: string; providerUsed: string; modelUsed: string }> {
  // Collect all built-in providers
  const candidates: RotationCandidate[] = [
    {
      id: 'groq',
      name: providers.groq.name,
      enabled: providers.groq.enabled,
      cooldownUntil: providers.groq.cooldownUntil,
      consecutiveErrors: providers.groq.consecutiveErrors,
      execute: (p, sys) => callGroq(p, sys),
      onSuccess: () => {
        providers.groq.successCount++;
        providers.groq.consecutiveErrors = 0;
        providers.groq.lastError = undefined;
      },
      onFailure: (err) => {
        providers.groq.errorCount++;
        providers.groq.consecutiveErrors++;
        providers.groq.lastError = err?.message || String(err);
        providers.groq.cooldownUntil = Date.now() + 45000;
      },
    },
    {
      id: 'gemini',
      name: providers.gemini.name,
      enabled: providers.gemini.enabled,
      cooldownUntil: providers.gemini.cooldownUntil,
      consecutiveErrors: providers.gemini.consecutiveErrors,
      execute: (p, sys) => callGemini(p, sys),
      onSuccess: () => {
        providers.gemini.successCount++;
        providers.gemini.consecutiveErrors = 0;
        providers.gemini.lastError = undefined;
      },
      onFailure: (err) => {
        providers.gemini.errorCount++;
        providers.gemini.consecutiveErrors++;
        providers.gemini.lastError = err?.message || String(err);
        providers.gemini.cooldownUntil = Date.now() + 20000;
      },
    },
    {
      id: 'openrouter',
      name: providers.openrouter.name,
      enabled: providers.openrouter.enabled,
      cooldownUntil: providers.openrouter.cooldownUntil,
      consecutiveErrors: providers.openrouter.consecutiveErrors,
      execute: (p, sys) => callOpenRouter(p, sys),
      onSuccess: () => {
        providers.openrouter.successCount++;
        providers.openrouter.consecutiveErrors = 0;
        providers.openrouter.lastError = undefined;
      },
      onFailure: (err) => {
        providers.openrouter.errorCount++;
        providers.openrouter.consecutiveErrors++;
        providers.openrouter.lastError = err?.message || String(err);
        providers.openrouter.cooldownUntil = Date.now() + 60000;
      },
    },
    {
      id: 'deepseek',
      name: providers.deepseek.name,
      enabled: providers.deepseek.enabled,
      cooldownUntil: providers.deepseek.cooldownUntil,
      consecutiveErrors: providers.deepseek.consecutiveErrors,
      execute: (p, sys) => callDeepSeek(p, sys),
      onSuccess: () => {
        providers.deepseek.successCount++;
        providers.deepseek.consecutiveErrors = 0;
        providers.deepseek.lastError = undefined;
      },
      onFailure: (err) => {
        providers.deepseek.errorCount++;
        providers.deepseek.consecutiveErrors++;
        providers.deepseek.lastError = err?.message || String(err);
        providers.deepseek.cooldownUntil = Date.now() + 180000;
      },
    },
  ];

  // Also append active custom keys
  if (currentConfig.customKeys && currentConfig.customKeys.length > 0) {
    for (const ck of currentConfig.customKeys) {
      if (!ck.enabled) continue;
      candidates.push({
        id: ck.id,
        name: `Custom (${ck.label})`,
        enabled: ck.enabled,
        cooldownUntil: ck.cooldownUntil || 0,
        consecutiveErrors: 0,
        execute: (p, sys) => callArbitraryProvider(ck, p, sys),
        onSuccess: () => {
          ck.successCount = (ck.successCount || 0) + 1;
          ck.lastError = undefined;
        },
        onFailure: (err) => {
          ck.errorCount = (ck.errorCount || 0) + 1;
          ck.lastError = err?.message || String(err);
          ck.cooldownUntil = Date.now() + 60000;
        },
      });
    }
  }

  const now = Date.now();
  const total = candidates.length;
  if (total === 0) {
    throw new Error('No rotation candidates available');
  }

  const startIdx = roundRobinPointer % total;
  let lastError: any = null;

  for (let step = 0; step < total; step++) {
    const candidateIdx = (startIdx + step) % total;
    const candidate = candidates[candidateIdx];

    if (!candidate || !candidate.enabled) continue;
    if (candidate.cooldownUntil > now) {
      console.log(`[Proxy Skip] ${candidate.name} is in cooldown for ${Math.ceil((candidate.cooldownUntil - now) / 1000)}s`);
      continue;
    }

    try {
      console.log(`[Proxy Attempt] Rotating to: ${candidate.name} (step ${step + 1}/${total})`);
      const result = await candidate.execute(prompt, systemInstruction);

      if (result && result.text) {
        candidate.onSuccess();
        roundRobinPointer = (candidateIdx + 1) % total;
        console.log(`[Proxy Success] Completed by: ${candidate.name} [${result.model}]`);
        return {
          text: result.text,
          providerUsed: candidate.name,
          modelUsed: result.model,
        };
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      console.warn(`[Proxy Fallback Triggered] ${candidate.name} failed:`, errMsg);
      candidate.onFailure(err);
      lastError = err;
    }
  }

  // Fallback to bedrock Gemini
  console.log('[Proxy Bedrock] Primary rotation exhausted, invoking Gemini bedrock...');
  try {
    const bedrock = await callGemini(prompt, systemInstruction);
    return {
      text: bedrock.text,
      providerUsed: 'Google Gemini (Bedrock Fallback)',
      modelUsed: bedrock.model,
    };
  } catch (geminiErr: any) {
    throw new Error(
      `All rotation candidates failed. Root error: ${lastError?.message || geminiErr?.message || 'Unknown'}`
    );
  }
}

// Test a specific provider on demand
export async function testSingleProvider(providerId: string): Promise<{
  success: boolean;
  provider: string;
  model: string;
  output?: string;
  latencyMs: number;
  error?: string;
}> {
  const startTime = Date.now();
  const testPrompt = 'Translate to natural Burmese: Artificial Intelligence empowers humanity.';
  const systemPrompt = 'You are a professional Burmese translator. Translate concisely without notes.';

  try {
    let result: { text: string; model: string };
    if (providerId === 'groq') {
      result = await callGroq(testPrompt, systemPrompt);
    } else if (providerId === 'openrouter') {
      result = await callOpenRouter(testPrompt, systemPrompt);
    } else if (providerId === 'deepseek') {
      result = await callDeepSeek(testPrompt, systemPrompt);
    } else {
      result = await callGemini(testPrompt, systemPrompt);
    }

    return {
      success: true,
      provider: providerId,
      model: result.model,
      output: result.text,
      latencyMs: Date.now() - startTime,
    };
  } catch (err: any) {
    return {
      success: false,
      provider: providerId,
      model: 'N/A',
      latencyMs: Date.now() - startTime,
      error: err?.message || 'Test failed',
    };
  }
}
