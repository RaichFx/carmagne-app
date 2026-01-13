
import { Worker, Site, WorkLog, AppConfig, LogType, AdminUser, ToolRecord } from '../types';
import { db } from './firebase';
import { collection, doc, setDoc, updateDoc, onSnapshot, deleteDoc, getDoc } from 'firebase/firestore';

const KEYS = {
  WORKERS: 'carmagne_workers',
  SITES: 'carmagne_sites',
  LOGS: 'carmagne_logs',
  CONFIG: 'carmagne_config',
  ADMINS: 'carmagne_admins',
  TOOLS: 'carmagne_tools',
};

export const ELECTRICAL_TOOLS_LIST = [
  "Multímetro Digital", "Pinza Amperimétrica", "Pistola de Impacto", "Taladro Percutor",
  "Pelacables Automático", "Pelacables de Precisión", "Crimpadora RJ45", "Crimpadora de Terminales",
  "Destornillador Aislado (VDE)", "Juego de Llaves de Vaso", "Guía Pasacables (Fibra)", "Guía Pasacables (Acero)",
  "Amoladora / Radial", "Sierra de Sable", "Nivel Láser Autonivelante", "Cinta Métrica Magnética",
  "Localizador de Cables", "Comprobador de Diferenciales", "Megaóhmetro", "Cámara Termográfica",
  "Linterna de Cabeza LED", "Escalera de Tijera Dieléctrica", "Martillo Electrotécnico", "Cincel / Cortafríos",
  "Prensa Hidráulica", "Cortacables de Carraca", "Doblador de Tubos", "Maletín de Herramientas Rígido"
];

export const ELECTRICAL_BRANDS_LIST = [
  "Fluke", "Milwaukee", "DeWalt", "Hilti", "Makita", "Bosch Professional", "Klein Tools",
  "Knipex", "Wiha", "Wera", "Stanley", "Bahco", "Cimco", "Megger", "Testo", "Metrel",
  "Ideal Industries", "Greenlee", "Chauvin Arnoux", "Schneider Electric", "Legrand", 
  "Facom", "Palmerá", "Irazola", "Weller", "Hikoki", "Festool"
];

const INITIAL_WORKERS: Worker[] = [
  { id: 'W-BRAYAN-01', name: 'Brayan', dni: '', phone: '', pin: '1234', qrCode: 'QR_BRAYAN', active: true, defaultMode: 'HORAS' }
];

const INITIAL_SITES: Site[] = [
  { id: 'S001', name: 'Barakaldo 106', address: '13 Av. Altos Hornos de Vizcaya', active: true, coordinates: { latitude: 43.30087, longitude: -2.99256 } }
];

const INITIAL_CONFIG: AppConfig = { 
  adminPhone: '34631400010', 
  googleSheetUrl: '', 
  adminPassword: 'admin', 
  logoUrl: '', 
  logoScaleLogin: 1.0,
  logoScaleDashboard: 1.0
};

/**
 * Función robusta para clonar objetos y eliminar referencias circulares.
 * Especialmente útil para datos provenientes de Firebase Firestore.
 */
const safeClone = (obj: any) => {
  const seen = new WeakMap();

  const clone = (item: any): any => {
    // Manejo de nulos y no-objetos
    if (item === null || typeof item !== 'object') {
      return item;
    }

    // Manejo de Firebase Timestamp o cualquier objeto con toDate()
    if (typeof item.toDate === 'function') {
      return item.toDate().getTime();
    }

    // Manejo de instancias de Date
    if (item instanceof Date) {
      return item.getTime();
    }

    // Manejo de referencias circulares
    if (seen.has(item)) {
      return undefined;
    }
    seen.set(item, true);

    // Manejo de Arrays
    if (Array.isArray(item)) {
      return item.map(clone).filter(v => v !== undefined);
    }

    // Manejo de Objetos literales
    const result: any = {};
    const keys = Object.keys(item);
    
    for (const key of keys) {
      // Evitar procesar propiedades internas de Firebase que suelen causar circularidad
      if (key.startsWith('_')) continue;
      
      try {
        const val = clone(item[key]);
        if (val !== undefined) {
          result[key] = val;
        }
      } catch (e) {
        console.warn(`Error clonando propiedad ${key}:`, e);
      }
    }

    return result;
  };

  return clone(obj);
};

const loadLocal = <T>(key: string, initial: T): T => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : initial;
  } catch (e) { return initial; }
};

const saveLocal = <T>(key: string, data: T): void => {
  try {
    const cleaned = safeClone(data);
    localStorage.setItem(key, JSON.stringify(cleaned));
  } catch (e) { 
    console.error("Error al guardar en localStorage (JSON circular detectado):", e); 
  }
};

export const StorageService = {
  // --- TOOLS ---
  getTools: (): ToolRecord[] => loadLocal(KEYS.TOOLS, []),
  addTool: async (tool: ToolRecord) => {
    const tools = loadLocal<ToolRecord[]>(KEYS.TOOLS, []);
    const updated = [tool, ...tools];
    saveLocal(KEYS.TOOLS, updated);
    try { await setDoc(doc(db, "tools", tool.id), safeClone(tool)); } catch (e) { }
  },
  deleteTool: async (id: string) => {
    const tools = loadLocal<ToolRecord[]>(KEYS.TOOLS, []);
    saveLocal(KEYS.TOOLS, tools.filter(t => t.id !== id));
    try { await deleteDoc(doc(db, "tools", id)); } catch (e) { }
  },
  subscribeToTools: (callback: (tools: ToolRecord[]) => void) => {
    callback(loadLocal(KEYS.TOOLS, []));
    try {
      return onSnapshot(collection(db, "tools"), (snapshot) => {
        const tools = snapshot.docs.map(doc => doc.data() as ToolRecord);
        const sorted = [...tools].sort((a, b) => b.timestamp - a.timestamp);
        saveLocal(KEYS.TOOLS, sorted);
        callback(sorted);
      });
    } catch (e) { return () => {}; }
  },

  // --- WORKERS ---
  getWorkers: (): Worker[] => loadLocal(KEYS.WORKERS, INITIAL_WORKERS),
  registerNewWorker: async (worker: Worker) => {
    const current = loadLocal<Worker[]>(KEYS.WORKERS, INITIAL_WORKERS);
    saveLocal(KEYS.WORKERS, [...current, worker]);
    try { await setDoc(doc(db, "workers", worker.id), safeClone(worker)); } catch (e) { }
  },
  saveWorkers: async (workers: Worker[]) => {
    saveLocal(KEYS.WORKERS, workers);
    try { await Promise.all(workers.map(w => setDoc(doc(db, "workers", w.id), safeClone(w)))); } catch (e) { }
  },
  deleteWorker: async (id: string) => {
    const workers = loadLocal<Worker[]>(KEYS.WORKERS, INITIAL_WORKERS);
    saveLocal(KEYS.WORKERS, workers.filter(w => w.id !== id));
    try { await deleteDoc(doc(db, "workers", id)); } catch (e) { }
  },
  subscribeToWorkers: (callback: (workers: Worker[]) => void) => {
    callback(loadLocal(KEYS.WORKERS, INITIAL_WORKERS));
    try {
      return onSnapshot(collection(db, "workers"), (snapshot) => {
        const workers = snapshot.docs.map(doc => doc.data() as Worker);
        saveLocal(KEYS.WORKERS, workers);
        callback(workers);
      });
    } catch (e) { return () => {}; }
  },

  // --- SITES ---
  getSites: (): Site[] => loadLocal(KEYS.SITES, INITIAL_SITES),
  saveSites: async (sites: Site[]) => {
    saveLocal(KEYS.SITES, sites);
    try { await Promise.all(sites.map(s => setDoc(doc(db, "sites", s.id), safeClone(s)))); } catch (e) { }
  },
  updateSite: async (updatedSite: Site) => {
    const sites = loadLocal<Site[]>(KEYS.SITES, INITIAL_SITES);
    saveLocal(KEYS.SITES, sites.map(s => s.id === updatedSite.id ? updatedSite : s));
    try { await setDoc(doc(db, "sites", updatedSite.id), safeClone(updatedSite)); } catch (e) { }
  },
  deleteSite: async (id: string) => {
    const sites = loadLocal<Site[]>(KEYS.SITES, INITIAL_SITES);
    saveLocal(KEYS.SITES, sites.filter(s => s.id !== id));
    try { await deleteDoc(doc(db, "sites", id)); } catch (e) { }
  },
  subscribeToSites: (callback: (sites: Site[]) => void) => {
    callback(loadLocal(KEYS.SITES, INITIAL_SITES));
    try {
      return onSnapshot(collection(db, "sites"), (snapshot) => {
        const sites = snapshot.docs.map(doc => doc.data() as Site);
        saveLocal(KEYS.SITES, sites);
        callback(sites);
      });
    } catch (e) { return () => {}; }
  },

  // --- ADMINS ---
  getAdmins: (): AdminUser[] => loadLocal(KEYS.ADMINS, []),
  addAdmin: async (admin: AdminUser) => {
    const admins = loadLocal<AdminUser[]>(KEYS.ADMINS, []);
    saveLocal(KEYS.ADMINS, [...admins, admin]);
    try { await setDoc(doc(db, "admins", admin.id), safeClone(admin)); } catch(e) { }
  },
  deleteAdmin: async (id: string) => {
    const admins = loadLocal<AdminUser[]>(KEYS.ADMINS, []);
    saveLocal(KEYS.ADMINS, admins.filter(a => a.id !== id));
    try { await deleteDoc(doc(db, "admins", id)); } catch (e) { }
  },
  subscribeToAdmins: (callback: (admins: AdminUser[]) => void) => {
    callback(loadLocal(KEYS.ADMINS, []));
    try {
      return onSnapshot(collection(db, "admins"), (snapshot) => {
        const admins = snapshot.docs.map(doc => doc.data() as AdminUser);
        saveLocal(KEYS.ADMINS, admins);
        callback(admins);
      });
    } catch (e) { return () => {}; }
  },

  // --- LOGS ---
  getLogs: (): WorkLog[] => loadLocal(KEYS.LOGS, []),
  addLog: async (log: WorkLog) => {
    const logs = loadLocal<WorkLog[]>(KEYS.LOGS, []);
    saveLocal(KEYS.LOGS, [log, ...logs]);
    try { await setDoc(doc(db, "logs", log.id), safeClone(log)); } catch (e) { }
  },
  updateLog: async (updatedLog: WorkLog) => {
    const logs = loadLocal<WorkLog[]>(KEYS.LOGS, []);
    saveLocal(KEYS.LOGS, logs.map(l => l.id === updatedLog.id ? updatedLog : l));
    try { await updateDoc(doc(db, "logs", updatedLog.id), safeClone(updatedLog)); } catch (e) { }
  },
  subscribeToLogs: (callback: (logs: WorkLog[]) => void) => {
    callback(loadLocal(KEYS.LOGS, []));
    try {
      return onSnapshot(collection(db, "logs"), (snapshot) => {
        const logs = snapshot.docs.map(doc => doc.data() as WorkLog);
        const sorted = [...logs].sort((a, b) => b.timestamp - a.timestamp);
        saveLocal(KEYS.LOGS, sorted);
        callback(sorted);
      });
    } catch (e) { return () => {}; }
  },

  // --- CONFIG ---
  getConfig: (): AppConfig => loadLocal(KEYS.CONFIG, INITIAL_CONFIG),
  saveConfig: async (config: AppConfig) => {
    saveLocal(KEYS.CONFIG, config);
    try {
      await setDoc(doc(db, "config", "global"), safeClone(config));
    } catch (e) { console.error("Firebase Config Save failed", e); }
  },
  subscribeToConfig: (callback: (config: AppConfig) => void) => {
    callback(loadLocal(KEYS.CONFIG, INITIAL_CONFIG));
    try {
      return onSnapshot(doc(db, "config", "global"), (snapshot) => {
        if (snapshot.exists()) {
          const config = snapshot.data() as AppConfig;
          saveLocal(KEYS.CONFIG, config);
          callback(config);
        }
      });
    } catch (e) { return () => {}; }
  },
  
  syncLog: async (log: WorkLog): Promise<boolean> => {
    const config = loadLocal<AppConfig>(KEYS.CONFIG, INITIAL_CONFIG);
    if (!config.googleSheetUrl) return false;
    try {
      await fetch(config.googleSheetUrl, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ action: 'LOG', ...safeClone(log) }) });
      return true;
    } catch (error) { return false; }
  }
};
