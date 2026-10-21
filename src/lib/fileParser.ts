import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import { TranslationSegment } from './firebase';
import { repairMyanmarDocumentText } from './myanmarFontFixer';

// Safe client-side worker fallback if server is offline
if (typeof window !== 'undefined') {
  try {
    // Try version-matched or local worker if supported
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  } catch (e) {
    console.warn('PDF Worker local config warning:', e);
  }
}

export interface ParsedDocument {
  fileName: string;
  fileSize: number;
  fileType: string;
  totalText: string;
  pageCount: number;
  wordCount: number;
  characterCount: number;
  isLargeBook: boolean;
  segments: TranslationSegment[];
  estimatedSeconds: number;
}

// Estimate pages from word count if not PDF: ~300 words = 1 standard page
export const WORDS_PER_PAGE = 300;
export const LARGE_PAGE_THRESHOLD = 5;
export const LARGE_WORD_THRESHOLD = 1500;

export async function parseUploadedFile(file: File): Promise<ParsedDocument> {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  let fullText = '';
  let pageList: string[] = [];

  if (extension === 'txt') {
    fullText = await file.text();
    // Repair font / zawgyi if present
    const repaired = repairMyanmarDocumentText(fullText);
    fullText = repaired.repairedText;
    pageList = splitTextIntoPseudoPages(fullText, WORDS_PER_PAGE);
  } else if (extension === 'docx') {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    fullText = result.value || '';
    const repaired = repairMyanmarDocumentText(fullText);
    fullText = repaired.repairedText;
    pageList = splitTextIntoPseudoPages(fullText, WORDS_PER_PAGE);
  } else if (extension === 'pdf') {
    // Primary strategy: Call server-side /api/parse-document for 100% reliable Node extraction
    let parsedViaServer = false;
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch('/api/parse-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, fileName: file.name }),
      });
      const data = await res.json();
      if (data.success && data.fullText && data.pages) {
        fullText = data.fullText;
        pageList = data.pages;
        parsedViaServer = true;
      }
    } catch (serverErr) {
      console.warn('Server-side PDF parse error, attempting client-side:', serverErr);
    }

    // Client-side fallback if server was not reachable
    if (!parsedViaServer) {
      const arrayBuffer = await file.arrayBuffer();
      try {
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
        const pdf = await loadingTask.promise;
        const numPages = pdf.numPages;

        for (let i = 1; i <= numPages; i++) {
          try {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            let pageText = '';
            for (const item of textContent.items as any[]) {
              if ('str' in item && item.str) {
                pageText += item.str + (item.hasEOL ? '\n' : ' ');
              }
            }
            const clean = repairMyanmarDocumentText(pageText.trim()).repairedText;
            pageList.push(clean);
          } catch (pageErr) {
            console.warn(`Failed reading PDF page ${i}:`, pageErr);
            pageList.push('');
          }
        }
        fullText = pageList.join('\n\n');
      } catch (clientErr) {
        console.error('Client PDF parse error:', clientErr);
        throw new Error('PDF ဖိုင်အား ဖတ်ရှု၍ မရနိုင်ပါ။ ဖိုင်သည် ပျက်စီးနေခြင်း သို့မဟုတ် စကားဝှက်ဖြင့် ကာကွယ်ထားခြင်း ဖြစ်နိုင်ပါသည်။');
      }
    }
  } else {
    // Other plain text files
    fullText = await file.text();
    const repaired = repairMyanmarDocumentText(fullText);
    fullText = repaired.repairedText;
    pageList = splitTextIntoPseudoPages(fullText, WORDS_PER_PAGE);
  }

  // Ensure all text is completely free of PDF binary stream tokens and formatted in Unicode
  const finalClean = repairMyanmarDocumentText(fullText);
  fullText = finalClean.repairedText;

  const wordCount = countWords(fullText);
  const pageCount = Math.max(pageList.length, Math.ceil(wordCount / WORDS_PER_PAGE), 1);
  const isLargeBook = pageCount > LARGE_PAGE_THRESHOLD || wordCount >= LARGE_WORD_THRESHOLD;

  // Build 5-page segment cards as requested
  const segments = buildSegments(pageList, fullText, isLargeBook, pageCount);

  // Estimate translation time: ~2 seconds per 300 words
  const estimatedSeconds = Math.max(5, Math.ceil((wordCount / 300) * 2));

  return {
    fileName: file.name,
    fileSize: file.size,
    fileType: extension.toUpperCase(),
    totalText: fullText,
    pageCount,
    wordCount,
    characterCount: fullText.length,
    isLargeBook,
    segments,
    estimatedSeconds,
  };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
}

function countWords(str: string): number {
  return str.trim() ? str.trim().split(/\s+/).length : 0;
}

function splitTextIntoPseudoPages(text: string, wordsPerPage: number): string[] {
  const words = text.split(/\s+/);
  if (words.length <= wordsPerPage) {
    return [text];
  }

  const pages: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerPage) {
    pages.push(words.slice(i, i + wordsPerPage).join(' '));
  }
  return pages;
}

// Build 5-page chunks: "စာမျက်နှာ ၅ မျက်နှာစီ အပိုင်းခွဲ၍"
export function buildSegments(
  pages: string[],
  fullText: string,
  isLarge: boolean,
  totalPageCount: number
): TranslationSegment[] {
  if (!isLarge) {
    return [
      {
        id: 'SEG-1',
        segmentIndex: 0,
        title: 'စာအုပ်အပြည့်အစုံ',
        pageRange: `စာမျက်နှာ ၁ မှ ${totalPageCount} ထိ`,
        originalText: fullText,
        translatedText: '',
        status: 'pending',
        wordCount: countWords(fullText),
      },
    ];
  }

  const PAGES_PER_SEGMENT = 5;
  const segments: TranslationSegment[] = [];

  const totalPages = Math.max(pages.length, totalPageCount);
  const segmentCount = Math.ceil(totalPages / PAGES_PER_SEGMENT);

  for (let i = 0; i < segmentCount; i++) {
    const startPage = i * PAGES_PER_SEGMENT + 1;
    const endPage = Math.min((i + 1) * PAGES_PER_SEGMENT, totalPages);

    let segmentText = '';
    if (pages.length >= totalPages) {
      segmentText = pages.slice(startPage - 1, endPage).join('\n\n');
    } else {
      const words = fullText.split(/\s+/);
      const wordsPerSeg = Math.ceil(words.length / segmentCount);
      segmentText = words.slice(i * wordsPerSeg, (i + 1) * wordsPerSeg).join(' ');
    }

    segments.push({
      id: `SEG-${i + 1}`,
      segmentIndex: i,
      title: `အပိုင်း ${i + 1} (စာမျက်နှာ ${startPage} မှ ${endPage} ထိ)`,
      pageRange: `စာမျက်နှာ ${startPage} - ${endPage}`,
      originalText: segmentText,
      translatedText: '',
      status: 'pending',
      wordCount: countWords(segmentText),
    });
  }

  return segments;
}
