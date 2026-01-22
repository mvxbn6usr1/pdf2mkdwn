import { useState, useCallback, useEffect, useRef } from 'react';
import type { PDFFile, ProcessingOptions, StoredFile } from '../types';
import { processPDF, getPDFPageCount, terminateOCRWorker } from '../utils/pdfProcessor';
import {
  getFilesByProject,
  updateFile as dbUpdateFile,
  deleteFile as dbDeleteFile,
  saveAPIKey,
  loadAPIKey,
} from '../services/db';

const defaultOptions: ProcessingOptions = {
  language: 'eng',
  preserveLayout: true,
  extractImages: false,
  ocrEnabled: false,
  useVisionAI: false,
  visionAPIKey: '',
  visionMode: 'hybrid',
  // Advanced text processing - enabled by default for best results
  detectTables: true,
  detectMath: true,
  removeHeadersFooters: true,
  fixHyphenation: true,
};

interface UsePDFProcessorOptions {
  projectId: string;
  onFilesChanged?: () => void;
}

export function usePDFProcessor({ projectId, onFilesChanged }: UsePDFProcessorOptions) {
  const [files, setFiles] = useState<PDFFile[]>([]);
  const [options, setOptionsState] = useState<ProcessingOptions>(defaultOptions);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const currentProjectIdRef = useRef(projectId);
  const apiKeySaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedApiKeyRef = useRef<string>('');

  // Load API key from IndexedDB on mount
  useEffect(() => {
    async function loadStoredApiKey() {
      try {
        const storedKey = await loadAPIKey();
        if (storedKey) {
          lastSavedApiKeyRef.current = storedKey;
          setOptionsState((prev) => ({ ...prev, visionAPIKey: storedKey }));
        }
      } catch (error) {
        console.error('Failed to load API key:', error);
      }
    }
    loadStoredApiKey();
  }, []);

  // Custom setOptions that also persists API key changes
  const setOptions = useCallback((newOptions: ProcessingOptions) => {
    setOptionsState(newOptions);

    // Check if API key changed
    if (newOptions.visionAPIKey !== lastSavedApiKeyRef.current) {
      // Clear existing timeout
      if (apiKeySaveTimeoutRef.current) {
        clearTimeout(apiKeySaveTimeoutRef.current);
      }

      // Debounce save by 500ms
      apiKeySaveTimeoutRef.current = setTimeout(async () => {
        try {
          await saveAPIKey(newOptions.visionAPIKey);
          lastSavedApiKeyRef.current = newOptions.visionAPIKey;
        } catch (error) {
          console.error('Failed to save API key:', error);
        }
      }, 500);
    }
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (apiKeySaveTimeoutRef.current) {
        clearTimeout(apiKeySaveTimeoutRef.current);
      }
    };
  }, []);

  // Load files from IndexedDB when project changes
  useEffect(() => {
    currentProjectIdRef.current = projectId;

    async function loadFiles() {
      setIsLoading(true);
      try {
        const storedFiles = await getFilesByProject(projectId);
        // Convert StoredFile to PDFFile (without the actual File object)
        const pdfFiles: PDFFile[] = storedFiles
          .map((sf) => ({
            id: sf.id,
            file: null, // No file object for persisted files
            name: sf.name,
            size: sf.size,
            status: (sf.status === 'pending' ? 'pending' : sf.status === 'completed' ? 'completed' : 'error') as PDFFile['status'],
            progress: sf.status === 'completed' ? 100 : 0,
            markdown: sf.markdown,
            extractedImages: sf.extractedImages,
            error: sf.error,
            pageCount: sf.pageCount,
            currentPage: sf.status === 'completed' ? sf.pageCount : 0,
            createdAt: sf.createdAt,
          }))
          .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
        setFiles(pdfFiles);
      } catch (error) {
        console.error('Failed to load files:', error);
        setFiles([]);
      } finally {
        setIsLoading(false);
      }
    }

    loadFiles();
  }, [projectId]);

  const addFiles = useCallback(async (newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    const pdfFiles: PDFFile[] = await Promise.all(
      fileArray
        .filter((f) => f.type === 'application/pdf')
        .map(async (file) => {
          const pageCount = await getPDFPageCount(file).catch(() => 0);
          return {
            id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            file,
            name: file.name,
            size: file.size,
            status: 'pending' as const,
            progress: 0,
            markdown: '',
            pageCount,
            currentPage: 0,
            createdAt: new Date(),
          };
        })
    );

    // Don't persist pending files to IndexedDB - only persist after successful processing
    // This avoids storing entries that were never actually converted

    setFiles((prev) => [...pdfFiles, ...prev]);
  }, []);

  const removeFile = useCallback(async (id: string) => {
    await dbDeleteFile(id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
    onFilesChanged?.();
  }, [onFilesChanged]);

  const clearFiles = useCallback(async () => {
    // Delete all files in current project from IndexedDB
    for (const file of files) {
      await dbDeleteFile(file.id);
    }
    setFiles([]);
    onFilesChanged?.();
  }, [files, onFilesChanged]);

  const updateFile = useCallback((id: string, updates: Partial<PDFFile>) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...updates } : f))
    );
  }, []);

  const processFile = useCallback(
    async (file: PDFFile) => {
      // Cannot process files without actual File object (persisted files)
      if (!file.file) {
        updateFile(file.id, {
          status: 'error',
          error: 'Cannot reprocess - original PDF not available. Please re-upload the file.',
        });
        return;
      }

      updateFile(file.id, { status: 'processing', progress: 0 });

      try {
        const result = await processPDF(file.file, options, (current, total) => {
          const progress = Math.round((current / total) * 100);
          updateFile(file.id, { progress, currentPage: current });
        });

        updateFile(file.id, {
          status: 'completed',
          progress: 100,
          markdown: result.markdown,
          extractedImages: result.extractedImages,
        });

        // Persist to IndexedDB
        const storedFile: StoredFile = {
          id: file.id,
          projectId: currentProjectIdRef.current,
          name: file.name,
          size: file.size,
          pageCount: file.pageCount || 0,
          status: 'completed',
          markdown: result.markdown,
          extractedImages: result.extractedImages || [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await dbUpdateFile(storedFile);
        onFilesChanged?.();
      } catch (error) {
        let errorMsg = error instanceof Error ? error.message : 'Unknown error';

        // Provide user-friendly error messages for specific errors
        if (errorMsg === 'PDF_PASSWORD_REQUIRED') {
          errorMsg = 'This PDF is password-protected. Please provide the password in processing options.';
        } else if (errorMsg === 'PDF_PASSWORD_INCORRECT') {
          errorMsg = 'Incorrect PDF password. Please check and try again.';
        }

        updateFile(file.id, {
          status: 'error',
          error: errorMsg,
        });
        // Don't persist error state - only successful conversions are saved
      }
    },
    [options, updateFile, onFilesChanged]
  );

  const processAllFiles = useCallback(async () => {
    setIsProcessing(true);
    const pendingFiles = files.filter((f) => f.status === 'pending');

    for (const file of pendingFiles) {
      await processFile(file);
    }

    setIsProcessing(false);
  }, [files, processFile]);

  const processSingleFile = useCallback(
    async (id: string) => {
      const file = files.find((f) => f.id === id);
      if (file) {
        setIsProcessing(true);
        await processFile(file);
        setIsProcessing(false);
      }
    },
    [files, processFile]
  );

  const cleanup = useCallback(async () => {
    await terminateOCRWorker();
  }, []);

  return {
    files,
    options,
    isProcessing,
    isLoading,
    addFiles,
    removeFile,
    clearFiles,
    setOptions,
    processAllFiles,
    processSingleFile,
    cleanup,
  };
}
