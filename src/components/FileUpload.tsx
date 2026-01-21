import { useCallback, useRef } from 'react';
import { Upload, FolderOpen } from 'lucide-react';

interface FileUploadProps {
  onFilesSelected: (files: FileList | File[]) => void;
  disabled?: boolean;
}

export function FileUpload({ onFilesSelected, disabled }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (disabled) return;

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        onFilesSelected(files);
      }
    },
    [onFilesSelected, disabled]
  );

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
      className={`file-upload ${disabled ? 'disabled' : ''}`}
      onDrop={handleDrop}
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
