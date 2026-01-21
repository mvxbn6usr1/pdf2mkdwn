import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import type { PDFFile } from '../types';

export function downloadMarkdown(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  saveAs(blob, filename.replace(/\.pdf$/i, '.md'));
}

export async function downloadAllAsZip(files: PDFFile[]): Promise<void> {
  const zip = new JSZip();
  const completedFiles = files.filter((f) => f.status === 'completed');

  completedFiles.forEach((file) => {
    const filename = file.name.replace(/\.pdf$/i, '.md');
    zip.file(filename, file.markdown);
  });

  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, 'converted-markdown.zip');
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}
