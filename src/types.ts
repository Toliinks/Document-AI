export type ConversionStatus = 'idle' | 'pending' | 'processing' | 'done' | 'error';

export interface NexusFile {
  id: string;
  originalName: string;
  originalSize: number;
  originalType: string;
  dataUrl?: string; // base64 representation if small enough
  targetFormat: string;
  status: ConversionStatus;
  progress: number;
  convertedName?: string;
  convertedSize?: number;
  convertedDataUrl?: string; // Mocked converted output
  error?: string;
  createdAt: number;
}

export type AIAnalysisLevel = 'court' | 'detaillé';

export interface AIAnalysisResult {
  synthesis: string;
  details: string;
  points: string;
  actions: string;
  raw: string;
}

export const FORMATS = ['PDF', 'ODT', 'XLSX', 'PPTX', 'PNG', 'JPEG', 'TXT', 'HTML', 'RTF', 'XML'] as const;
export type SupportedFormat = typeof FORMATS[number];

export interface UserProfile {
  name: string;
  age: string;
  avatarUrl?: string;
}
