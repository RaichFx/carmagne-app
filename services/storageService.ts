
import { Worker, Site, WorkLog, AppConfig, LogType } from '../types';

const KEYS = {
  WORKERS: 'carmagne_workers',
  SITES: 'carmagne_sites',
  LOGS: 'carmagne_logs',
  CONFIG: 'carmagne_config',
};

// Initial Seed Data
const INITIAL_WORKERS: Worker[] = [];

const INITIAL_SITES: Site[] = [
  { 
    id: 'S001', 
    name: 'Barakaldo 106', 
    address: '13 Av. Altos Hornos de Vizcaya', 
    active: true,
    coordinates: {
      latitude: 43.30087,
      longitude: -2.99256
    }
  }
];

// *** IMPORTANTE: PEGA AQUÍ TU URL DE GOOGLE APPS SCRIPT PARA QUE LOS TRABAJADORES LA TENGAN POR DEFECTO ***
const GOOGLE_SCRIPT_URL = ''; // Ej: 'https://script.google.com/macros/s/AKfycbx.../exec'

const INITIAL_CONFIG: AppConfig = {
  adminPhone: '34631400010', 
  googleSheetUrl: GOOGLE_SCRIPT_URL, 
  adminPassword: 'admin'
};

// Helpers
const load = <T>(key: string, initial: T): T => {
  const saved = localStorage.getItem(key);
  // Si cargamos la config, asegurarnos de que la URL del script esté presente si la hemos definido en el código
  if (key === KEYS.CONFIG && saved) {
    const parsed = JSON.parse(saved);
    if (!parsed.googleSheetUrl && GOOGLE_SCRIPT_URL) {
      parsed.googleSheetUrl = GOOGLE_SCRIPT_URL;
    }
    return parsed as T;
  }
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

  updateLog: (updatedLog: WorkLog) => {
    const logs = load<WorkLog[]>(KEYS.LOGS, []);
    const newLogs = logs.map(l => l.id === updatedLog.id ? updatedLog : l);
    save(KEYS.LOGS, newLogs);
  },

  getConfig: (): AppConfig => load(KEYS.CONFIG, INITIAL_CONFIG),
  saveConfig: (config: AppConfig) => save(KEYS.CONFIG, config),
  
  // Sincronizar Fichaje (LOG)
  syncLog: async (log: WorkLog): Promise<boolean> => {
    const config = load(KEYS.CONFIG, INITIAL_CONFIG);
    const url = config.googleSheetUrl || GOOGLE_SCRIPT_URL; // Fallback to constant
    
    if (!url) return false;

    try {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors', 
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'LOG',
          ...log
        })
      });
      return true;
    } catch (error) {
      console.error("Sync Log Error:", error);
      return false;
    }
  },

  // Sincronizar Trabajador Nuevo (REGISTER)
  syncWorker: async (worker: Worker): Promise<boolean> => {
    const config = load(KEYS.CONFIG, INITIAL_CONFIG);
    const url = config.googleSheetUrl || GOOGLE_SCRIPT_URL;https://script.google.com/macros/s/AKfycbyUKGxgBNzmL6nn0q7GAQwF83gO3tkxVJMDChAmfYGmy0zMmC8ilr6HvcVrZemU0p_suQ/exec

    if (!url) return false;

    try {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'REGISTER',
          worker: worker
        })
      });
      return true;
    } catch (error) {
      console.error("Sync Worker Error:", error);
      return false;
    }
  },

  exportToCSV: (logs: WorkLog[]): string => {
    const headers = [
      'ID Registro', 'Nombre Trabajador', 'ID Trabajador', 'Obra', 'Tipo', 
      'Fecha', 'Hora', 'Modo Trabajo', 'Reporte Jornada',
      'Latitud', 'Longitud', 'Google Maps', 'Alerta Distancia'
    ];
    
    const rows = logs.map(l => [
      l.id,
      l.workerName,
      l.workerId,
      l.siteName,
      l.type,
      l.dateStr,
      l.timeStr,
      l.workMode || 'HORAS', 
      `"${(l.workReport || '').replace(/"/g, '""')}"`, 
      l.location.latitude,
      l.location.longitude,
      `https://www.google.com/maps?q=${l.location.latitude},${l.location.longitude}`,
      l.locationWarning ? 'SI' : 'NO'
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
};
