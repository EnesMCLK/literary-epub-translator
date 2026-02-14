<div align="center">  
  <h1 align="center">📖 Literary EPUB Translator</h1>
  
![Version](https://img.shields.io/badge/version-1.0.0-blue.svg?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green.svg?style=flat-square)
![React](https://img.shields.io/badge/React-19-61DAFB.svg?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)
![Gemini AI](https://img.shields.io/badge/Google-Gemini_AI-8E75B2.svg?style=flat-square&logo=google&logoColor=white)

**A professional, client-side book translation engine powered by Google Gemini.**  
*Translates EPUBs while preserving literary style, author's voice, and formatting.*

[Features](#-key-features) •
[How It Works](#%EF%B8%8F-how-it-works) •
[Tech Stack](#%EF%B8%8F-tech-stack)
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="img/dark-dashboard.png">
    <source media="(prefers-color-scheme: light)" srcset="img/light-dashboard.png">
    <img alt="Kontrol Paneli (Dashboard) Ekran Görüntüsü" src="img/light-dashboard.png">
  </picture>
  
</div>

---

## 🚀 Overview

**Literary EPUB Translator** is a sophisticated Single Page Application (SPA) designed to bridge the gap between machine translation and literary art. Unlike standard translators that often produce robotic or literal output, this tool analyzes the book's genre, tone, and author's style before translation begins.

It runs entirely in your browser using **Google Gemini API**. No file is ever uploaded to a backend server, ensuring privacy and speed.

## ✨ Key Features

### 🧠 AI-Powered Analysis
*   **Style Detection:** Before translating, the AI analyzes the book to detect the genre (e.g., Satire, Noir), tone (e.g., Melancholic, Witty), and writing style.
*   **Adaptive Strategy:** Automatically adjusts the "Temperature" (creativity) of the model based on the complexity of the text.
*   **Context Awareness:** Preserves the author's voice across chapters.

### 🛡️ Privacy & Security
*   **Client-Side Processing:** All EPUB parsing (`JSZip`) and regeneration happen locally in your browser.
*   **Direct API Calls:** Your API key is used directly to communicate with Google's servers; no middleman.

### ⚡ Performance & UX
*   **Streaming Translation:** Watch the translation happen in real-time with a terminal-like System Monitor.
*   **Resumable Sessions:** translation interrupted? The app saves your progress locally. Pick up exactly where you left off.
*   **PWA Support:** Installable as a native app on iOS, Android, and Desktop.
*   **Smart Quota Management:** Handles API rate limits (429 errors) gracefully with auto-wait and retry logic.

### 🎨 Modern UI
*   **Glassmorphism Design:** Built with Tailwind CSS for a sleek, dark-mode compatible interface.
*   **Internationalization:** Fully localized UI (English, Turkish, French, German, Spanish, Japanese, and more).
*   **Stats Dashboard:** View estimated costs (tokens), duration, and word counts before you start.

## ⚙️ How It Works

1.  **Parsing:** The app unzips the `.epub` file and identifies HTML/XHTML content nodes.
2.  **Analysis:** It sends metadata (Title, Author) to Gemini to formulate a "Translation Strategy".
3.  **Chunking:** Text is broken down into semantic chunks to fit within AI context windows.
4.  **Translation:** Each chunk is translated using the strategy, preserving HTML tags (`<em>`, `<strong>`, etc.).
5.  **Reassembly:** The translated HTML is injected back into the EPUB structure.
6.  **Download:** A new, valid EPUB file is generated for download.

## 🛠️ Tech Stack

*   **Framework:** React 19 (Vite)
*   **Language:** TypeScript
*   **AI Integration:** `@google/genai` SDK
*   **Styling:** Tailwind CSS + Lucide React (Icons)
*   **File Handling:** `jszip`
*   **State Management:** React Hooks + LocalStorage
*   **PWA:** `vite-plugin-pwa`

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

<div align="center">
  <p>Made with ❤️ by <a href="https://github.com/EnesMCLK">EnesMCLK</a></p>
</div>
