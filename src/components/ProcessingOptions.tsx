import { Settings, Eye, Key, Wand2, Lock } from 'lucide-react';
import type { ProcessingOptions as Options } from '../types';

interface ProcessingOptionsProps {
  options: Options;
  onChange: (options: Options) => void;
  disabled?: boolean;
}

const LANGUAGES = [
  { code: 'eng', name: 'English' },
  { code: 'spa', name: 'Spanish' },
  { code: 'fra', name: 'French' },
  { code: 'deu', name: 'German' },
  { code: 'ita', name: 'Italian' },
  { code: 'por', name: 'Portuguese' },
  { code: 'chi_sim', name: 'Chinese (Simplified)' },
  { code: 'chi_tra', name: 'Chinese (Traditional)' },
  { code: 'jpn', name: 'Japanese' },
  { code: 'kor', name: 'Korean' },
  { code: 'ara', name: 'Arabic' },
  { code: 'rus', name: 'Russian' },
];

export function ProcessingOptions({
  options,
  onChange,
  disabled,
}: ProcessingOptionsProps) {
  return (
    <div className={`processing-options ${disabled ? 'disabled' : ''}`}>
      <div className="options-header">
        <Settings size={18} />
        <h3>Processing Options</h3>
      </div>

      <div className="option-group">
        <label htmlFor="language">OCR Language</label>
        <select
          id="language"
          value={options.language}
          onChange={(e) => onChange({ ...options, language: e.target.value })}
          disabled={disabled}
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
      </div>

      <div className="option-group checkbox">
        <label>
          <input
            type="checkbox"
            checked={options.ocrEnabled}
            onChange={(e) => onChange({ ...options, ocrEnabled: e.target.checked })}
            disabled={disabled}
          />
          <span>Enable OCR</span>
          <small>Use optical character recognition for scanned documents</small>
        </label>
      </div>

      <div className="option-group checkbox">
        <label>
          <input
            type="checkbox"
            checked={options.preserveLayout}
            onChange={(e) =>
              onChange({ ...options, preserveLayout: e.target.checked })
            }
            disabled={disabled}
          />
          <span>Preserve Layout</span>
          <small>Keep original document formatting and line breaks</small>
        </label>
      </div>

      <div className="options-divider">
        <Wand2 size={14} />
        <span>Text Processing</span>
      </div>

      <div className="option-group checkbox">
        <label>
          <input
            type="checkbox"
            checked={options.detectTables}
            onChange={(e) =>
              onChange({ ...options, detectTables: e.target.checked })
            }
            disabled={disabled}
          />
          <span>Detect Tables</span>
          <small>Identify and format tabular data as markdown tables</small>
        </label>
      </div>

      <div className="option-group checkbox">
        <label>
          <input
            type="checkbox"
            checked={options.detectMath}
            onChange={(e) =>
              onChange({ ...options, detectMath: e.target.checked })
            }
            disabled={disabled}
          />
          <span>Detect Math</span>
          <small>Convert mathematical expressions to LaTeX notation</small>
        </label>
      </div>

      <div className="option-group checkbox">
        <label>
          <input
            type="checkbox"
            checked={options.removeHeadersFooters}
            onChange={(e) =>
              onChange({ ...options, removeHeadersFooters: e.target.checked })
            }
            disabled={disabled}
          />
          <span>Remove Headers/Footers</span>
          <small>Detect and remove repeating page headers and footers</small>
        </label>
      </div>

      <div className="option-group checkbox">
        <label>
          <input
            type="checkbox"
            checked={options.fixHyphenation}
            onChange={(e) =>
              onChange({ ...options, fixHyphenation: e.target.checked })
            }
            disabled={disabled}
          />
          <span>Fix Hyphenation</span>
          <small>Rejoin words split across line breaks</small>
        </label>
      </div>

      <div className="option-group">
        <label htmlFor="pdfPassword">
          <Lock size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
          PDF Password
        </label>
        <input
          type="password"
          id="pdfPassword"
          placeholder="Enter password for protected PDFs"
          value={options.pdfPassword || ''}
          onChange={(e) => onChange({ ...options, pdfPassword: e.target.value })}
          disabled={disabled}
          className="api-key-input"
        />
        <small>Only needed for password-protected PDFs</small>
      </div>

      <div className="options-divider">
        <Eye size={14} />
        <span>Vision AI (Isaac 01)</span>
      </div>

      <div className="option-group checkbox">
        <label>
          <input
            type="checkbox"
            checked={options.useVisionAI}
            onChange={(e) =>
              onChange({ ...options, useVisionAI: e.target.checked })
            }
            disabled={disabled || !options.visionAPIKey}
          />
          <span>Enable Vision AI</span>
          <small>Use AI to describe images and improve text extraction</small>
        </label>
      </div>

      {options.useVisionAI && (
        <div className="option-group">
          <label htmlFor="visionMode">Vision Mode</label>
          <select
            id="visionMode"
            value={options.visionMode}
            onChange={(e) => onChange({ ...options, visionMode: e.target.value as 'quick' | 'full' | 'hybrid' })}
            disabled={disabled || !options.useVisionAI}
          >
            <option value="hybrid">Hybrid (recommended)</option>
            <option value="quick">Quick (single API call)</option>
            <option value="full">Full (multi-call layout analysis)</option>
          </select>
          <small className="mode-note">
            Hybrid fuses full text with image detection for best results
          </small>
        </div>
      )}

      <div className="option-group">
        <label htmlFor="visionApiKey">
          <Key size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
          Replicate API Key
        </label>
        <input
          type="password"
          id="visionApiKey"
          placeholder="r8_..."
          value={options.visionAPIKey}
          onChange={(e) => onChange({ ...options, visionAPIKey: e.target.value })}
          disabled={disabled}
          className="api-key-input"
        />
        <small className="api-key-note">
          Get your key at <a href="https://replicate.com/account/api-tokens" target="_blank" rel="noopener noreferrer">replicate.com</a>
        </small>
      </div>
    </div>
  );
}
