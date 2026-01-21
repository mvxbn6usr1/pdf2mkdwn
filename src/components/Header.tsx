import { Download, Trash2, Play } from 'lucide-react';
import logo from '../assets/logo.png';
import type { PDFFile } from '../types';
import { downloadAllAsZip } from '../utils/exportUtils';

interface HeaderProps {
  files: PDFFile[];
  isProcessing: boolean;
  onProcessAll: () => void;
  onClearAll: () => void;
}

export function Header({
  files,
  isProcessing,
  onProcessAll,
  onClearAll,
}: HeaderProps) {
  const pendingCount = files.filter((f) => f.status === 'pending').length;
  const completedCount = files.filter((f) => f.status === 'completed').length;
  const completedFiles = files.filter((f) => f.status === 'completed');

  return (
    <header className="app-header">
      <div className="titlebar-drag-region" data-tauri-drag-region />
      <div className="logo">
        <img src={logo} alt="Logo" className="app-logo-img" />
        <h1>PDF to Markdown</h1>
      </div>
      <div className="header-actions">
        {pendingCount > 0 && (
          <button
            className="btn primary"
            onClick={onProcessAll}
            disabled={isProcessing}
          >
            <Play size={18} />
            Process All ({pendingCount})
          </button>
        )}
        {completedCount > 0 && (
          <button
            className="btn secondary"
            onClick={() => downloadAllAsZip(completedFiles)}
          >
            <Download size={18} />
            Export All ({completedCount})
          </button>
        )}
        {files.length > 0 && (
          <button
            className="btn danger"
            onClick={onClearAll}
            disabled={isProcessing}
          >
            <Trash2 size={18} />
            Clear All
          </button>
        )}
      </div>
    </header>
  );
}
