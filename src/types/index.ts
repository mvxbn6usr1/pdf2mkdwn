export interface ExtractedImage {
  id: string;
  dataUrl: string;
  description: string;
  pageNumber: number;
}

export interface PDFFile {
  id: string;
  file: File | null;
  name: string;
  size: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  markdown: string;
  extractedImages?: ExtractedImage[];
  error?: string;
  pageCount?: number;
  currentPage?: number;
}

export interface ProcessingOptions {
  language: string;
  preserveLayout: boolean;
  extractImages: boolean;
  ocrEnabled: boolean;
  // Vision AI settings (Isaac 01)
  useVisionAI: boolean;
  visionAPIKey: string;
  visionMode: 'quick' | 'full' | 'hybrid'; // quick = single call, full = multi-call layout, hybrid = text + images fused
}

export interface VisionAnalysis {
  text: string;
  images: VisionImage[];
  readingOrder: VisionElement[];
}

export interface VisionImage {
  description: string;
  boundingBox: {
    topLeft: { x: number; y: number };
    bottomRight: { x: number; y: number };
  };
}

export interface VisionElement {
  type: 'headline' | 'subheadline' | 'paragraph' | 'image' | 'list' | 'citation';
  content: string;
  boundingBox?: {
    topLeft: { x: number; y: number };
    bottomRight: { x: number; y: number };
  };
}

export interface PageResult {
  pageNumber: number;
  text: string;
  hasImages: boolean;
  extractedImages?: ExtractedImage[];
}

// Project system types
export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredFile {
  id: string;
  projectId: string;
  name: string;
  size: number;
  pageCount: number;
  status: 'pending' | 'completed' | 'error';
  markdown: string;
  extractedImages: ExtractedImage[];
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}
