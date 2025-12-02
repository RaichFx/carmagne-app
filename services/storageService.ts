import { Worker, Site, WorkLog, AppConfig } from '../types';
import { db } from './firebase';
import { collection, addDoc, getDocs, doc, setDoc, updateDoc, query, orderBy, onSnapshot } from 'firebase/firestore';

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
    coordinates: { latitude: 43.30087, longitude: -2.99256 }
  }
];

// Google Script URL Backup
const GOOGLE_SCRIPT_URL = ''; 

const INITIAL_CONFIG: AppConfig = {
  adminPhone: '34631400010', 
  googleSheetUrl: GOOGLE_SCRIPT_URL, 
  adminPassword: 'admin'
};

// Helpers LocalStorage
const loadLocal = <T>(key: string, initial: T): T => {
  const saved = localStorage.getItem(key);
  return saved ? JSON.parse(saved) : initial;
};
const saveLocal = <T>(key: string, data: T): void => {
  localStorage.setItem(key, JSON.stringify(data));
};

// Service Methods
export const StorageService = {
  // --- WORKERS ---
  getWorkers: (): Worker[] => loadLocal(KEYS.WORKERS, INITIAL_WORKERS),
  
  saveWorkers: async (workers: Worker[]) => {
    saveLocal(KEYS.WORKERS, workers);
    // Sync to Firebase (Update each worker doc)
    try {
      workers.forEach(async (w) => {
        await setDoc(doc(db, "workers", w.id), w);
      });
    } catch (e) { console.error("Error syncing workers to FB", e); }
  },

  // --- SITES ---
  getSites: (): Site[] => loadLocal(KEYS.SITES, INITIAL_SITES),
  
  saveSites: async (sites: Site[]) => {
    saveLocal(KEYS.SITES, sites);
    try {
      sites.forEach(async (s) => {
        await setDoc(doc(db, "sites", s.id), s);
      });
    } catch (e) { console.error("Error syncing sites to FB", e); }
  },

  // --- LOGS (FICHAJES) ---
  getLogs: (): WorkLog[] => loadLocal(KEYS.LOGS, []),
  
  addLog: async (log: WorkLog) => {
    // 1. Save Local (Instant Feedback)
    const logs = loadLocal<WorkLog[]>(KEYS.LOGS, []);
    saveLocal(KEYS.LOGS, [log, ...logs]);

    // 2. Save to Firebase (Real-time Cloud)
    try {
      await setDoc(doc(db, "logs", log.id), log);
    } catch (e) {
      console.error("Firebase Add Error", e);
    }
  },

  updateLog: async (updatedLog: WorkLog) => {
    // Local Update
    const logs = loadLocal<WorkLog[]>(KEYS.LOGS, []);
    const newLogs = logs.map(l => l.id === updatedLog.id ? updatedLog : l);
    saveLocal(KEYS.LOGS, newLogs);

    // Firebase Update
    try {
      const logRef = doc(db, "logs", updatedLog.id);
      await updateDoc(logRef, { ...updatedLog });
    } catch (e) { console.error("Firebase Update Error", e); }
  },

  // --- CONFIG ---
  getConfig: (): AppConfig => loadLocal(KEYS.CONFIG, INITIAL_CONFIG),
  saveConfig: (config: AppConfig) => saveLocal(KEYS.CONFIG, config),
  
  // --- SYNC HELPERS (Google Sheets Legacy) ---
  syncLog: async (log: WorkLog): Promise<boolean> => {
    const config = loadLocal<AppConfig>(KEYS.CONFIG, INITIAL_CONFIG);
    const url = config.googleSheetUrl || GOOGLE_SCRIPT_URL;
    if (!url) return false;
    try {
      await fetch(url, {
        method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'LOG', ...log })
      });
      return true;
    } catch (error) { return false; }
  },

  syncWorker: async (worker: Worker): Promise<boolean> => {
    // Save to Firebase First
    try { await setDoc(doc(db, "workers", worker.id), worker); } catch(e){}

    const config = loadLocal<AppConfig>(KEYS.CONFIG, INITIAL_CONFIG);
    const url = config.googleSheetUrl || GOOGLE_SCRIPT_URL;
    if (!url) return false;
    try {
      await fetch(url, {
        method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REGISTER', worker: worker })
      });
      return true;
    } catch (error) { return false; }
  },

  // --- REAL-TIME LISTENERS ---
  
  // Escuchar Fichajes (Para Admin)
  subscribeToLogs: (callback: (logs: WorkLog[]) => void) => {
    const q = query(collection(db, "logs"), orderBy("timestamp", "desc"));
    return onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map(doc => doc.data() as WorkLog);
      saveLocal(KEYS.LOGS, logs);
      callback(logs);
    });
  },

  // Escuchar Trabajadores (Para todos)
  subscribeToWorkers: (callback: (workers: Worker[]) => void) => {
    return onSnapshot(collection(db, "workers"), (snapshot) => {
      const workers = snapshot.docs.map(doc => doc.data() as Worker);
      saveLocal(KEYS.WORKERS, workers);
      callback(workers);
    });
  },

  // Escuchar Obras (Para todos)
  subscribeToSites: (callback: (sites: Site[]) => void) => {
    return onSnapshot(collection(db, "sites"), (snapshot) => {
      const sites = snapshot.docs.map(doc => doc.data() as Site);
      saveLocal(KEYS.SITES, sites);
      callback(sites);
    });
  },

  exportToCSV: (logs: WorkLog[]): string => {
    const headers = [
      'ID Registro', 'Nombre Trabajador', 'ID Trabajador', 'Obra', 'Tipo', 
      'Fecha', 'Hora', 'Modo Trabajo', 'Reporte Jornada',
      'Latitud', 'Longitud', 'Google Maps', 'Alerta Distancia'
    ];
    const rows = logs.map(l => [
      l.id, l.workerName, l.workerId, l.siteName, l.type,
      l.dateStr, l.timeStr, l.workMode || 'HORAS', 
      `"${(l.workReport || '').replace(/"/g, '""')}"`, 
      l.location.latitude, l.location.longitude,
      `https://www.google.com/maps?q=${l.location.latitude},${l.location.longitude}`,
      l.locationWarning ? 'SI' : 'NO'
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
};