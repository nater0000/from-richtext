import TurndownService from 'turndown';
// @ts-ignore - plugin lacks type definitions
import { gfm } from 'turndown-plugin-gfm';
import { parse } from 'marked';
import DOMPurify from 'dompurify';
import './style.css';

// --- STATE ---
type EditorTab = 'markdown' | 'original';
let activeEditorTab: EditorTab = 'markdown';
let isSharedScroll = false;
let isSyncingEditor = false;
let isSyncingPreview = false;
let historyEnabled = localStorage.getItem('rt-history-enabled') !== 'false';

// --- DOM ELEMENTS ---
const appContainer = document.querySelector('.app-container') as HTMLDivElement;
const editorPane = document.querySelector('.editor-pane') as HTMLDivElement;
const previewPane = document.querySelector('.preview-pane') as HTMLDivElement;

const markdownArea = document.getElementById('markdown-area') as HTMLTextAreaElement;
const originalArea = document.getElementById('original-area') as HTMLTextAreaElement;
const previewContent = document.getElementById('preview-content') as HTMLDivElement;

const tabMd = document.getElementById('tab-markdown') as HTMLButtonElement;
const tabOrig = document.getElementById('tab-original') as HTMLButtonElement;

const btnSyncScroll = document.getElementById('sync-scroll-btn') as HTMLButtonElement;
const btnMaxEditor = document.getElementById('max-editor-btn') as HTMLButtonElement;
const btnMaxPreview = document.getElementById('max-preview-btn') as HTMLButtonElement;
const btnCopyEditor = document.getElementById('copy-editor-btn') as HTMLButtonElement;
const btnSaveEditor = document.getElementById('save-editor-btn') as HTMLButtonElement;
const btnCopyPreview = document.getElementById('copy-preview-btn') as HTMLButtonElement;
const btnClear = document.getElementById('clear-btn') as HTMLButtonElement;

const historyModal = document.getElementById('history-modal') as HTMLDivElement;
const btnHistory = document.getElementById('history-btn') as HTMLButtonElement;
const btnCloseHistory = document.getElementById('close-history-btn') as HTMLButtonElement;
const btnClearHistory = document.getElementById('clear-history-btn') as HTMLButtonElement;
const cbEnableHistory = document.getElementById('enable-history-cb') as HTMLInputElement;
const historyList = document.getElementById('history-list') as HTMLDivElement;

// --- TURNDOWN CONFIG & CUSTOM AI RULE ---
const turndownService = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', emDelimiter: '*' });
turndownService.use(gfm);

// Capture AI code languages (e.g. <code class="language-python">)
turndownService.addRule('codeBlocks', {
  filter: (node) => node.nodeName === 'PRE' && node.firstChild?.nodeName === 'CODE',
  replacement: (_content, node) => {
    const codeElement = node.firstChild as HTMLElement;
    const language = (codeElement.className.match(/language-(\S+)/) || [null, ''])[1]; 
    return `\n\n\`\`\`${language}\n${codeElement.textContent || ''}\n\`\`\`\n\n`;
  }
});

// --- CORE LOGIC ---
function debounce(func: Function, wait: number) {
  let timeout: ReturnType<typeof setTimeout>;
  return function(this: any, ...args: any[]) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

const updatePreview = debounce(async () => {
  try {
    const rawHtml = await parse(markdownArea.value);
    previewContent.innerHTML = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
  } catch (error) {
    console.error('Rendering failed:', error);
  }
}, 300);

// --- TAB & PANE LOGIC ---
function switchEditorTab(tab: EditorTab) {
  activeEditorTab = tab;
  if (tab === 'markdown') {
    tabMd.classList.add('active'); tabOrig.classList.remove('active');
    markdownArea.classList.remove('hidden'); originalArea.classList.add('hidden');
  } else {
    tabOrig.classList.add('active'); tabMd.classList.remove('active');
    originalArea.classList.remove('hidden'); markdownArea.classList.add('hidden');
  }
}

tabMd.addEventListener('click', () => switchEditorTab('markdown'));
tabOrig.addEventListener('click', () => switchEditorTab('original'));

function toggleMaximize(paneToMax: HTMLDivElement, btn: HTMLButtonElement) {
  if (paneToMax.classList.contains('maximized')) {
    paneToMax.classList.remove('maximized');
    appContainer.classList.remove('has-maximized');
    btn.innerText = '⤢';
  } else {
    paneToMax.classList.add('maximized');
    appContainer.classList.add('has-maximized');
    btn.innerText = '⤣';
  }
}

btnMaxEditor.addEventListener('click', () => toggleMaximize(editorPane, btnMaxEditor));
btnMaxPreview.addEventListener('click', () => toggleMaximize(previewPane, btnMaxPreview));

// --- SCROLL SYNC LOGIC ---
function getActiveEditor() { return activeEditorTab === 'markdown' ? markdownArea : originalArea; }

function syncScroll(source: HTMLElement, target: HTMLElement) {
  const sourceHeight = source.scrollHeight - source.clientHeight;
  const targetHeight = target.scrollHeight - target.clientHeight;
  if (sourceHeight <= 0) return;
  target.scrollTop = (source.scrollTop / sourceHeight) * targetHeight;
}

btnSyncScroll.addEventListener('click', () => {
  isSharedScroll = !isSharedScroll;
  btnSyncScroll.classList.toggle('active', isSharedScroll);
  btnSyncScroll.style.opacity = isSharedScroll ? '1' : '0.4';
  if (isSharedScroll) syncScroll(getActiveEditor(), previewContent);
});

[markdownArea, originalArea].forEach(area => {
  area.addEventListener('scroll', (e) => {
    if (!isSharedScroll || isSyncingEditor) return;
    isSyncingPreview = true;
    syncScroll(e.target as HTMLElement, previewContent);
    requestAnimationFrame(() => { isSyncingPreview = false; });
  });
});

previewContent.addEventListener('scroll', () => {
  if (!isSharedScroll || isSyncingPreview) return;
  isSyncingEditor = true;
  syncScroll(previewContent, getActiveEditor());
  requestAnimationFrame(() => { isSyncingEditor = false; });
});

// --- HISTORY LOGIC ---
interface HistoryItem { hash: string; html: string; plain: string; timestamp: number; }

cbEnableHistory.checked = historyEnabled;
cbEnableHistory.addEventListener('change', (e) => {
  historyEnabled = (e.target as HTMLInputElement).checked;
  localStorage.setItem('rt-history-enabled', historyEnabled.toString());
});

async function generateHash(text: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function saveToHistory(html: string, plain: string) {
  if (!historyEnabled) return;
  const contentToHash = html || plain;
  if (!contentToHash.trim()) return;

  const sizeInBytes = new Blob([html, plain]).size;
  if (sizeInBytes === 0 || sizeInBytes > 1024 * 1024) return; // Block 0b and >1MB

  const hash = await generateHash(contentToHash);
  let history: HistoryItem[] = JSON.parse(localStorage.getItem('rt-history') || '[]');

  const existingIndex = history.findIndex(item => item.hash === hash);
  if (existingIndex > -1) history[existingIndex].timestamp = Date.now();
  else history.push({ hash, html, plain, timestamp: Date.now() });

  history.sort((a, b) => b.timestamp - a.timestamp);

  // Evict items until aggregate size is under ~4MB
  const MAX_BYTES = 4 * 1024 * 1024;
  while (new Blob([JSON.stringify(history)]).size > MAX_BYTES && history.length > 0) history.pop();
  
  try { localStorage.setItem('rt-history', JSON.stringify(history)); } 
  catch (e) { console.error("Quota exceeded.", e); }
}

function renderHistory() {
  const history: HistoryItem[] = JSON.parse(localStorage.getItem('rt-history') || '[]');
  if (history.length === 0) {
    historyList.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">No history found.</div>';
    return;
  }
  historyList.innerHTML = history.map(item => `
    <div class="history-item" data-hash="${item.hash}">
      <div class="time">${new Date(item.timestamp).toLocaleString()}</div>
      <div class="snippet">${item.plain.substring(0, 100).replace(/\n/g, ' ')}...</div>
    </div>
  `).join('');

  document.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', () => {
      const selected = history.find(i => i.hash === el.getAttribute('data-hash'));
      if (selected) {
        originalArea.value = selected.html || selected.plain;
        markdownArea.value = selected.html ? turndownService.turndown(selected.html) : selected.plain;
        updatePreview();
        historyModal.classList.add('hidden');
      }
    });
  });
}

btnHistory.addEventListener('click', () => { renderHistory(); historyModal.classList.remove('hidden'); });
btnCloseHistory.addEventListener('click', () => historyModal.classList.add('hidden'));
btnClearHistory.addEventListener('click', () => {
  if (confirm('Delete all saved history?')) { localStorage.removeItem('rt-history'); renderHistory(); }
});

// --- PASTE HANDLER ---
markdownArea.addEventListener('input', updatePreview);
markdownArea.addEventListener('paste', (e: ClipboardEvent) => {
  e.preventDefault();
  const clipboard = e.clipboardData;
  if (!clipboard) return;

  const html = clipboard.getData('text/html');
  const plain = clipboard.getData('text/plain');

  saveToHistory(html, plain); // Background save
  originalArea.value = html || "No HTML payload found. Plain text:\n\n" + plain;

  const newText = html ? turndownService.turndown(html) : plain;
  const start = markdownArea.selectionStart;
  const end = markdownArea.selectionEnd;
  const currentText = markdownArea.value;

  markdownArea.value = currentText.substring(0, start) + newText + currentText.substring(end);
  markdownArea.selectionStart = markdownArea.selectionEnd = start + newText.length;
  updatePreview();
});

// --- BUTTON ACTIONS ---
async function copyToClipboard(text: string, btn: HTMLButtonElement) {
  try {
    await navigator.clipboard.writeText(text);
    const og = btn.innerText;
    btn.innerText = 'Copied!';
    setTimeout(() => { btn.innerText = og; }, 2000);
  } catch (err) { alert('Failed to copy.'); }
}

btnCopyEditor.addEventListener('click', () => copyToClipboard(getActiveEditor().value, btnCopyEditor));
btnCopyPreview.addEventListener('click', () => copyToClipboard(previewContent.innerText, btnCopyPreview));

btnSaveEditor.addEventListener('click', () => {
  const content = getActiveEditor().value;
  if (!content.trim()) return;
  const isMd = activeEditorTab === 'markdown';
  const blob = new Blob([content], { type: isMd ? 'text/markdown' : 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = isMd ? 'document.md' : 'original.html';
  a.click(); URL.revokeObjectURL(url);
});

btnClear.addEventListener('click', () => {
  if (confirm('Clear editor?')) { markdownArea.value = originalArea.value = ''; updatePreview(); }
});
