import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { parse } from 'marked';
import DOMPurify from 'dompurify';
import './style.css';

// DOM Element Selection
const markdownArea = document.getElementById('markdown-area') as HTMLTextAreaElement;
const previewContent = document.getElementById('preview-content') as HTMLDivElement;
const tabMarkdown = document.getElementById('tab-markdown') as HTMLButtonElement;
const tabPreview = document.getElementById('tab-preview') as HTMLButtonElement;
const markdownView = document.getElementById('markdown-view') as HTMLDivElement;
const previewView = document.getElementById('preview-view') as HTMLDivElement;
const copyBtn = document.getElementById('copy-btn') as HTMLButtonElement;
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;

// Initialize Turndown with GFM (GitHub Flavored Markdown) for Table/Code support
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*'
});
turndownService.use(gfm);

// Utility: Debounce for Performance
function debounce(func: Function, wait: number) {
  let timeout: ReturnType<typeof setTimeout>;
  return function(this: any, ...args: any[]) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Logic: Safely Render Markdown to HTML
const updatePreview = debounce(async () => {
  try {
    const rawHtml = await parse(markdownArea.value);
    const cleanHtml = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
    previewContent.innerHTML = cleanHtml;
  } catch (error) {
    console.error('Rendering failed:', error);
    previewContent.innerHTML = "<p style='color: red;'>Error rendering preview.</p>";
  }
}, 300);

// Logic: Tab Switching
function switchTab(tab: 'markdown' | 'preview') {
  if (tab === 'markdown') {
    tabMarkdown.classList.add('active');
    tabPreview.classList.remove('active');
    markdownView.classList.add('active');
    previewView.classList.remove('active');
  } else {
    tabPreview.classList.add('active');
    tabMarkdown.classList.remove('active');
    previewView.classList.add('active');
    markdownView.classList.remove('active');
    updatePreview();
  }
}

tabMarkdown.addEventListener('click', () => switchTab('markdown'));
tabPreview.addEventListener('click', () => switchTab('preview'));

// Logic: Handle Typing and Pasting
markdownArea.addEventListener('input', updatePreview);

markdownArea.addEventListener('paste', (e: ClipboardEvent) => {
  e.preventDefault();
  const clipboard = e.clipboardData;
  if (!clipboard) return;

  try {
    const html = clipboard.getData('text/html');
    const plain = clipboard.getData('text/plain');

    // Convert to markdown if HTML exists, otherwise use raw plain text
    const newText = html ? turndownService.turndown(html) : plain;

    const start = markdownArea.selectionStart;
    const end = markdownArea.selectionEnd;
    const currentText = markdownArea.value;

    // Inject text at the cursor location
    markdownArea.value = currentText.substring(0, start) + newText + currentText.substring(end);
    
    // Reposition cursor
    markdownArea.selectionStart = markdownArea.selectionEnd = start + newText.length;
    
    updatePreview();
  } catch (error) {
    console.error("Paste extraction failed:", error);
    alert("Could not process pasted content. Try pasting as plain text.");
  }
});

// Logic: Action Buttons
copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(markdownArea.value);
    const originalText = copyBtn.innerText;
    copyBtn.innerText = 'Copied!';
    setTimeout(() => { copyBtn.innerText = originalText; }, 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
    alert('Failed to copy automatically. Please select all text and copy manually.');
  }
});

clearBtn.addEventListener('click', () => {
  markdownArea.value = '';
  updatePreview();
});
