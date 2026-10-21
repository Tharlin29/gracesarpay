/**
 * Myanmar Font & PDF Artifact Repair Utility
 * - Strips raw PDF binary stream tokens, InDesign tags (MM2019_AJ.indd), FlateDecode headers, and compressed garbage
 * - Detects Zawgyi font encoding and converts to standard Myanmar Unicode
 * - Reorders Myanmar diacritics into canonical Unicode normalization form
 */

// Regex patterns for raw PDF stream artifacts and InDesign metadata
const INDESIGN_PATTERNS = [
  /MM2019[_\w.:\d\s-]+/gi,
  /Anchor(?:\s*\d*)?:\d+/gi,
  /Adobe PDF Library[\d.\s]+/gi,
  /PB:\d+[\w@.:-]+/gi,
  /Macintosh/gi,
  /D:\d{14}[+\-\d']+/gi,
];

const PDF_STREAM_PATTERNS = [
  /<<\s*\/Length\s+\d+[\s\S]*?\/Filter\s*\/FlateDecode\s*>>\s*stream[\s\S]*?(?:endstream|$)/gi,
  /endstream\s+endobj/gi,
  /\b\d+\s+\d+\s+obj\b/gi,
  /<<\s*\/Filter\s*\/FlateDecode[\s\S]*?>>/gi,
  /<<\s*\/Length\s+\d+[\s\S]*?>>/gi,
  /\b(endstream|endobj|startxref|xref|trailer)\b/gi,
  // Match stream followed by binary garbled strings like "stream HWmk#7..."
  /stream\s+[A-Za-z0-9#_~`!@$%^&*()=+/\\[\]{}|;:,.<>?-]{10,}/gi,
];

/**
 * Strips raw PDF binary bytes, InDesign tags, and stream metadata
 * that accidentally get extracted when a PDF fails normal decoding.
 */
export function cleanPdfArtifacts(rawText: string): string {
  if (!rawText) return '';

  let cleaned = rawText;

  // 1. Remove PDF object and stream definitions
  for (const pat of PDF_STREAM_PATTERNS) {
    cleaned = cleaned.replace(pat, ' ');
  }

  // 2. Remove InDesign layout anchor metadata lines
  for (const pat of INDESIGN_PATTERNS) {
    cleaned = cleaned.replace(pat, ' ');
  }

  // 3. Remove long continuous runs of non-word / binary character sequences
  cleaned = cleaned.replace(/[A-Za-z0-9#_~`!@$%^&*()=+/\\[\]{}|;:<>-]{40,}/g, ' ');

  // 4. Remove unprintable ASCII control characters (0x00 - 0x1F, except \n \r \t)
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ');

  // 5. Clean consecutive repeated symbols, broken punctuation, and excess whitespaces
  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

/**
 * Detects whether the input string is likely Zawgyi font encoded.
 */
export function isZawgyi(text: string): boolean {
  if (!text || text.length < 5) return false;

  // Key Zawgyi-only code points and structural patterns:
  // Zawgyi pre-posed e-vowel followed by consonant
  const zawgyiPreE = /\u1031[\u1000-\u1021]/;
  // Zawgyi subscript characters: \u1060-\u1069, \u106C, \u106D, \u1070-\u107C
  const zawgyiSubscripts = /[\u1060-\u1069\u106C\u106D\u1070-\u107C\u1085\u1087-\u108A\u1090-\u1092]/;
  // Zawgyi ya-yit with medial combinations
  const zawgyiMedials = /[\u107D-\u1084]/;
  // Zawgyi double vowel marks
  const zawgyiDoubleVowels = /\u1033\u102F|\u1034\u102F|\u103A\u1037|\u1036\u1037/;

  const sample = text.slice(0, 3000);
  let score = 0;

  if (zawgyiPreE.test(sample)) score += 3;
  if (zawgyiSubscripts.test(sample)) score += 3;
  if (zawgyiMedials.test(sample)) score += 2;
  if (zawgyiDoubleVowels.test(sample)) score += 2;

  // Unicode specific signs that Zawgyi never has:
  // Unicode Virama \u1039, Unicode Asat \u103A after consonant
  const unicodeVirama = /\u1039[\u1000-\u1021]/;
  if (unicodeVirama.test(sample)) score -= 4;

  return score >= 3;
}

/**
 * Converts Zawgyi encoded Myanmar text to standard Myanmar Unicode.
 * Follows the standard Rabbit Zawgyi to Unicode conversion rules.
 */
export function zawgyiToUnicode(input: string): string {
  if (!input) return '';

  let text = input;

  // 1. Reorder pre-posed e-vowel \u1031
  // In Zawgyi, \u1031 is typed BEFORE the consonant: \u1031 + Consonant (+ optional diacritics)
  // In Unicode, \u1031 comes AFTER the consonant cluster: Consonant (+ Medials) + \u1031
  text = text.replace(
    /\u1031([\u1000-\u1021])([\u103B-\u103E]*)/g,
    '$1$2\u1031'
  );

  // 2. Replace Zawgyi subscripts (\u1060-\u1069, \u1070-\u107C) with \u1039 + consonant
  const zawgyiSubscriptMap: Record<string, string> = {
    '\u1060': '\u1039\u1000',
    '\u1061': '\u1039\u1001',
    '\u1062': '\u1039\u1002',
    '\u1063': '\u1039\u1003',
    '\u1065': '\u1039\u1005',
    '\u1066': '\u1039\u1006',
    '\u1067': '\u1039\u1007',
    '\u1068': '\u1039\u1008',
    '\u1069': '\u1039\u100A',
    '\u1070': '\u1039\u1010',
    '\u1071': '\u1039\u1011',
    '\u1072': '\u1039\u1012',
    '\u1073': '\u1039\u1013',
    '\u1074': '\u1039\u1014',
    '\u1075': '\u1039\u1015',
    '\u1076': '\u1039\u1016',
    '\u1077': '\u1039\u1017',
    '\u1078': '\u1039\u1018',
    '\u1079': '\u1039\u1019',
    '\u107A': '\u1039\u101A',
    '\u107B': '\u1039\u101B',
    '\u107C': '\u1039\u101C',
  };

  for (const [zg, uni] of Object.entries(zawgyiSubscriptMap)) {
    text = text.replaceAll(zg, uni);
  }

  // 3. Replace Zawgyi medials and special glyphs
  text = text.replace(/[\u107D\u107E\u107F\u1080\u1081\u1082\u1083\u1084]/g, '\u103C'); // Ra-yit
  text = text.replace(/[\u1087\u1088\u1089\u108A]/g, '\u103D'); // Wa-swe
  text = text.replace(/\u1064/g, '\u1004\u103A\u1039'); // Kinzi

  // 4. Normalize Unicode ordering:
  text = normalizeMyanmarUnicode(text);

  return text;
}

/**
 * Normalizes Myanmar Unicode diacritic sequence for crystal-clear font rendering.
 */
export function normalizeMyanmarUnicode(str: string): string {
  // Reorder misplaced dot-below and asat
  let res = str.replace(/\u1037\u103A/g, '\u103A\u1037');
  // Reorder misplaced anusvara and vowel u
  res = res.replace(/\u1036\u102F/g, '\u102F\u1036');
  res = res.replace(/\u1036\u1030/g, '\u1030\u1036');
  // Reorder tall aa with anusvara
  res = res.replace(/\u1036\u102B/g, '\u102B\u1036');
  res = res.replace(/\u1036\u102C/g, '\u102C\u1036');
  return res;
}

/**
 * Universal Repair Function for text & documents
 */
export function repairMyanmarDocumentText(input: string): {
  repairedText: string;
  hasPdfArtifacts: boolean;
  isZawgyiDetected: boolean;
  wasModified: boolean;
  summary: string;
} {
  if (!input) {
    return {
      repairedText: '',
      hasPdfArtifacts: false,
      isZawgyiDetected: false,
      wasModified: false,
      summary: '',
    };
  }

  const hasPdfArtifacts = /MM2019|FlateDecode|Adobe PDF Library|endstream|endobj|<<[\s\S]*?>>/i.test(input);
  let working = input;

  if (hasPdfArtifacts) {
    working = cleanPdfArtifacts(working);
  }

  const isZg = isZawgyi(working);
  if (isZg) {
    working = zawgyiToUnicode(working);
  } else {
    working = normalizeMyanmarUnicode(working);
  }

  const wasModified = working !== input;

  const parts: string[] = [];
  if (hasPdfArtifacts) parts.push('PDF Binary & InDesign metadata အမှိုက်များကို ရှင်းလင်းပြီး');
  if (isZg) parts.push('Zawgyi Font မှ Standard Myanmar Unicode သို့ ပြောင်းလဲပြင်ဆင်ပြီး');
  if (wasModified && !hasPdfArtifacts && !isZg) parts.push('Myanmar Unicode စာလုံးပေါင်းစနစ် Normalization ပြုလုပ်ပြီး');

  const summary = parts.length > 0 ? parts.join(' • ') : 'မြန်မာစာလုံးပေါင်းနှင့် ဖောင့်ပုံစံ အားလုံး မှန်ကန်နေပါသည်';

  return {
    repairedText: working,
    hasPdfArtifacts,
    isZawgyiDetected: isZg,
    wasModified,
    summary,
  };
}
