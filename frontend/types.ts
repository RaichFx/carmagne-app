
export enum LogType {
  ENTRADA = 'ENTRADA',
  SALIDA = 'SALIDA',
  INICIO_DESCANSO = 'INICIO_DESCANSO',
  FIN_DESCANSO = 'FIN_DESCANSO',
  REGISTRO = 'REGISTRO',
}

export type WorkMode = 'HORAS' | 'DESTAJO';

export interface Worker {
  id: string;
  name: string;
  qrCode: string;
  active: boolean;
  pin: string;
  dni?: string;
  role?: string;
  phone?: string;
  defaultMode?: WorkMode;
}

export interface Site {
  id: string;
  name: string;
  address: string;
  active: boolean;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

export interface AdminUser {
  id: string;
  username: string;
  password: string;
  active: boolean;
  createdAt: number;
}

export interface GeoLocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  address?: string;
}

export interface ToolRecord {
  id: string;
  workerId: string;
  workerName: string;
  toolName: string;
  brand: string;
  model: string;
  timestamp: number;
  dateStr: string;
  timeStr: string;
  siteId?: string;
  siteName?: string;
}

export interface WorkLog {
  id: string;
  workerId: string;
  workerName: string;
  siteId: string;
  siteName: string;
  type: LogType;
  timestamp: number;
  dateStr: string;
  timeStr: string;
  location: GeoLocationData;
  photoUrl?: string;
  sentToWhatsapp: boolean;
  syncedToSheets: boolean;
  distanceMeters?: number; 
  locationWarning?: boolean;
  workMode?: WorkMode;
  workReport?: string;
}

export interface AppConfig {
  adminPhone: string;
  googleSheetUrl: string;
  adminPassword?: string;
  logoUrl?: string;
  faviconUrl?: string;
  logoScaleLogin?: number;
  logoScaleDashboard?: number;
}

export interface WeeklyReportExtracted {
  weekStart?: string | null;
  weekEnd?: string | null;
  totalHours?: number | null;
  daysWorked?: number | null;
  siteName?: string | null;
  tasks?: string[] | null;
  notes?: string | null;
  rawText?: string | null;
}

export interface WeeklyReport {
  id: string;
  workerId: string;
  workerName: string;
  weekStart: string;   // ISO date (YYYY-MM-DD) of Monday
  weekEnd: string;     // ISO date (YYYY-MM-DD) of Sunday
  totalHours: number;
  siteName: string;
  tasks: string;       // free text summary
  notes?: string;
  photoBase64: string; // data URL
  fileName?: string;
  extracted?: WeeklyReportExtracted;
  status: 'PENDIENTE' | 'ENVIADO';
  createdAt: number;
  dateStr: string;
  timeStr: string;
}

export interface Payroll {
  id: string;
  workerId: string;
  workerName: string;
  month: number;  // 0-11
  year: number;
  fileBase64: string;   // data URL of PDF / image
  fileName: string;
  mimeType: string;
  notes?: string;
  uploadedAt: number;
  uploadedBy: string;   // admin username
  dateStr: string;
}
