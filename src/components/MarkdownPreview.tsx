import { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Eye, Code, Copy, Download, Check } from 'lucide-react';
import logo from '../assets/logo.png';
import type { PDFFile, ExtractedImage } from '../types';
import { downloadMarkdown, copyToClipboard } from '../utils/exportUtils';

interface MarkdownPreviewProps {
  file: PDFFile | null;
}

export function MarkdownPreview({ file }: MarkdownPreviewProps) {
  const [viewMode, setViewMode] = useState<'preview' | 'source'>('preview');
  const [copied, setCopied] = useState(false);

  // Build a map of image IDs to their data URLs for quick lookup
  // Must be called before any early returns to satisfy Rules of Hooks
  const imageMap = useMemo(() => {
    const map = new Map<string, ExtractedImage>();
    if (file?.extractedImages) {
      for (const img of file.extractedImages) {
        map.set(img.id, img);
      }
    }
    return map;
  }, [file?.extractedImages]);

  if (!file) {
    return (
      <div className="markdown-preview empty">
        <div className="empty-state">
          <img src={logo} alt="Logo" className="empty-state-logo" />
          <h3>No file selected</h3>
          <p>Select a processed file to preview the markdown output</p>
        </div>
      </div>
    );
  }

  if (file.status === 'pending') {
    return (
      <div className="markdown-preview empty">
        <div className="empty-state">
          <Code size={48} strokeWidth={1.5} />
          <h3>File not processed</h3>
          <p>Click the play button to convert this PDF to markdown</p>
        </div>
      </div>
    );
  }

  if (file.status === 'processing') {
    return (
      <div className="markdown-preview empty">
        <div className="empty-state processing">
          <div className="spinner" />
          <h3>Processing...</h3>
          <p>
            Page {file.currentPage} of {file.pageCount}
          </p>
          <div className="progress-bar large">
            <div className="progress-fill" style={{ width: `${file.progress}%` }} />
          </div>
        </div>
      </div>
    );
  }

  if (file.status === 'error') {
    return (
      <div className="markdown-preview empty error">
        <div className="empty-state">
          <h3>Error processing file</h3>
          <p>{file.error}</p>
        </div>
      </div>
    );
  }

  const handleCopy = async () => {
    await copyToClipboard(file.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    downloadMarkdown(file.markdown, file.name);
  };

  return (
    <div className="markdown-preview">
      <div className="preview-header">
        <div className="view-toggle">
          <button
            className={viewMode === 'preview' ? 'active' : ''}
            onClick={() => setViewMode('preview')}
          >
            <Eye size={16} />
            Preview
          </button>
          <button
            className={viewMode === 'source' ? 'active' : ''}
            onClick={() => setViewMode('source')}
          >
            <Code size={16} />
            Source
          </button>
        </div>
        <div className="preview-actions">
          <button onClick={handleCopy} title="Copy to clipboard">
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button onClick={handleDownload} title="Download markdown">
            <Download size={16} />
            Download
          </button>
        </div>
      </div>
      <div className="preview-content">
        {viewMode === 'preview' ? (
          <div className="markdown-rendered">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  const isInline = !match;
                  return !isInline ? (
                    <SyntaxHighlighter
                      style={oneDark}
                      language={match[1]}
                      PreTag="div"
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  ) : (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                },
                img({ src, alt, ...props }) {
                  // Check if this is an extracted image placeholder (format: #img_xxx)
                  if (src && src.startsWith('#img_')) {
                    const imageId = src.slice(1); // Remove the # prefix
                    const extractedImage = imageMap.get(imageId);
                    console.log('Looking up image:', { imageId, found: !!extractedImage, dataUrlLength: extractedImage?.dataUrl?.length });

                    if (extractedImage && extractedImage.dataUrl) {
                      return (
                        <img
                          src={extractedImage.dataUrl}
                          alt={alt || extractedImage.description}
                          style={{ maxWidth: '100%', height: 'auto', margin: '1em 0', display: 'block' }}
                        />
                      );
                    }
                    // Image not found - show placeholder
                    return (
                      <span style={{ display: 'block', padding: '1em', background: '#f0f0f0', borderRadius: '4px', margin: '1em 0' }}>
                        [Image: {alt || 'Image not available'}]
                      </span>
                    );
                  }
                  // Regular image URL - don't render if src is empty
                  if (!src) {
                    return null;
                  }
                  return <img src={src} alt={alt} {...props} />;
                },
              }}
            >
              {file.markdown}
            </ReactMarkdown>
          </div>
        ) : (
          <pre className="markdown-source">
            <code>{file.markdown}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
