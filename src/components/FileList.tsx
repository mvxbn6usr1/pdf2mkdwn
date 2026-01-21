import { FileText, Trash2, Zap, CheckCircle, AlertCircle, Loader, FileType, RefreshCw } from 'lucide-react';
import type { PDFFile } from '../types';

interface FileListProps {
  files: PDFFile[];
  selectedFileId: string | null;
  onSelectFile: (id: string) => void;
  onRemoveFile: (id: string) => void;
  onProcessFile: (id: string) => void;
  isProcessing: boolean;
}

export function FileList({
  files,
  selectedFileId,
  onSelectFile,
  onRemoveFile,
  onProcessFile,
  isProcessing,
}: FileListProps) {
  if (files.length === 0) {
    return (
      <div className="file-list-empty">
        <FileType size={32} strokeWidth={1.5} />
        <p>No files yet</p>
        <span>Upload PDFs to get started</span>
      </div>
    );
  }

  const getStatusBadge = (file: PDFFile) => {
    switch (file.status) {
      case 'pending':
        return <span className="status-badge pending">Pending</span>;
      case 'processing':
        return <span className="status-badge processing"><Loader size={12} className="spin" /> Converting</span>;
      case 'completed':
        return <span className="status-badge completed"><CheckCircle size={12} /> Done</span>;
      case 'error':
        return <span className="status-badge error"><AlertCircle size={12} /> Error</span>;
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="file-list">
      <ul>
        {files.map((file) => (
          <li
            key={file.id}
            className={`file-item ${selectedFileId === file.id ? 'selected' : ''} ${file.status}`}
            onClick={() => onSelectFile(file.id)}
          >
            <div className="file-icon">
              <FileText size={20} />
            </div>

            <div className="file-details">
              <span className="file-name" title={file.name}>
                {file.name}
              </span>
              <span className="file-meta">
                {formatFileSize(file.size)}
                {file.pageCount ? ` · ${file.pageCount} page${file.pageCount > 1 ? 's' : ''}` : ''}
              </span>
              {getStatusBadge(file)}
            </div>

            {file.status === 'processing' && (
              <div className="file-progress">
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${file.progress}%` }}
                  />
                </div>
                <span className="progress-text">
                  Page {file.currentPage} of {file.pageCount}
                </span>
              </div>
            )}

            <div className="file-actions">
              {file.status === 'pending' && (
                <button
                  className="file-action-btn convert"
                  onClick={(e) => {
                    e.stopPropagation();
                    onProcessFile(file.id);
                  }}
                  disabled={isProcessing}
                >
                  <Zap size={14} />
                  Convert
                </button>
              )}
              {(file.status === 'completed' || file.status === 'error') && (
                <button
                  className="file-action-btn retry"
                  onClick={(e) => {
                    e.stopPropagation();
                    onProcessFile(file.id);
                  }}
                  disabled={isProcessing}
                >
                  <RefreshCw size={14} />
                  Retry
                </button>
              )}
              <button
                className="file-action-btn delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveFile(file.id);
                }}
                disabled={file.status === 'processing'}
              >
                <Trash2 size={14} />
                Remove
              </button>
            </div>

            {file.error && <div className="file-error">{file.error}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
