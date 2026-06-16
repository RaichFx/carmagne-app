import { WeeklyReportExtracted } from '../types';

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/$/, '');

export interface ExtractResult {
  success: boolean;
  data: WeeklyReportExtracted;
  error?: string;
}

export const WeeklyReportService = {
  /**
   * Sends a base64 image to the backend AI extraction endpoint.
   * The backend uses GPT-4o (via Emergent LLM Key) to extract structured weekly report data.
   */
  extractFromImage: async (imageBase64: string, mimeType: string = 'image/jpeg'): Promise<ExtractResult> => {
    const url = `${BACKEND_URL}/api/weekly-report/extract`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: imageBase64, mime_type: mimeType }),
    });
    if (!response.ok) {
      const txt = await response.text().catch(() => '');
      return { success: false, data: {}, error: `HTTP ${response.status} ${txt}` };
    }
    const result: ExtractResult = await response.json();
    return result;
  },

  /**
   * Returns Monday (start) and Sunday (end) of the week containing the given date.
   */
  getWeekRange: (date: Date = new Date()): { start: string; end: string } => {
    const d = new Date(date);
    const day = d.getDay();
    const diffToMonday = d.getDate() - day + (day === 0 ? -6 : 1);
    const start = new Date(d);
    start.setDate(diffToMonday);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    const fmt = (x: Date) => x.toISOString().split('T')[0];
    return { start: fmt(start), end: fmt(end) };
  },
};
