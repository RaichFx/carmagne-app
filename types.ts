
export enum LogType {
  ENTRADA = 'ENTRADA',
  SALIDA = 'SALIDA',
  INICIO_DESCANSO = 'INICIO_DESCANSO',
  FIN_DESCANSO = 'FIN_DESCANSO',
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
  defaultMode?: WorkMode; // Modo por defecto del trabajador
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

export interface GeoLocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  address?: string;
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
  // Campos nuevos para Geofencing
  distanceMeters?: number; 
  locationWarning?: boolean;
  // Campos nuevos para Reporte de Salida
  workMode?: WorkMode;
  workReport?: string;
}

export interface AppConfig {
  adminPhone: string;
  googleSheetUrl: string;
  adminPassword?: string;
  whatsappTemplate?: string;
}
