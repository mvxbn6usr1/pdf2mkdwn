import { useCallback, useRef, useEffect, useState } from 'react';
import { Upload, FolderOpen } from 'lucide-react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { readFile } from '@tauri-apps/plugin-fs';

interface FileUploadProps {
  onFilesSelected: (files: FileList | File[]) => void;
  disabled?: boolean;
}

export function FileUpload({ onFilesSelected, disabled }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Use Tauri's native drag-drop event listener
  useEffect(() => {
    const webview = getCurrentWebview();

    const unlisten = webview.onDragDropEvent(async (event) => {
      if (disabled) return;

      if (event.payload.type === 'over') {
        // Check if drag is over the upload area
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const { x, y } = event.payload.position;
          const isOverUpload = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
          setIsDragOver(isOverUpload);
        }
      } else if (event.payload.type === 'drop') {
        setIsDragOver(false);
        // Check if drop is over the upload area
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const { x, y } = event.payload.position;
          const isOverUpload = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
          if (isOverUpload && event.payload.paths.length > 0) {
            // Filter for PDF files and convert paths to File objects
            const pdfPaths = event.payload.paths.filter((p: string) => p.toLowerCase().endsWith('.pdf'));
            if (pdfPaths.length > 0) {
              // Read files from paths using Tauri's fs plugin
              const files: File[] = [];
              for (const path of pdfPaths) {
                try {
                  const contents = await readFile(path);
                  const fileName = path.split('/').pop() || 'file.pdf';
                  const file = new File([contents], fileName, { type: 'application/pdf' });
                  files.push(file);
                } catch (err) {
                  console.error('Failed to read dropped file:', path, err);
                }
              }
              if (files.length > 0) {
                onFilesSelected(files);
              }
            }
          }
        }
      } else if (event.payload.type === 'leave') {
        setIsDragOver(false);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [onFilesSelected, disabled]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleClick = useCallback(() => {
    if (!disabled) {
      inputRef.current?.click();
    }
  }, [disabled]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        onFilesSelected(files);
        e.target.value = '';
      }
    },
    [onFilesSelected]
  );

  return (
    <div
      ref={containerRef}
      className={`file-upload ${disabled ? 'disabled' : ''} ${isDragOver ? 'drag-over' : ''}`}
      onDragOver={handleDragOver}
      onClick={handleClick}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        multiple
        onChange={handleChange}
        style={{ display: 'none' }}
      />
      <div className="upload-content">
        <div className="upload-icons">
          <Upload size={48} strokeWidth={1.5} />
          <FolderOpen size={32} strokeWidth={1.5} />
        </div>
        <h3>Drop PDF files here</h3>
        <p>or click to browse</p>
        <span className="upload-hint">Supports batch processing of multiple PDFs</span>
      </div>
    </div>
  );
}
