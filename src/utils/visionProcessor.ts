import type { VisionAnalysis, VisionImage, VisionElement, ExtractedImage } from '../types';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

// Actual API URL for production (Tauri fetch bypasses CORS)
const REPLICATE_API_URL = 'https://api.replicate.com/v1/models/perceptron-ai-inc/isaac-0.1/predictions';
// Proxy URL for development (Vite handles CORS)
const PROXY_API_URL = '/api/replicate/v1/models/perceptron-ai-inc/isaac-0.1/predictions';

// Detect if running in Tauri production build
const isTauriProd = () => {
  return typeof window !== 'undefined' &&
    '__TAURI_INTERNALS__' in window &&
    import.meta.env.PROD;
};

interface IsaacResponse {
  output?: {
    text?: string;
    structured_output?: string;
    image?: string;
  };
  error?: string;
  status: string;
}

interface LayoutElement {
  type: 'headline' | 'subheadline' | 'paragraph' | 'image' | 'list' | 'citation';
  content: string;
  y: number; // vertical position for sorting
  x: number; // horizontal position for column detection
  width: number;
  height: number;
  isBold?: boolean;
}

/**
 * Call Isaac 01 API with an image
 * Uses Tauri's native fetch in production to bypass CORS
 */
async function callIsaacAPI(
  imageBase64: string,
  prompt: string,
  apiKey: string,
  maxTokens: number = 512
): Promise<IsaacResponse> {
  const requestBody = {
    input: {
      image: `data:image/png;base64,${imageBase64}`,
      prompt,
      max_new_tokens: maxTokens
    }
  };

  // Use Tauri fetch in production (bypasses CORS), regular fetch in dev (uses Vite proxy)
  const useTauriFetch = isTauriProd();
  const apiUrl = useTauriFetch ? REPLICATE_API_URL : PROXY_API_URL;
  const fetchFn = useTauriFetch ? tauriFetch : fetch;

  const response = await fetchFn(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Isaac API error response:', errorText);
    throw new Error(`Isaac API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return await response.json();
}

/**
 * Clean text output from Isaac - remove artifacts and decode entities
 * Preserves newlines for markdown structure
 */
function cleanText(text: string, preserveNewlines: boolean = false): string {
  let cleaned = text
    // Remove point_box tags and their attributes
    .replace(/<point_box[^>]*>/g, '')
    .replace(/<\/point_box>/g, '')
    .replace(/<collection[^>]*>/g, '')
    .replace(/<\/collection>/g, '')
    // Decode HTML entities
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'");

  if (preserveNewlines) {
    // Only collapse multiple spaces (not newlines) and trim lines
    cleaned = cleaned
      .split('\n')
      .map(line => line.replace(/[ \t]+/g, ' ').trim())
      .join('\n')
      // Collapse 3+ newlines to 2
      .replace(/\n{3,}/g, '\n\n');
  } else {
    // Collapse all whitespace to single space
    cleaned = cleaned.replace(/\s+/g, ' ');
  }

  return cleaned.trim();
}

/**
 * Fix markdown structure by ensuring proper line breaks
 * The API often returns text without proper newlines
 */
function fixMarkdownStructure(text: string): string {
  let fixed = text;

  // Add newlines before headings (if not already there)
  fixed = fixed.replace(/([^\n])(#{1,6}\s)/g, '$1\n\n$2');

  // Add newlines after headings (find heading, then non-newline content)
  fixed = fixed.replace(/(#{1,6}\s[^\n]+)([^\n])/g, (match, heading, next) => {
    // Don't break if already at end or next char would start new paragraph
    if (next === '\n') return match;
    return heading + '\n\n' + next;
  });

  // Add newlines before images
  fixed = fixed.replace(/([^\n])(!\[)/g, '$1\n\n$2');

  // Add newlines after image captions (italic text after images)
  fixed = fixed.replace(/(\*[^*]+\*)\s*([^\n\s])/g, '$1\n\n$2');

  // Add newlines before blockquotes
  fixed = fixed.replace(/([^\n])(>\s)/g, '$1\n\n$2');

  // Add newlines before bold section starts (likely subheadings)
  fixed = fixed.replace(/([.!?])\s*(\*\*[A-Z])/g, '$1\n\n$2');

  // Add newlines before list items
  fixed = fixed.replace(/([^\n])(\n?-\s+\*\*)/g, '$1\n\n$2');

  // Clean up excessive newlines
  fixed = fixed.replace(/\n{3,}/g, '\n\n');

  return fixed.trim();
}

/**
 * Get all text elements with bounding boxes for layout understanding
 * Uses JSON response type and asks for structured output
 */
async function getTextLayout(
  imageBase64: string,
  apiKey: string
): Promise<LayoutElement[]> {
  const elements: LayoutElement[] = [];

  // Get headlines with positions
  const headlineResult = await callIsaacAPI(
    imageBase64,
    `Find all headlines, titles, and section headers on this page.
Return a JSON array with each item having: {"type": "headline", "text": "...", "top": number, "left": number, "width": number, "height": number}
Return ONLY valid JSON, no other text.`,
    apiKey
  );

  if (headlineResult.output?.text) {
    try {
      const jsonMatch = headlineResult.output.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const items = JSON.parse(jsonMatch[0]);
        for (const item of items) {
          elements.push({
            type: 'headline',
            content: cleanText(item.text || item.content || ''),
            y: item.top || item.y || 0,
            x: item.left || item.x || 0,
            width: item.width || 100,
            height: item.height || 30,
          });
        }
      }
    } catch (e) {
      console.warn('Failed to parse headline JSON:', e);
    }
  }

  // Get images with descriptions and positions
  const imageResult = await callIsaacAPI(
    imageBase64,
    `Find all photographs, pictures, logos, and images on this page. Describe what each one shows.
Return a JSON array with each item having: {"type": "image", "description": "...", "top": number, "left": number, "width": number, "height": number}
Return ONLY valid JSON, no other text.`,
    apiKey
  );

  if (imageResult.output?.text) {
    try {
      const jsonMatch = imageResult.output.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const items = JSON.parse(jsonMatch[0]);
        const seenImages = new Set<string>();
        for (const item of items) {
          const key = `${item.left || item.x},${item.top || item.y}`;
          if (seenImages.has(key)) continue;
          seenImages.add(key);

          elements.push({
            type: 'image',
            content: cleanText(item.description || item.text || ''),
            y: item.top || item.y || 0,
            x: item.left || item.x || 0,
            width: item.width || 100,
            height: item.height || 100,
          });
        }
      }
    } catch (e) {
      console.warn('Failed to parse image JSON:', e);
    }
  }

  // Get body paragraphs with positions
  const paragraphResult = await callIsaacAPI(
    imageBase64,
    `Find all body text paragraphs on this page (not headlines).
Return a JSON array with each item having: {"type": "paragraph", "text": "...", "top": number, "left": number, "width": number, "height": number}
Return ONLY valid JSON, no other text.`,
    apiKey
  );

  if (paragraphResult.output?.text) {
    try {
      const jsonMatch = paragraphResult.output.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const items = JSON.parse(jsonMatch[0]);
        for (const item of items) {
          // Skip if this overlaps with a headline we already have
          const itemY = item.top || item.y || 0;
          const isHeadline = elements.some(e =>
            e.type === 'headline' &&
            Math.abs(e.y - itemY) < 20
          );
          if (isHeadline) continue;

          elements.push({
            type: 'paragraph',
            content: cleanText(item.text || item.content || ''),
            y: itemY,
            x: item.left || item.x || 0,
            width: item.width || 100,
            height: item.height || 50,
          });
        }
      }
    } catch (e) {
      console.warn('Failed to parse paragraph JSON:', e);
    }
  }

  return elements;
}

/**
 * Sort elements by reading order (top to bottom, left to right)
 */
function sortByReadingOrder(elements: LayoutElement[]): LayoutElement[] {
  return [...elements].sort((a, b) => {
    // First sort by vertical position (with some tolerance for same-line items)
    const yDiff = a.y - b.y;
    if (Math.abs(yDiff) > 30) {
      return yDiff;
    }
    // If roughly same vertical position, sort left to right
    return a.x - b.x;
  });
}

/**
 * Deduplicate elements that have similar content
 */
function deduplicateElements(elements: LayoutElement[]): LayoutElement[] {
  const seen = new Set<string>();
  return elements.filter(el => {
    // Normalize content for comparison
    const normalized = el.content.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
    if (seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

/**
 * Build markdown from sorted layout elements
 */
function buildMarkdownFromLayout(elements: LayoutElement[]): string {
  const lines: string[] = [];
  let lastType: string | null = null;

  for (const element of elements) {
    // Add spacing between different element types
    if (lastType && lastType !== element.type) {
      lines.push('');
    }

    switch (element.type) {
      case 'headline':
        // Determine heading level based on size/position
        if (element.height > 40 || element.y < 100) {
          lines.push(`# ${element.content}`);
        } else {
          lines.push(`## ${element.content}`);
        }
        break;

      case 'subheadline':
        lines.push(`### ${element.content}`);
        break;

      case 'image':
        lines.push(`![${element.content}](image)`);
        lines.push(`*${element.content}*`);
        break;

      case 'paragraph':
        lines.push(element.content);
        break;

      case 'list':
        lines.push(element.content);
        break;

      case 'citation':
        lines.push(`> ${element.content}`);
        break;
    }

    lastType = element.type;
  }

  return lines.join('\n\n');
}

/**
 * Get a complete structured analysis of the page
 */
export async function analyzePageStructure(
  imageBase64: string,
  apiKey: string
): Promise<VisionAnalysis> {
  // Get layout elements with positions
  const layoutElements = await getTextLayout(imageBase64, apiKey);

  // Sort by reading order
  const sortedElements = sortByReadingOrder(layoutElements);

  // Remove duplicates
  const uniqueElements = deduplicateElements(sortedElements);

  // Build markdown
  const markdown = buildMarkdownFromLayout(uniqueElements);

  // Extract images for the VisionAnalysis structure
  const images: VisionImage[] = uniqueElements
    .filter(e => e.type === 'image')
    .map(e => ({
      description: e.content,
      boundingBox: {
        topLeft: { x: e.x, y: e.y },
        bottomRight: { x: e.x + e.width, y: e.y + e.height }
      }
    }));

  // Convert to VisionElement format
  const readingOrder: VisionElement[] = uniqueElements.map(e => ({
    type: e.type,
    content: e.content,
    boundingBox: {
      topLeft: { x: e.x, y: e.y },
      bottomRight: { x: e.x + e.width, y: e.y + e.height }
    }
  }));

  return {
    text: markdown,
    images,
    readingOrder
  };
}

/**
 * Simpler single-call extraction for faster processing
 */
export async function quickExtract(
  imageBase64: string,
  apiKey: string
): Promise<string> {
  const result = await callIsaacAPI(
    imageBase64,
    `You are a document OCR system. Extract ALL text from this document page and format as clean markdown.

Rules:
1. Main title: Use # heading
2. Section headers: Use ## heading
3. Subheaders: Use ### heading
4. Regular paragraphs: Plain text with blank lines between
5. Images/photos: Add ![description](image) with italicized caption below
6. Lists: Use - for bullets, 1. 2. 3. for numbered
7. Bold text: Use **bold**
8. Quotes: Use > blockquote

Output ONLY the clean markdown, no explanations or preamble.
Preserve the exact reading order from top to bottom.
Do not duplicate any content.`,
    apiKey,
    512
  );

  let text = result.output?.text || '';

  // Clean up the output while preserving markdown structure (newlines)
  text = cleanText(text, true);

  // Remove any preamble like "Here's the text..."
  text = text.replace(/^(Here's|Here is|The text|This is).*?:\s*/i, '');

  // Fix markdown structure - ensure proper line breaks
  text = fixMarkdownStructure(text);

  return text.trim();
}

/**
 * Convert canvas to base64 PNG
 */
export function canvasToBase64(canvas: HTMLCanvasElement): string {
  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.replace(/^data:image\/png;base64,/, '');
}

/**
 * Main enhancement function - uses vision AI to improve document extraction
 */
export async function enhanceWithVision(
  mupdfText: string,
  imageBase64: string,
  apiKey: string
): Promise<string> {
  try {
    // Use quick extraction for speed, fall back to full analysis if needed
    const visionText = await quickExtract(imageBase64, apiKey);

    // If vision AI produced good output, use it
    if (visionText && visionText.length > 50) {
      return visionText;
    }

    // Fall back to MuPDF text
    return mupdfText;
  } catch (error) {
    console.warn('Vision AI enhancement failed:', error);
    return mupdfText;
  }
}

/**
 * Full analysis mode - slower but more accurate layout detection
 */
export async function fullAnalysis(
  imageBase64: string,
  apiKey: string
): Promise<string> {
  const analysis = await analyzePageStructure(imageBase64, apiKey);
  return analysis.text;
}

/**
 * Image structure with bounding box for extraction
 */
export interface ImageRegion {
  description: string;
  afterHeadline: string;
  bounds?: { x: number; y: number; width: number; height: number };
}

/**
 * Get document structure analysis from Vision AI
 */
export async function getDocumentStructure(
  imageBase64: string,
  apiKey: string
): Promise<{
  headlines: Array<{ text: string; level: number; order: number }>;
  images: ImageRegion[];
}> {
  const result = await callIsaacAPI(
    imageBase64,
    `Find ONLY photographs/pictures (NOT text) on this page. For each PHOTO found, give its pixel location.
Page is approximately 800 pixels wide, 1100 pixels tall.
Return JSON: [{"photo":"what the photo shows","x":pixels from left,"y":pixels from top,"w":width,"h":height}]
If no photos exist, return: []
ONLY return the JSON array.`,
    apiKey,
    512
  );

  const defaultResult = { headlines: [], images: [] };

  if (result.output?.text) {
    try {
      // Try to extract JSON array
      let jsonText = result.output.text.trim();

      // Find array bounds
      const startIdx = jsonText.indexOf('[');
      let endIdx = jsonText.lastIndexOf(']');

      if (startIdx === -1) {
        console.log('No JSON array found in response');
        return defaultResult;
      }

      // If array is truncated, try to fix it
      if (endIdx === -1 || endIdx < startIdx) {
        // Find last complete object
        const lastBrace = jsonText.lastIndexOf('}');
        if (lastBrace > startIdx) {
          jsonText = jsonText.slice(startIdx, lastBrace + 1) + ']';
        } else {
          return defaultResult;
        }
      } else {
        jsonText = jsonText.slice(startIdx, endIdx + 1);
      }

      const parsed = JSON.parse(jsonText);

      if (!Array.isArray(parsed)) {
        return defaultResult;
      }

      const images: ImageRegion[] = parsed.map((img: any) => ({
        description: img.photo || img.desc || img.description || '',
        afterHeadline: img.section || img.headline || '',
        bounds: (img.x !== undefined && img.y !== undefined) ? {
          // Convert from ~800x1100 pixel coords to normalized 0-1
          x: (img.x || 0) / 800,
          y: (img.y || 0) / 1100,
          width: (img.w || img.width || 150) / 800,
          height: (img.h || img.height || 150) / 1100
        } : undefined
      }));

      console.log('Extracted images:', images);
      return { headlines: [], images };
    } catch (e) {
      console.warn('Failed to parse document structure:', e);
    }
  }
  return defaultResult;
}

/**
 * Extract image regions from a canvas based on bounding boxes
 * Returns a Map with index as key so we can match back to structure.images
 */
export function extractImageRegions(
  canvas: HTMLCanvasElement,
  images: ImageRegion[]
): Map<number, string> {
  const results = new Map<number, string>();
  const ctx = canvas.getContext('2d');
  if (!ctx) return results;

  console.log('Canvas size:', canvas.width, 'x', canvas.height);

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (!img.bounds) {
      console.log(`Image ${i} has no bounds`);
      continue;
    }

    // Convert normalized coordinates to pixel coordinates
    const x = Math.floor(img.bounds.x * canvas.width);
    const y = Math.floor(img.bounds.y * canvas.height);
    const width = Math.floor(img.bounds.width * canvas.width);
    const height = Math.floor(img.bounds.height * canvas.height);

    console.log(`Image ${i} bounds:`, { x, y, width, height, desc: img.description.slice(0, 30) });

    // Ensure bounds are within canvas
    const safeX = Math.max(0, Math.min(x, canvas.width - 1));
    const safeY = Math.max(0, Math.min(y, canvas.height - 1));
    const safeWidth = Math.min(width, canvas.width - safeX);
    const safeHeight = Math.min(height, canvas.height - safeY);

    if (safeWidth > 20 && safeHeight > 20) {
      // Create a new canvas for this image region
      const regionCanvas = document.createElement('canvas');
      regionCanvas.width = safeWidth;
      regionCanvas.height = safeHeight;
      const regionCtx = regionCanvas.getContext('2d');

      if (regionCtx) {
        regionCtx.drawImage(
          canvas,
          safeX, safeY, safeWidth, safeHeight,
          0, 0, safeWidth, safeHeight
        );

        const dataUrl = regionCanvas.toDataURL('image/png');
        results.set(i, dataUrl);
        console.log(`Extracted image ${i}, dataUrl length:`, dataUrl.length);
      }
    } else {
      console.log(`Image ${i} too small:`, safeWidth, 'x', safeHeight);
    }
  }

  return results;
}

/**
 * Sanitize text for use in markdown image alt text or caption
 * Escapes characters that could break markdown syntax
 */
function sanitizeForMarkdown(text: string): string {
  return text
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\n/g, ' ')
    .trim()
    .slice(0, 200); // Limit length
}

/**
 * Validate that a dataUrl is a proper base64 image
 */
function isValidDataUrl(dataUrl: string): boolean {
  if (!dataUrl || typeof dataUrl !== 'string') return false;
  if (!dataUrl.startsWith('data:image/')) return false;
  if (dataUrl.length < 100) return false; // Too short to be a real image
  return true;
}

/**
 * Generate a unique image ID
 */
function generateImageId(): string {
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Result from hybrid analysis - markdown with placeholders and separate images
 */
export interface HybridAnalysisResult {
  markdown: string;
  images: ExtractedImage[];
}

/**
 * Hybrid analysis - uses MuPDF text content with Vision AI for layout verification and images
 * Returns markdown with image placeholders and images stored separately
 */
export async function hybridAnalysis(
  mupdfText: string,
  _imageBase64: string,
  _apiKey: string,
  extractedImages?: Map<number, string>,
  structure?: { headlines: Array<{ text: string; level: number; order: number }>; images: ImageRegion[] },
  pageNumber: number = 1
): Promise<HybridAnalysisResult> {
  const resultImages: ExtractedImage[] = [];

  // If no structure provided or no images, just return MuPDF text
  if (!structure || structure.images.length === 0) {
    return { markdown: mupdfText, images: [] };
  }

  console.log('hybridAnalysis: structure has', structure.images.length, 'images');
  console.log('hybridAnalysis: extractedImages has', extractedImages?.size || 0, 'entries');

  // Build a list of valid images with IDs
  const validImages: Array<{ id: string; description: string; dataUrl: string }> = [];

  if (extractedImages && extractedImages.size > 0) {
    for (let j = 0; j < structure.images.length; j++) {
      const img = structure.images[j];
      const imgDataUrl = extractedImages.get(j);

      if (imgDataUrl && isValidDataUrl(imgDataUrl)) {
        const id = generateImageId();
        const safeDesc = sanitizeForMarkdown(img.description || `Image ${j + 1}`);
        validImages.push({ id, description: safeDesc, dataUrl: imgDataUrl });

        // Add to result images for separate storage
        resultImages.push({
          id,
          dataUrl: imgDataUrl,
          description: img.description || `Image ${j + 1}`,
          pageNumber
        });

        console.log(`hybridAnalysis: valid image ${j}: "${safeDesc.slice(0, 50)}..." id=${id}`);
      } else {
        console.log(`hybridAnalysis: skipping image ${j} - invalid dataUrl`);
      }
    }
  }

  console.log('hybridAnalysis: found', validImages.length, 'valid images to insert');

  // If we have valid images, insert placeholders after the first heading
  if (validImages.length > 0) {
    const paragraphs = mupdfText.split(/\n\n+/);
    const result: string[] = [];
    let imagesInserted = false;

    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;

      result.push(trimmed);

      // Insert image placeholders after first heading
      if (!imagesInserted && trimmed.match(/^#{1,3}\s/)) {
        for (const img of validImages) {
          // Use hash format which ReactMarkdown won't strip
          result.push(`![${img.description}](#${img.id})`);
          result.push(`*${img.description}*`);
        }
        imagesInserted = true;
      }
    }

    // If no heading found, add images at end
    if (!imagesInserted) {
      for (const img of validImages) {
        result.push(`![${img.description}](#${img.id})`);
        result.push(`*${img.description}*`);
      }
    }

    return { markdown: result.join('\n\n'), images: resultImages };
  }

  // No valid extracted images - just add descriptions as placeholders
  const paragraphs = mupdfText.split(/\n\n+/);
  const result: string[] = [];
  let descriptionsAdded = false;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    result.push(trimmed);

    if (!descriptionsAdded && trimmed.match(/^#{1,3}\s/)) {
      for (const img of structure.images) {
        const safeDesc = sanitizeForMarkdown(img.description || 'Image');
        result.push(`*[Image: ${safeDesc}]*`);
      }
      descriptionsAdded = true;
    }
  }

  return { markdown: result.join('\n\n'), images: [] };
}
