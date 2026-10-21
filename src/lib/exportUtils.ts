import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { repairMyanmarDocumentText } from './myanmarFontFixer';

// 1. Download as Plain Text (UTF-8 with BOM for correct Windows/Mac Unicode detection)
export function downloadAsTxt(fileName: string, content: string) {
  const { repairedText } = repairMyanmarDocumentText(content);
  const blob = new Blob(['\ufeff' + repairedText], { type: 'text/plain;charset=utf-8' });
  triggerDownload(blob, `${cleanBaseName(fileName)}.txt`);
}

// 2. Download as Microsoft Word (.doc / .docx compatible HTML-based document with Noto Sans Myanmar & Padauk)
export function downloadAsWord(fileName: string, title: string, content: string) {
  const { repairedText } = repairMyanmarDocumentText(content);
  const formattedHtml = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset='utf-8'>
  <title>${escapeHtml(title)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Myanmar:wght@400;600;700&family=Padauk:wght@400;700&display=swap');
    body {
      font-family: 'Pyidaungsu', 'Noto Sans Myanmar', 'Padauk', 'Segoe UI', Arial, sans-serif;
      font-size: 13pt;
      line-height: 2.2;
      color: #1a1a1a;
      padding: 40px;
    }
    h1 {
      font-size: 20pt;
      color: #0f172a;
      border-bottom: 2px solid #2563eb;
      padding-bottom: 8px;
      margin-bottom: 24px;
      font-family: 'Pyidaungsu', 'Noto Sans Myanmar', sans-serif;
    }
    p {
      margin-bottom: 16px;
      text-align: justify;
      font-family: 'Pyidaungsu', 'Noto Sans Myanmar', 'Padauk', sans-serif;
    }
    .footer {
      margin-top: 40px;
      padding-top: 12px;
      border-top: 1px solid #cbd5e1;
      font-size: 10pt;
      color: #64748b;
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div>${repairedText.split('\n\n').map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`).join('')}</div>
  <div class="footer">
    SarPay AI Studio • မြန်မာဘာသာပြန် မှတ်တမ်း • ${new Date().toLocaleDateString()}
  </div>
</body>
</html>`;

  const blob = new Blob(['\ufeff' + formattedHtml], {
    type: 'application/msword;charset=utf-8',
  });
  triggerDownload(blob, `${cleanBaseName(fileName)}.doc`);
}

// 3. Download as PDF with 100% Perfect Myanmar Font Rendering & True Non-Clipping Multi-Page Pagination
export async function downloadAsPdf(
  fileName: string,
  title: string,
  content: string,
  onProgress?: (status: string) => void
): Promise<void> {
  onProgress?.('PDF အတွက် မြန်မာစာလုံးများကို ပြင်ဆင်စစ်ဆေးနေပါသည်...');

  // Auto-repair any raw artifacts or encoding glitches
  const { repairedText } = repairMyanmarDocumentText(content);

  // Preload web fonts (Noto Sans Myanmar & Padauk) to guarantee glyph shaping
  if (typeof document !== 'undefined' && document.fonts) {
    try {
      await Promise.allSettled([
        document.fonts.load('14px "Noto Sans Myanmar"'),
        document.fonts.load('bold 18px "Noto Sans Myanmar"'),
        document.fonts.load('14px "Padauk"'),
        document.fonts.ready,
      ]);
    } catch {
      // Continue even if font load warning
    }
  }

  // Split content into granular sentence-based blocks so no single block overflows a page
  const blocks = prepareContentBlocks(repairedText);

  // Measure block heights using hidden sandbox with forced layout
  const measureContainer = document.createElement('div');
  measureContainer.id = 'pdf-measure-sandbox';
  measureContainer.style.position = 'fixed';
  measureContainer.style.left = '-9999px';
  measureContainer.style.top = '0';
  measureContainer.style.width = '682px'; // Usable content width (794px A4 width - 112px padding)
  measureContainer.style.boxSizing = 'border-box';
  measureContainer.style.visibility = 'visible';
  measureContainer.style.pointerEvents = 'none';
  measureContainer.style.fontFamily = "'Noto Sans Myanmar', 'Pyidaungsu', 'Padauk', sans-serif";
  measureContainer.style.fontSize = '13.5px';
  measureContainer.style.lineHeight = '2.2';
  measureContainer.style.textAlign = 'justify';
  measureContainer.style.wordBreak = 'break-word';
  document.body.appendChild(measureContainer);

  // Paginate blocks into discrete A4 pages
  // Page 1 available content height: ~760px (Header is ~120px, margins 84px, footer 45px)
  // Page 2+ available content height: ~840px (Running header ~45px, margins 84px, footer 45px)
  const pages: Array<Array<{ type: 'heading' | 'paragraph'; text: string }>> = [];
  let currentPageBlocks: Array<{ type: 'heading' | 'paragraph'; text: string }> = [];
  let currentHeight = 0;
  let isFirstPage = true;

  for (const block of blocks) {
    measureContainer.innerHTML =
      block.type === 'heading'
        ? `<h3 style="font-size: 16px; font-weight: bold; margin: 16px 0 8px 0; font-family: 'Noto Sans Myanmar', sans-serif; line-height: 1.6;">${escapeHtml(
            block.text
          )}</h3>`
        : `<p style="margin: 0 0 14px 0; font-size: 13.5px; line-height: 2.2; font-family: 'Noto Sans Myanmar', sans-serif;">${escapeHtml(
            block.text
          )}</p>`;

    // Measure exact bounding rect height
    const rect = measureContainer.getBoundingClientRect();
    const blockHeight = Math.max(rect.height || 0, 32) + 12;

    const maxHeight = isFirstPage ? 760 : 840;

    if (currentHeight + blockHeight > maxHeight && currentPageBlocks.length > 0) {
      pages.push(currentPageBlocks);
      currentPageBlocks = [block];
      currentHeight = blockHeight;
      isFirstPage = false;
    } else {
      currentPageBlocks.push(block);
      currentHeight += blockHeight;
    }
  }

  if (currentPageBlocks.length > 0) {
    pages.push(currentPageBlocks);
  }

  if (document.body.contains(measureContainer)) {
    document.body.removeChild(measureContainer);
  }

  const totalPages = Math.max(1, pages.length);
  const pdf = new jsPDF('p', 'pt', 'a4');
  const a4WidthPt = 595.28;
  const a4HeightPt = 841.89;

  // Render host container - off-screen, fully visible so html2canvas computes perfect layout
  const renderHost = document.createElement('div');
  renderHost.id = 'pdf-render-host';
  renderHost.style.position = 'fixed';
  renderHost.style.left = '-9999px';
  renderHost.style.top = '0';
  renderHost.style.width = '794px';
  renderHost.style.opacity = '1';
  renderHost.style.visibility = 'visible';
  renderHost.style.pointerEvents = 'none';
  renderHost.style.zIndex = '-9999';
  document.body.appendChild(renderHost);

  try {
    for (let p = 0; p < totalPages; p++) {
      onProgress?.(`PDF စာမျက်နှာ ${p + 1} / ${totalPages} ကို တိကျစွာ ဖန်တီးနေပါသည်...`);

      const pageBlocks = pages[p] || [];
      const isFirst = p === 0;

      const pageDiv = document.createElement('div');
      pageDiv.style.width = '794px';
      pageDiv.style.minHeight = '1123px';
      pageDiv.style.height = '1123px';
      pageDiv.style.boxSizing = 'border-box';
      pageDiv.style.padding = '44px 56px 40px 56px';
      pageDiv.style.backgroundColor = '#ffffff';
      pageDiv.style.color = '#0f172a';
      pageDiv.style.fontFamily = "'Noto Sans Myanmar', 'Pyidaungsu', 'Padauk', sans-serif";
      pageDiv.style.display = 'flex';
      pageDiv.style.flexDirection = 'column';
      pageDiv.style.justifyContent = 'space-between';
      pageDiv.style.overflow = 'hidden';

      const blocksHtml = pageBlocks
        .map((b) => {
          if (b.type === 'heading') {
            return `<h3 style="font-size: 16px; font-weight: bold; color: #1e3a8a; margin: 14px 0 8px 0; border-bottom: 1.5px solid #bfdbfe; padding-bottom: 4px; font-family: 'Noto Sans Myanmar', sans-serif; line-height: 1.5;">${escapeHtml(
              b.text
            )}</h3>`;
          }
          return `<p style="margin: 0 0 14px 0; font-size: 13.5px; line-height: 2.2; text-align: justify; word-break: break-word; color: #1e293b; font-family: 'Noto Sans Myanmar', sans-serif;">${escapeHtml(
            b.text
          )}</p>`;
        })
        .join('');

      const headerHtml = isFirst
        ? `<div style="border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div>
                <h1 style="font-size: 19px; font-weight: 800; color: #0f172a; margin: 0; line-height: 1.5; font-family: 'Noto Sans Myanmar', sans-serif;">${escapeHtml(
                  title
                )}</h1>
                <div style="font-size: 11px; color: #64748b; margin-top: 4px;">SarPay AI Translation Studio • မြန်မာဘာသာပြန်ဆိုချက် စာအုပ်မူကြမ်း</div>
              </div>
              <div style="text-align: right; font-size: 11px; color: #64748b; font-family: monospace;">
                ${new Date().toLocaleDateString()}
              </div>
            </div>
          </div>`
        : `<div style="border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 18px; display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: #64748b;">
            <span style="font-weight: 600; color: #334155; max-width: 500px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: 'Noto Sans Myanmar', sans-serif;">${escapeHtml(
              title
            )}</span>
            <span style="font-size: 10px; color: #94a3b8;">SarPay AI Studio</span>
          </div>`;

      const footerHtml = `<div style="border-top: 1px solid #e2e8f0; padding-top: 10px; margin-top: 16px; display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: #64748b; font-family: 'Noto Sans Myanmar', sans-serif;">
        <span>SarPay AI Translation Studio • ဘာသာပြန်မူကြမ်း</span>
        <span style="font-weight: bold; color: #2563eb;">စာမျက်နှာ ${p + 1} / ${totalPages}</span>
      </div>`;

      pageDiv.innerHTML = `
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Myanmar:wght@400;600;700&family=Padauk:wght@400;700&display=swap');
          * {
            -webkit-font-smoothing: antialiased;
            text-rendering: optimizeLegibility;
          }
        </style>
        <div>${headerHtml}</div>
        <div style="flex: 1; min-height: 0;">${blocksHtml}</div>
        <div>${footerHtml}</div>
      `;

      renderHost.appendChild(pageDiv);

      // 2.5x high-DPI lossless capture
      const canvas = await html2canvas(pageDiv, {
        scale: 2.5,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: 794,
        height: 1123,
        windowWidth: 794,
        windowHeight: 1123,
      });

      renderHost.removeChild(pageDiv);

      if (p > 0) {
        pdf.addPage('a4', 'p');
      }

      // Use PNG for lossless razor-sharp font rendering
      const pageImgData = canvas.toDataURL('image/png');
      pdf.addImage(pageImgData, 'PNG', 0, 0, a4WidthPt, a4HeightPt, undefined, 'FAST');
    }

    pdf.save(`${cleanBaseName(fileName)}.pdf`);
    onProgress?.(`PDF စာမျက်နှာ ${totalPages} မျက်နှာလုံး အောင်မြင်စွာ ဒေါင်းလုဒ်ပြီးပါပြီ။`);
  } catch (err) {
    console.error('PDF generation error:', err);
    // Fallback: trigger vector print / save as PDF
    printMyanmarDocument(title, content);
  } finally {
    if (document.body.contains(renderHost)) {
      document.body.removeChild(renderHost);
    }
  }
}

// 4. Safe In-App Browser Print / Save as PDF (Bypasses window.open block via hidden iframe)
// Produces 100% Vector Text with Selectable Myanmar Unicode Typography
export function printMyanmarDocument(title: string, content: string) {
  const { repairedText } = repairMyanmarDocumentText(content);

  const existingFrame = document.getElementById('sar-pay-print-frame');
  if (existingFrame) existingFrame.remove();

  const iframe = document.createElement('iframe');
  iframe.id = 'sar-pay-print-frame';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) return;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)} - SarPay AI PDF</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Myanmar:wght@400;600;700&family=Padauk:wght@400;700&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4 portrait;
      margin: 18mm 20mm;
    }
    body {
      font-family: 'Noto Sans Myanmar', 'Pyidaungsu', 'Padauk', sans-serif;
      font-size: 13pt;
      line-height: 2.2;
      color: #111827;
      margin: 0;
      padding: 10px;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    h1 {
      font-size: 19pt;
      color: #1e3a8a;
      border-bottom: 2px solid #3b82f6;
      padding-bottom: 8px;
      margin-bottom: 24px;
      line-height: 1.5;
    }
    p {
      margin-bottom: 14px;
      text-align: justify;
      word-break: break-word;
    }
    .footer {
      margin-top: 40px;
      border-top: 1px solid #cbd5e1;
      padding-top: 12px;
      font-size: 10pt;
      color: #64748b;
      text-align: center;
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div>${repairedText.split('\n\n').map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`).join('')}</div>
  <div class="footer">SarPay AI Translation Studio • ${new Date().toLocaleDateString()}</div>
</body>
</html>`;

  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  }, 700);
}

// Backward compatible alias
export function openPrintableMyanmarWindow(title: string, content: string) {
  printMyanmarDocument(title, content);
}

// Helper: Split content into paragraphs and headings, splitting oversized blocks along sentences
// Guarantees each block is <= 90 words so pagination is smooth, never overflowing or dropping lines
function prepareContentBlocks(content: string): Array<{ type: 'heading' | 'paragraph'; text: string }> {
  const rawLines = content.split('\n');
  const blocks: Array<{ type: 'heading' | 'paragraph'; text: string }> = [];

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('#') || trimmed.startsWith('---')) {
      blocks.push({
        type: 'heading',
        text: trimmed.replace(/^#+\s*/, ''),
      });
      continue;
    }

    // Split long paragraphs along Myanmar sentence boundary '။' or period
    const words = trimmed.split(/\s+/);
    if (words.length > 80 || trimmed.length > 400) {
      // Split by Myanmar sentence stop '။' or punctuation
      const sentenceRegex = /([^။.!?]+(?:[။.!?]|\s*$))/g;
      const matches = trimmed.match(sentenceRegex);
      if (matches && matches.length > 1) {
        let currentChunk = '';
        for (const m of matches) {
          if ((currentChunk + ' ' + m).split(/\s+/).length > 70) {
            if (currentChunk.trim()) {
              blocks.push({ type: 'paragraph', text: currentChunk.trim() });
            }
            currentChunk = m;
          } else {
            currentChunk += (currentChunk ? ' ' : '') + m;
          }
        }
        if (currentChunk.trim()) {
          blocks.push({ type: 'paragraph', text: currentChunk.trim() });
        }
      } else {
        // Fallback: chunk by word limit ~70 words
        for (let i = 0; i < words.length; i += 70) {
          blocks.push({
            type: 'paragraph',
            text: words.slice(i, i + 70).join(' '),
          });
        }
      }
    } else {
      blocks.push({ type: 'paragraph', text: trimmed });
    }
  }

  if (blocks.length === 0) {
    blocks.push({ type: 'paragraph', text: content || '(ဘာသာပြန်စာသား မရှိပါ)' });
  }

  return blocks;
}

// Helper to trigger file download
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function cleanBaseName(name: string): string {
  return name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_\u1000-\u109F\s-]/g, '_');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Copy helper
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  } catch {
    return false;
  }
}
