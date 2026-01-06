
import { Worker, Site, WorkLog, AppConfig, LogType, AdminUser } from '../types';
import { db } from './firebase';
import { collection, addDoc, getDocs, doc, setDoc, updateDoc, query, orderBy, onSnapshot, deleteDoc } from 'firebase/firestore';

const KEYS = {
  WORKERS: 'carmagne_workers',
  SITES: 'carmagne_sites',
  LOGS: 'carmagne_logs',
  CONFIG: 'carmagne_config',
  ADMINS: 'carmagne_admins',
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
const INITIAL_ADMINS: AdminUser[] = [];

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyUKGxgBNzmL6nn0q7GAQwF83gO3tkxVJMDChAmfYGmy0zMmC8ilr6HvcVrZemU0p_suQ/exec'; 

const INITIAL_CONFIG: AppConfig = {
  adminPhone: '34631400010', 
  googleSheetUrl: GOOGLE_SCRIPT_URL, 
  adminPassword: 'admin'
};

// Helpers LocalStorage
const loadLocal = <T>(key: string, initial: T): T => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : initial;
  } catch (e) {
    return initial;
  }
};
const saveLocal = <T>(key: string, data: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error("Error saving local", e);
  }
};

const sanitizeForFirebase = (data: any) => {
  return JSON.parse(JSON.stringify(data));
};

export const StorageService = {
  // --- WORKERS ---
  getWorkers: (): Worker[] => loadLocal(KEYS.WORKERS, INITIAL_WORKERS),
  
  registerNewWorker: async (worker: Worker) => {
    // 1. Guardar localmente primero
    const currentWorkers = loadLocal<Worker[]>(KEYS.WORKERS, INITIAL_WORKERS);
    saveLocal(KEYS.WORKERS, [...currentWorkers, worker]);

    const regLog: WorkLog = {
      id: `REG-${worker.id}-${Date.now()}`,
      workerId: worker.id,
      workerName: worker.name,
      siteId: 'SYSTEM',
      siteName: 'Alta en App',
      type: LogType.REGISTRO,
      timestamp: Date.now(),
      dateStr: new Date().toLocaleDateString('es-ES'),
      timeStr: new Date().toLocaleTimeString('es-ES'),
      location: { latitude: 0, longitude: 0, accuracy: 0, address: 'Registro Móvil' },
      sentToWhatsapp: false,
      syncedToSheets: false,
      workMode: worker.defaultMode,
      workReport: `Alta nuevo usuario: ${worker.phone || 'Sin teléfono'}`
    };
    const currentLogs = loadLocal<WorkLog[]>(KEYS.LOGS, []);
    saveLocal(KEYS.LOGS, [regLog, ...currentLogs]);

    try {
      const cleanWorker = sanitizeForFirebase(worker);
      await setDoc(doc(db, "workers", worker.id), cleanWorker);
      const cleanLog = sanitizeForFirebase(regLog);
      await setDoc(doc(db, "logs", regLog.id), cleanLog);
    } catch (e) {
      console.warn("Firebase Sync failed (Permissions?), data saved locally", e);
    }

    StorageService.syncWorkerToSheets(worker);
  },

  saveWorkers: async (workers: Worker[]) => {
    saveLocal(KEYS.WORKERS, workers);
    try {
      await Promise.all(workers.map(w => {
        const cleanW = sanitizeForFirebase(w);
        return setDoc(doc(db, "workers", w.id), cleanW);
      }));
    } catch (e) { console.warn("Error syncing workers to FB", e); }
  },

  deleteWorker: async (id: string) => {
    const workers = loadLocal<Worker[]>(KEYS.WORKERS, INITIAL_WORKERS);
    saveLocal(KEYS.WORKERS, workers.filter(w => w.id !== id));
    try {
      await deleteDoc(doc(db, "workers", id));
    } catch (e) { console.warn("Error deleting worker from FB", e); }
  },

  // --- SITES ---
  getSites: (): Site[] => loadLocal(KEYS.SITES, INITIAL_SITES),
  
  saveSites: async (sites: Site[]) => {
    saveLocal(KEYS.SITES, sites);
    try {
      await Promise.all(sites.map(s => {
        const cleanS = sanitizeForFirebase(s);
        return setDoc(doc(db, "sites", s.id), cleanS);
      }));
    } catch (e) { console.warn("Error syncing sites to FB", e); }
  },

  updateSite: async (updatedSite: Site) => {
    const sites = loadLocal<Site[]>(KEYS.SITES, INITIAL_SITES);
    saveLocal(KEYS.SITES, sites.map(s => s.id === updatedSite.id ? updatedSite : s));
    try {
      const cleanSite = sanitizeForFirebase(updatedSite);
      await setDoc(doc(db, "sites", updatedSite.id), cleanSite);
    } catch (e) { console.warn("Error updating site in FB", e); }
  },

  deleteSite: async (id: string) => {
    const sites = loadLocal<Site[]>(KEYS.SITES, INITIAL_SITES);
    saveLocal(KEYS.SITES, sites.filter(s => s.id !== id));
    try {
      await deleteDoc(doc(db, "sites", id));
    } catch (e) { console.warn("Error deleting site from FB", e); }
  },

  // --- ADMIN USERS ---
  getAdmins: (): AdminUser[] => loadLocal(KEYS.ADMINS, INITIAL_ADMINS),

  addAdmin: async (admin: AdminUser) => {
    const admins = loadLocal<AdminUser[]>(KEYS.ADMINS, INITIAL_ADMINS);
    saveLocal(KEYS.ADMINS, [...admins, admin]);
    try {
      const cleanAdmin = sanitizeForFirebase(admin);
      await setDoc(doc(db, "admins", admin.id), cleanAdmin);
    } catch(e) { console.warn("Error saving admin to FB", e); }
  },

  deleteAdmin: async (id: string) => {
    const admins = loadLocal<AdminUser[]>(KEYS.ADMINS, INITIAL_ADMINS);
    saveLocal(KEYS.ADMINS, admins.filter(a => a.id !== id));
    try {
      await deleteDoc(doc(db, "admins", id));
    } catch(e) { console.warn("Error deleting admin from FB", e); }
  },

  // --- LOGS ---
  getLogs: (): WorkLog[] => loadLocal(KEYS.LOGS, []),
  
  addLog: async (log: WorkLog) => {
    const logs = loadLocal<WorkLog[]>(KEYS.LOGS, []);
    saveLocal(KEYS.LOGS, [log, ...logs]);
    try {
      const cleanLog = sanitizeForFirebase(log);
      await setDoc(doc(db, "logs", log.id), cleanLog);
    } catch (e) {
      console.warn("Firebase Add Log failed, kept locally", e);
    }
  },

  updateLog: async (updatedLog: WorkLog) => {
    const logs = loadLocal<WorkLog[]>(KEYS.LOGS, []);
    saveLocal(KEYS.LOGS, logs.map(l => l.id === updatedLog.id ? updatedLog : l));
    try {
      const cleanLog = sanitizeForFirebase(updatedLog);
      await updateDoc(doc(db, "logs", updatedLog.id), cleanLog);
    } catch (e) { console.warn("Firebase Update Log failed", e); }
  },

  // --- CONFIG ---
  getConfig: (): AppConfig => loadLocal(KEYS.CONFIG, INITIAL_CONFIG),
  saveConfig: (config: AppConfig) => saveLocal(KEYS.CONFIG, config),
  
  // --- SYNC HELPERS ---
  syncLog: async (log: WorkLog): Promise<boolean> => {
    const config = loadLocal<AppConfig>(KEYS.CONFIG, INITIAL_CONFIG);
    const url = config.googleSheetUrl || GOOGLE_SCRIPT_URL;
    if (!url || url.length < 10) return false;
    try {
      await fetch(url, {
        method: 'POST', 
        mode: 'no-cors', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'LOG', ...log })
      });
      return true;
    } catch (error) { return false; }
  },

  syncWorkerToSheets: async (worker: Worker): Promise<boolean> => {
    const config = loadLocal<AppConfig>(KEYS.CONFIG, INITIAL_CONFIG);
    const url = config.googleSheetUrl || GOOGLE_SCRIPT_URL;
    if (!url || url.length < 10) return false;
    try {
      await fetch(url, {
        method: 'POST', 
        mode: 'no-cors', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REGISTER', worker: worker })
      });
      return true;
    } catch (error) { return false; }
  },
  
  syncWorker: async (worker: Worker) => {
     return StorageService.syncWorkerToSheets(worker);
  },

  // --- REAL-TIME LISTENERS (Robust Version) ---
  
  subscribeToLogs: (callback: (logs: WorkLog[]) => void) => {
    // 1. Emitir local inmediatamente
    callback(loadLocal(KEYS.LOGS, []));
    
    // 2. Intentar suscripción
    try {
      return onSnapshot(collection(db, "logs"), (snapshot) => {
        const logs = snapshot.docs.map(doc => doc.data() as WorkLog);
        logs.sort((a, b) => b.timestamp - a.timestamp);
        saveLocal(KEYS.LOGS, logs);
        callback(logs);
      }, (error) => {
         console.warn("Firestore Logs permission denied. Using local cache only.", error.message);
      });
    } catch (e) {
      console.error("Critical error in logs subscription", e);
      return () => {};
    }
  },

  subscribeToWorkers: (callback: (workers: Worker[]) => void) => {
    callback(loadLocal(KEYS.WORKERS, INITIAL_WORKERS));
    try {
      return onSnapshot(collection(db, "workers"), (snapshot) => {
        const workers = snapshot.docs.map(doc => doc.data() as Worker);
        saveLocal(KEYS.WORKERS, workers);
        callback(workers);
      }, (error) => {
        console.warn("Firestore Workers permission denied.", error.message);
      });
    } catch (e) { return () => {}; }
  },

  subscribeToAdmins: (callback: (admins: AdminUser[]) => void) => {
    callback(loadLocal(KEYS.ADMINS, INITIAL_ADMINS));
    try {
      return onSnapshot(collection(db, "admins"), (snapshot) => {
         const admins = snapshot.docs.map(doc => doc.data() as AdminUser);
         saveLocal(KEYS.ADMINS, admins);
         callback(admins);
      }, (error) => {
        console.warn("Firestore Admins permission denied.", error.message);
      });
    } catch (e) { return () => {}; }
  },

  subscribeToSites: (callback: (sites: Site[]) => void) => {
    callback(loadLocal(KEYS.SITES, INITIAL_SITES));
    try {
      return onSnapshot(collection(db, "sites"), (snapshot) => {
        const sites = snapshot.docs.map(doc => doc.data() as Site);
        saveLocal(KEYS.SITES, sites);
        callback(sites);
      }, (error) => {
        console.warn("Firestore Sites permission denied.", error.message);
      });
    } catch (e) { return () => {}; }
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
