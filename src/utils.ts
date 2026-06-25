import { NexusFile } from './types';

const STORAGE_KEY = 'nexus_doc_history';

export function getHistory(): NexusFile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('[NexusDoc] localStorage inaccessible (getHistory)', e);
    return [];
  }
}

export function saveToHistory(file: NexusFile) {
  try {
    const history = getHistory();
    const updated = [file, ...history.filter(f => f.id !== file.id)].slice(0, 20);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('[NexusDoc] localStorage inaccessible (saveToHistory)', e);
  }
}

export function clearHistory() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('[NexusDoc] localStorage inaccessible (clearHistory)', e);
  }
}

export function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// ---------------------------------------------------------------------------
// Chargement dynamique de PDF.js (CDN) — une seule fois
// ---------------------------------------------------------------------------
let pdfjsLib: any = null;

async function loadPdfJs(): Promise<any> {
  if (pdfjsLib) return pdfjsLib;

  return new Promise((resolve, reject) => {
    // Worker
    const workerScript = document.createElement('script');
    workerScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    // Main lib
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      const lib = (window as any)['pdfjs-dist/build/pdf'] || (window as any).pdfjsLib;
      if (!lib) { reject(new Error('PDF.js non chargé')); return; }
      lib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      pdfjsLib = lib;
      resolve(lib);
    };
    script.onerror = () => reject(new Error('Échec chargement PDF.js'));
    document.head.appendChild(workerScript);
    document.head.appendChild(script);
  });
}

// ---------------------------------------------------------------------------
// Chargement dynamique de JSZip (CDN) — une seule fois
// ---------------------------------------------------------------------------
let JSZip: any = null;

async function loadJSZip(): Promise<any> {
  if (JSZip) return JSZip;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    script.onload = () => {
      JSZip = (window as any).JSZip;
      if (!JSZip) { reject(new Error('JSZip non chargé')); return; }
      resolve(JSZip);
    };
    script.onerror = () => reject(new Error('Échec chargement JSZip'));
    document.head.appendChild(script);
  });
}

// ---------------------------------------------------------------------------
// Conversion PDF → ZIP de PNG
// ---------------------------------------------------------------------------
async function pdfToImageZip(
  file: NexusFile,
  mimeType: 'image/png' | 'image/jpeg',
  ext: string,
  onProgress?: (p: number) => void
): Promise<{ dataUrl: string; size: number }> {
  const [pdfjs, Zip] = await Promise.all([loadPdfJs(), loadJSZip()]);

  // Décoder le dataUrl en ArrayBuffer
  const base64 = file.dataUrl!.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const numPages = pdf.numPages;
  const zip = new Zip();
  const baseName = file.originalName.replace(/\.[^.]+$/, '');

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const scale = 2.0; // 2x pour bonne résolution
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;

    await page.render({ canvasContext: ctx, viewport }).promise;

    // Canvas → blob PNG/JPEG
    const blob: Blob = await new Promise((res) =>
      canvas.toBlob((b) => res(b!), mimeType, 0.92)
    );

    const arrayBuffer = await blob.arrayBuffer();
    const paddedNum = String(pageNum).padStart(3, '0');
    zip.file(`${baseName}_page_${paddedNum}.${ext}`, arrayBuffer);

    if (onProgress) onProgress(Math.round((pageNum / numPages) * 85) + 10);
  }

  const zipBlob: Blob = await zip.generateAsync({ type: 'blob' });
  const dataUrl: string = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(zipBlob);
  });

  return { dataUrl, size: zipBlob.size };
}

// ---------------------------------------------------------------------------
// Conversion image source → image cible (canvas)
// ---------------------------------------------------------------------------
function imageToImage(
  file: NexusFile,
  mimeType: 'image/png' | 'image/jpeg'
): Promise<{ dataUrl: string; size: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 800;
      canvas.height = img.naturalHeight || 600;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL(mimeType, 0.92);
      const base64 = dataUrl.split(',')[1] || '';
      resolve({ dataUrl, size: Math.round((base64.length * 3) / 4) });
    };
    img.onerror = () => resolve(makeSvgPlaceholder(file, mimeType === 'image/png' ? 'PNG' : 'JPEG'));
    img.src = file.dataUrl!;
  });
}

// ---------------------------------------------------------------------------
// Placeholder SVG (fallback)
// ---------------------------------------------------------------------------
function makeSvgPlaceholder(file: NexusFile, targetFormat: string): { dataUrl: string; size: number } {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <rect width="800" height="600" fill="#f8fafc"/>
  <rect x="20" y="20" width="760" height="560" rx="16" fill="white" stroke="#e2e8f0" stroke-width="2"/>
  <text x="400" y="240" font-family="system-ui,sans-serif" font-size="64" text-anchor="middle" fill="#94a3b8">&#128196;</text>
  <text x="400" y="310" font-family="system-ui,sans-serif" font-size="22" font-weight="bold" text-anchor="middle" fill="#1e293b">${targetFormat}</text>
  <text x="400" y="345" font-family="system-ui,sans-serif" font-size="13" text-anchor="middle" fill="#64748b">${file.originalName}</text>
  <text x="400" y="390" font-family="system-ui,sans-serif" font-size="11" text-anchor="middle" fill="#94a3b8">Apercu non disponible</text>
</svg>`;
  const dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  return { dataUrl, size: svg.length };
}

// ---------------------------------------------------------------------------
// Point d'entrée principal
// ---------------------------------------------------------------------------
export function generateMockConvertedFile(
  file: NexusFile,
  targetFormat: string,
  onProgress?: (p: number) => void
): Promise<{ dataUrl: string; size: number; isZip?: boolean }> {
  const fmt = targetFormat.toUpperCase();
  const isPdfSource = file.originalType === 'application/pdf' || file.originalName.toLowerCase().endsWith('.pdf');
  const isImageSource = file.originalType?.startsWith('image/');
  const isImageTarget = ['PNG', 'JPEG', 'JPG'].includes(fmt);

  // ① PDF → PNG ou JPEG  →  ZIP de pages
  if (isPdfSource && isImageTarget && file.dataUrl) {
    const mime = fmt === 'PNG' ? 'image/png' : 'image/jpeg';
    const ext = fmt === 'PNG' ? 'png' : 'jpg';
    return pdfToImageZip(file, mime, ext, onProgress).then(r => ({ ...r, isZip: true }));
  }

  // ② Image → image (canvas)
  if (isImageTarget && isImageSource && file.dataUrl) {
    const mime = fmt === 'PNG' ? 'image/png' : 'image/jpeg';
    return imageToImage(file, mime);
  }

  // ③ Cible image mais source non convertible → placeholder SVG
  if (isImageTarget) {
    return Promise.resolve(makeSvgPlaceholder(file, targetFormat));
  }

  // ④ Tous les autres formats → fichier texte structuré lisible
  return new Promise((resolve) => {
    setTimeout(() => {
      const lines = [
        'NEXUS·DOC — FICHIER CONVERTI',
        '='.repeat(40),
        '',
        `Fichier original : ${file.originalName}`,
        `Format cible     : ${targetFormat}`,
        `Taille originale : ${formatBytes(file.originalSize)}`,
        `Date             : ${new Date(file.createdAt).toLocaleString('fr-FR')}`,
        '',
        '─'.repeat(40),
        'CONTENU (simulation)',
        '─'.repeat(40),
        '',
        `Ce fichier est une représentation simulée de la conversion.`,
        `Dans une implémentation backend complète, le contenu réel`,
        `du document ${targetFormat} serait généré ici.`,
        '',
        '─'.repeat(40),
        'Généré par NEXUS·DOC',
      ];
      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
      const reader = new FileReader();
      reader.onloadend = () => resolve({ dataUrl: reader.result as string, size: blob.size });
      reader.readAsDataURL(blob);
    }, 1500);
  });
}
