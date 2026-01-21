# PDF to Markdown

A premium, skeuomorphic desktop application for converting PDF documents into clean, structured Markdown. Built with **Tauri**, **React**, and **TypeScript**.

![App Screenshot](src/assets/image.png)

## ✨ Features

- **High-Fidelity Conversion**: Extract text and layout from PDFs with precision.
- **Skeuomorphic Design**: A tactile, premium user interface with liquid glass aesthetics and organic textures.
- **OCR Support**: Built-in Optical Character Recognition (via Tesseract.js) for scanned documents.
- **Batch Processing**: Drag and drop multiple files to process them in one go.
- **Project Management**: Organize your documents into projects for better workflow.
- **Real-time Preview**: View the generated Markdown side-by-side with your original document.
- **Preserve Layout**: Option to maintain the original document's structure during conversion.

## 🚀 Getting Started

### Prerequisites

- **Node.js**: Latest LTS version
- **Rust**: Latest stable version (required for Tauri)
- **System Dependencies**: See [Tauri Prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites)

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd pdf2mkdwn
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run in development mode:
   ```bash
   npm run tauri:dev
   ```

## 🛠️ Tech Stack

- **Frontend**: React 19, Vite, TypeScript
- **Backend/Desktop**: Tauri (Rust)
- **PDF Processing**: MuPDF, PDF.js
- **OCR**: Tesseract.js
- **Icons**: Lucide React
- **Styling**: Vanilla CSS (Skeuomorphic & Liquid Glass design)

## 📦 Building

To create a production build for your OS:

```bash
npm run tauri:build
```

## 📄 License

MIT © mvxbn6usr1
