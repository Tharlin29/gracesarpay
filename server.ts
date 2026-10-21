import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import * as pdfjsLegacy from 'pdfjs-dist/legacy/build/pdf.mjs';
import { repairMyanmarDocumentText, cleanPdfArtifacts } from './src/lib/myanmarFontFixer';
import {
  generateWithProxyRotation,
  getProxyStatus,
  updateProxyKeys,
  testSingleProvider,
  testArbitraryKey,
  addCustomKey,
  deleteCustomKey,
  toggleCustomKey,
} from './serverProxy';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize GoogleGenAI client dynamically
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || '';
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Model priority cascade as requested:
// 1. gemini-3.5-flash (Primary default - natural Myanmar translation)
// 2. gemini-3.5-flash-lite
// 3. gemini-3.7-flash
// 4. gemini-3.1-flash-lite
// 5. gemini-3.8-flash
// Model priority cascade:
// 1. gemini-3.5-flash (Primary active model - natural, fast Myanmar translation)
// 2. gemini-3.5-flash-lite (Secondary fast active model)
// 3. gemini-3.1-flash-lite (Active lightweight backup)
// 4. gemini-3.6-flash
// 5. gemini-flash-latest / gemini-3.8-flash (Standard fallbacks)
const MODEL_CASCADE = [
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.6-flash',
  'gemini-flash-latest',
  'gemini-3.8-flash',
];

// Helper to run content generation with model cascade and explicit output tokens
async function generateWithCascade(prompt: string, systemInstruction?: string) {
  let lastError: any = null;
  const ai = getGeminiClient();

  for (const model of MODEL_CASCADE) {
    // Try up to 2 attempts per model for transient 503 spikes
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        console.log(`[Gemini Cascade] Attempting model: ${model} (attempt ${attempt + 1})`);
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction,
            temperature: 0.2,
            maxOutputTokens: 8192,
          },
        });

        if (response && response.text) {
          console.log(`[Gemini Cascade] Successfully generated with: ${model}`);
          return {
            text: response.text,
            modelUsed: model,
          };
        }
      } catch (err: any) {
        console.warn(`[Gemini Cascade] Model ${model} attempt ${attempt + 1} failed:`, err?.message || err);
        lastError = err;
        // If 429 quota exhausted or 404 not found, immediately move to next model without retry
        if (err?.status === 429 || err?.status === 404) {
          break;
        }
        // If transient error (e.g. 503), wait 800ms before second attempt
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 800));
        }
      }
    }
  }

  throw new Error(
    `All cascade models failed. Last error: ${lastError?.message || 'Unknown error'}`
  );
}

// Split large text into clean semantic paragraph chunks (~800-1200 words per chunk)
// This guarantees that Gemini translates rapidly with 100% full content preserved without truncating
function splitIntoTranslationChunks(text: string, maxWordsPerChunk = 1000): string[] {
  if (!text || !text.trim()) return [];

  // Normalize newlines
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawParagraphs = normalized.split(/\n\s*\n/);

  const paragraphs: string[] = [];
  for (const p of rawParagraphs) {
    const trimmed = p.trim();
    if (!trimmed) continue;

    const words = trimmed.split(/\s+/);
    if (words.length > maxWordsPerChunk * 1.5) {
      // Split very long paragraphs by sentence boundaries
      const sentences = trimmed.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [trimmed];
      let currentSentenceBlock = '';
      for (const s of sentences) {
        if ((currentSentenceBlock + ' ' + s).split(/\s+/).length > maxWordsPerChunk) {
          if (currentSentenceBlock.trim()) paragraphs.push(currentSentenceBlock.trim());
          currentSentenceBlock = s;
        } else {
          currentSentenceBlock += (currentSentenceBlock ? ' ' : '') + s;
        }
      }
      if (currentSentenceBlock.trim()) {
        paragraphs.push(currentSentenceBlock.trim());
      }
    } else {
      paragraphs.push(trimmed);
    }
  }

  // Combine small paragraphs into chunks up to maxWordsPerChunk
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentWordCount = 0;

  for (const p of paragraphs) {
    const pWordCount = p.split(/\s+/).length;
    if (currentWordCount + pWordCount > maxWordsPerChunk && currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n\n'));
      currentChunk = [p];
      currentWordCount = pWordCount;
    } else {
      currentChunk.push(p);
      currentWordCount += pWordCount;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('\n\n'));
  }

  return chunks.length > 0 ? chunks : [text];
}

// Server-side robust PDF & Document Parser endpoint
// Uses pdfjsLegacy in Node.js - 100% reliable, no browser worker or CDN issues
app.post('/api/parse-document', async (req: Request, res: Response) => {
  try {
    const { base64, fileName } = req.body;
    if (!base64 || typeof base64 !== 'string') {
      return res.status(400).json({ success: false, error: 'Base64 data is required' });
    }

    const cleanBase64 = base64.replace(/^data:application\/[a-zA-Z0-9.-]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const uint8Array = new Uint8Array(buffer);

    const pages: string[] = [];
    const loadingTask = pdfjsLegacy.getDocument({
      data: uint8Array,
      useSystemFonts: true,
      disableFontFace: true,
    });

    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;

    for (let i = 1; i <= numPages; i++) {
      try {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        let pageStr = '';
        for (const item of textContent.items as any[]) {
          if (item && 'str' in item && item.str) {
            pageStr += item.str + (item.hasEOL ? '\n' : ' ');
          }
        }
        // Clean page text of any PDF artifacts
        const { repairedText } = repairMyanmarDocumentText(pageStr.trim());
        pages.push(repairedText.trim());
      } catch (err) {
        console.warn(`[PDF Parse] Error reading page ${i}:`, err);
        pages.push('');
      }
    }

    const fullText = pages.join('\n\n').trim();
    const wordCount = fullText ? fullText.split(/\s+/).length : 0;

    return res.json({
      success: true,
      fileName: fileName || 'document.pdf',
      pageCount: numPages,
      pages,
      fullText,
      wordCount,
    });
  } catch (error: any) {
    console.error('[PDF Parse] Server error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to parse PDF document.',
    });
  }
});

// Font Repair & Normalization endpoint
app.post('/api/repair-font', async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ success: false, error: 'Text is required' });
    }

    const result = repairMyanmarDocumentText(text);
    return res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('[Font Repair] error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Font repair failed.',
    });
  }
});

function getSystemPromptForStyle(style?: string): string {
  if (style === 'official' || style === 'ရုံးသုံး') {
    return `You are a master legal and administrative Burmese translator specializing in official, formal Myanmar prose (ရုံးသုံး မြန်မာစကားပြေ).
CRITICAL STYLE & TRANSLATION RULES:
1. Tone & Register: Strictly FORMAL, OFFICIAL, ADMINISTRATIVE (ရုံးသုံး/စာချုပ်စာတမ်းသုံး). Use standard formal administrative sentence endings like "ပါသည်", "ဖြစ်ပါသည်", "ဆောင်ရွက်ရမည်", "သတ်မှတ်ထားပါသည်", "စည်းမျဉ်းစည်းကမ်းနှင့်အညီ လိုက်နာရမည်"။
2. Precision: Perfect for legal documents, company policies, official notices, agreements, executive briefs, and administrative reports.
3. Completeness: Translate EVERY single sentence, paragraph, bullet point, heading, and number completely from start to finish. DO NOT skip, summarize, or omit anything.
4. Formatting: Preserve exact paragraph breaks, bullet lists, formatting, and numbering.
5. Terminology: Use standard Myanmar government and administrative vocabulary, with original technical terms in brackets where helpful.
6. Output ONLY the translated Myanmar text without any conversational preamble or notes.`;
  }

  if (style === 'literary' || style === 'စာပေ') {
    return `You are a master Burmese literary author and classical translator specializing in high-register literary prose (ခန့်ညားသော မြန်မာစာပေအရေးအသား).
CRITICAL STYLE & TRANSLATION RULES:
1. Tone & Register: Strictly LITERARY, ELEGANT, MAJESTIC, and CLASSICAL (စာပေအရေးအသား/ရသစာပေ). Use dignified literary grammar and classical sentence endings like "ပေသည်", "ကုန်၏", "ရာတွင်", "တည်း", "သတည်း", "လေ၏"။
2. Precision: Perfect for philosophy, literature, biographies, novels, classical works, essays, and artistic writings. Use evocative, rich Burmese vocabulary and flowing cadence.
3. Completeness: Translate EVERY single sentence, paragraph, bullet point, and passage completely without omitting anything.
4. Formatting: Preserve exact paragraph breaks, chapter rhythm, and layout.
5. Output ONLY the translated Myanmar text without any conversational preamble or notes.`;
  }

  // Default: conversational / modern prose ('colloquial' | 'စကားပြေ')
  return `You are an expert modern Burmese translator specializing in natural, modern conversational prose (ခေတ်ပေါ် စကားပြေနှင့် ဖတ်ရလွယ်ကူသော စာအရေးအသား).
CRITICAL STYLE & TRANSLATION RULES:
1. Tone & Register: NATURAL, ENGAGING, READABLE, MODERN PROSE (စကားပြေ/ခေတ်ပေါ်စာ). Use smooth, modern narrative endings like "တယ်", "ပါတယ်", "ဖြစ်တယ်", "လုပ်ဆောင်နိုင်ပါတယ်"။ Friendly, natural, clear, and immensely easy to read and understand for all readers.
2. Precision: Perfect for self-help books, practical guides, general non-fiction, modern blogs, articles, and general readers.
3. Completeness: Translate EVERY single sentence, paragraph, bullet point, and number completely without skipping anything.
4. Formatting: Preserve exact paragraph breaks, bullet lists, and structure.
5. Output ONLY the translated Myanmar text without any conversational preamble or notes.`;
}

// Translation endpoint: Translates 100% of the document using intelligent chunking
app.post('/api/translate', async (req: Request, res: Response) => {
  try {
    const { text, title, segmentIndex, totalSegments, style } = req.body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Text content is required' });
    }

    // Auto-clean any PDF stream artifacts or encoding issues before chunking
    const { repairedText } = repairMyanmarDocumentText(text);
    const cleanText = repairedText.trim() || text.trim();

    const systemPrompt = getSystemPromptForStyle(style);

    const chunks = splitIntoTranslationChunks(cleanText, 1000);
    const totalChunks = chunks.length;
    console.log(`[Translate API] Translating document "${title || 'Untitled'}" - Total chunks: ${totalChunks}, Total input length: ${cleanText.length} chars`);

    const translatedChunks: string[] = new Array(totalChunks);
    let primaryModelUsed = 'gemini-3.5-flash';
    const startTime = Date.now();

    // Process chunks with concurrency (3 at a time) for speed and responsiveness
    const CONCURRENCY = 3;
    for (let i = 0; i < totalChunks; i += CONCURRENCY) {
      const batchIndices: number[] = [];
      for (let j = i; j < Math.min(i + CONCURRENCY, totalChunks); j++) {
        batchIndices.push(j);
      }

      await Promise.all(
        batchIndices.map(async (idx) => {
          const chunkText = chunks[idx];
          let chunkPrompt = `Translate the following text section into natural, fluent Myanmar (Burmese) language:\n\n${chunkText}`;
          if (title) {
            chunkPrompt = `Document Title: ${title}\n` + chunkPrompt;
          }
          if (totalChunks > 1) {
            chunkPrompt = `[Section ${idx + 1} of ${totalChunks}]\n` + chunkPrompt;
          } else if (segmentIndex !== undefined && totalSegments) {
            chunkPrompt = `[Segment ${segmentIndex + 1} of ${totalSegments}]\n` + chunkPrompt;
          }

          console.log(`[Translate API] Processing chunk ${idx + 1}/${totalChunks} (${chunkText.split(/\s+/).length} words)...`);
          const result = await generateWithProxyRotation(chunkPrompt, systemPrompt);
          translatedChunks[idx] = result.text.trim();
          primaryModelUsed = `${result.providerUsed} - ${result.modelUsed}`;
        })
      );
    }

    const fullTranslation = translatedChunks.join('\n\n');
    const durationSec = Math.max(1, Math.round((Date.now() - startTime) / 1000));
    console.log(`[Translate API] Translation complete! ${totalChunks} chunks translated in ${durationSec}s. Output length: ${fullTranslation.length} chars. Engine: ${primaryModelUsed}`);

    return res.json({
      success: true,
      translation: fullTranslation,
      modelUsed: primaryModelUsed,
      styleUsed: style || 'colloquial',
      totalChunks,
      durationSec,
    });
  } catch (error: any) {
    console.error('Translation error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Translation failed. Please try again.',
    });
  }
});

// Book Summary & Critical Review endpoint with Multi-Provider Proxy Rotation
app.post('/api/ai-review', async (req: Request, res: Response) => {
  try {
    const { title, text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Book content is required' });
    }

    const systemPrompt = `You are an expert literary critic, academic book reviewer, and executive summary analyst.
Generate a structured, in-depth, professional Book Review & Executive Summary in Burmese (မြန်မာဘာသာ).
Structure your response strictly into these 5 clear markdown sections:
# ၁။ စာအုပ်အကျဉ်းချုပ် (Executive Summary)
(Comprehensive overview of the core message and narrative/theme)

# ၂။ အဓိက သဘောတရားများနှင့် အဖိုးတန် သင်ခန်းစာများ (Core Concepts & Key Takeaways)
(Numbered bullet points of the most important teachings and insights)

# ၃။ စာအုပ်၏ အားသာချက်များ (Strengths)
(Clear analysis of what makes this book valuable and impactful)

# ၄။ စာအုပ်၏ အားနည်းချက်နှင့် ကန့်သတ်ချက်များ (Weaknesses & Limitations)
(Objective critical examination of potential gaps or limitations)

# ၅။ AI ၏ အမြင်အတွေးနှင့် လက်တွေ့အသုံးချမှု အကြံပြုချက် (AI's Critical Perspectives & Actionable Recommendations)
(Thought-provoking perspectives, who should read it, and how to apply the wisdom in real life)`;

    const sample = text.length > 25000 ? text.slice(0, 25000) : text;
    const prompt = `Book Title: ${title || 'Document'}\n\nContent:\n${sample}\n\nPlease generate the comprehensive Book Review and Summary in natural Myanmar language following the 5-section format.`;

    const result = await generateWithProxyRotation(prompt, systemPrompt);

    return res.json({
      success: true,
      review: result.text,
      modelUsed: `${result.providerUsed} - ${result.modelUsed}`,
    });
  } catch (error: any) {
    console.error('AI Review error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to generate review.',
    });
  }
});

// -------------------------------------------------------------
// Backend Proxy Key Rotation & Monitoring Endpoints
// -------------------------------------------------------------

// Get Proxy Status & Real-time health
app.get('/api/proxy/status', (_req: Request, res: Response) => {
  return res.json({
    success: true,
    ...getProxyStatus(),
  });
});

// Update Proxy Keys (Groq, OpenRouter, DeepSeek)
app.post('/api/proxy/update-keys', (req: Request, res: Response) => {
  try {
    const updated = updateProxyKeys(req.body);
    return res.json({
      success: true,
      ...updated,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to update proxy keys',
    });
  }
});

// Test a specific built-in provider on demand
app.post('/api/proxy/test', async (req: Request, res: Response) => {
  try {
    const { providerId } = req.body;
    const testResult = await testSingleProvider(providerId || 'groq');
    return res.json(testResult);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Provider test failed',
    });
  }
});

// Test ANY arbitrary API Key & Model BEFORE adding (Crucial user requirement)
app.post('/api/proxy/test-arbitrary-key', async (req: Request, res: Response) => {
  try {
    const { providerType, apiKey, model, baseUrl } = req.body;
    const testResult = await testArbitraryKey({
      providerType,
      apiKey: (apiKey || '').trim(),
      model: (model || '').trim(),
      baseUrl: (baseUrl || '').trim(),
    });
    return res.json(testResult);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Arbitrary key testing failed',
    });
  }
});

// Add a newly verified custom API Key to the rotation pool
app.post('/api/proxy/add-custom-key', (req: Request, res: Response) => {
  try {
    const status = addCustomKey(req.body);
    return res.json({
      success: true,
      ...status,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to add custom API key',
    });
  }
});

// Delete a custom key by ID
app.post('/api/proxy/delete-custom-key', (req: Request, res: Response) => {
  try {
    const { id } = req.body;
    const status = deleteCustomKey(id);
    return res.json({
      success: true,
      ...status,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to delete custom key',
    });
  }
});

// Toggle a custom key (Enable/Disable)
app.post('/api/proxy/toggle-custom-key', (req: Request, res: Response) => {
  try {
    const { id, enabled } = req.body;
    const status = toggleCustomKey(id, enabled);
    return res.json({
      success: true,
      ...status,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to toggle custom key',
    });
  }
});

// Setup Vite middleware in dev or static serve in prod
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

// Export app for serverless platforms (Vercel, AWS Lambda, Google Cloud Functions)
export default app;
export { app };

// Automatically start standalone server unless running in a serverless platform (e.g. Vercel)
if (process.env.VERCEL !== '1') {
  startServer();
}
