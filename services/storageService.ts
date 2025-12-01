import { Worker, Site, WorkLog, AppConfig, LogType } from '../types';

const KEYS = {
  WORKERS: 'carmagne_workers',
  SITES: 'carmagne_sites',
  LOGS: 'carmagne_logs',
  CONFIG: 'carmagne_config',
};

// Initial Seed Data
const INITIAL_WORKERS: Worker[] = [
  { id: 'W001', name: 'Juan Pérez', qrCode: 'QR_W001', active: true, pin: '1234' },
  { id: 'W002', name: 'Maria Rodriguez', qrCode: 'QR_W002', active: true, pin: '0000' },
  { id: 'W003', name: 'Carlos Gomez', qrCode: 'QR_W003', active: true, pin: '5678' },
];

const INITIAL_SITES: Site[] = [
  { id: 'S001', name: 'Obra Central: Torre A', address: 'Av. Principal 123', active: true },
  { id: 'S002', name: 'Reforma Oficinas Norte', address: 'Calle 45, Polígono Ind.', active: true },
];

const INITIAL_CONFIG: AppConfig = {
  adminPhone: '34631400010', // Updated phone number
  googleSheetUrl: 'https://docs.google.com/spreadsheets/d/Mg...',
};

// Helpers
const load = <T>(key: string, initial: T): T => {
  const saved = localStorage.getItem(key);
  return saved ? JSON.parse(saved) : initial;
};

const save = <T>(key: string, data: T): void => {
  localStorage.setItem(key, JSON.stringify(data));
};

// Service Methods
export const StorageService = {
  getWorkers: (): Worker[] => load(KEYS.WORKERS, INITIAL_WORKERS),
  saveWorkers: (workers: Worker[]) => save(KEYS.WORKERS, workers),

  getSites: (): Site[] => load(KEYS.SITES, INITIAL_SITES),
  saveSites: (sites: Site[]) => save(KEYS.SITES, sites),

  getLogs: (): WorkLog[] => load(KEYS.LOGS, []),
  addLog: (log: WorkLog) => {
    const logs = load<WorkLog[]>(KEYS.LOGS, []);
    save(KEYS.LOGS, [log, ...logs]); // Newest first
  },

  getConfig: (): AppConfig => load(KEYS.CONFIG, INITIAL_CONFIG),
  saveConfig: (config: AppConfig) => save(KEYS.CONFIG, config),
  
  // Mock function to simulate Google Sheets export
  exportToCSV: (logs: WorkLog[]): string => {
    const headers = ['ID Registro', 'Nombre Trabajador', 'ID Trabajador', 'Obra', 'Tipo', 'Fecha', 'Hora', 'Latitud', 'Longitud', 'Google Maps', 'URL Selfie'];
    const rows = logs.map(l => [
      l.id,
      l.workerName,
      l.workerId,
      l.siteName,
      l.type,
      l.dateStr,
      l.timeStr,
      l.location.latitude,
      l.location.longitude,
      `https://www.google.com/maps?q=${l.location.latitude},${l.location.longitude}`,
      l.photoUrl ? 'IMAGEN_ADJUNTA' : 'N/A'
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
};