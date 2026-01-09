
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
