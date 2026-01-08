
import { Worker, Site, WorkLog, AppConfig, LogType, AdminUser, ToolRecord } from '../types';
import { db } from './firebase';
import { collection, doc, setDoc, updateDoc, onSnapshot, deleteDoc } from 'firebase/firestore';

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

const INITIAL_WORKERS: Worker[] = [];
const INITIAL_SITES: Site[] = [
  { id: 'S001', name: 'Barakaldo 106', address: '13 Av. Altos Hornos de Vizcaya', active: true, coordinates: { latitude: 43.30087, longitude: -2.99256 } }
];
const INITIAL_CONFIG: AppConfig = { adminPhone: '34631400010', googleSheetUrl: '', adminPassword: 'admin' };

/**
 * Función de clonación profunda segura que elimina referencias circulares
 * y maneja objetos específicos de Firebase como Timestamps.
 */
const safeClone = (obj: any) => {
  if (obj === null || typeof obj !== 'object') return obj;
  
  const cache = new WeakSet();
  
  const deepCopy = (item: any): any => {
    if (item === null || typeof item !== 'object') return item;
    
    // Manejo de Firebase Timestamps (comunes en doc.data())
    if (item && typeof item.toDate === 'function') {
      return item.toDate().getTime(); 
    }
    
    if (item instanceof Date) return item.getTime();
    
    // Prevención de circularidad
    if (cache.has(item)) return undefined;
    cache.add(item);
    
    if (Array.isArray(item)) {
      return item.map(deepCopy).filter(v => v !== undefined);
    }
    
    // Solo clonamos objetos planos para evitar instancias complejas
    const prototype = Object.getPrototypeOf(item);
    if (prototype !== null && prototype !== Object.prototype) {
      if (typeof item.toJSON === 'function') {
        return deepCopy(item.toJSON());
      }
      return undefined;
    }

    const copy: any = {};
    Object.keys(item).forEach(key => {
      const value = deepCopy(item[key]);
      if (value !== undefined) {
        copy[key] = value;
      }
    });
    return copy;
  };
  
  return deepCopy(obj);
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
    console.error("Error saving local storage data:", e); 
  }
};

export const StorageService = {
  // --- TOOLS ---
  getTools: (): ToolRecord[] => loadLocal(KEYS.TOOLS, []),
  
  addTool: async (tool: ToolRecord) => {
    const tools = loadLocal<ToolRecord[]>(KEYS.TOOLS, []);
    const updated = [tool, ...tools];
    saveLocal(KEYS.TOOLS, updated);
    try {
      await setDoc(doc(db, "tools", tool.id), safeClone(tool));
    } catch (e) { console.warn("Firebase Tool Sync failed", e); }
  },

  deleteTool: async (id: string) => {
    const tools = loadLocal<ToolRecord[]>(KEYS.TOOLS, []);
    const updated = tools.filter(t => t.id !== id);
    saveLocal(KEYS.TOOLS, updated);
    try {
      await deleteDoc(doc(db, "tools", id));
    } catch (e) { console.warn("Error deleting tool from FB", e); }
  },

  subscribeToTools: (callback: (tools: ToolRecord[]) => void) => {
    callback(loadLocal(KEYS.TOOLS, []));
    try {
      return onSnapshot(collection(db, "tools"), (snapshot) => {
        const tools = snapshot.docs.map(doc => doc.data() as ToolRecord);
        const sortedTools = [...tools].sort((a, b) => b.timestamp - a.timestamp);
        saveLocal(KEYS.TOOLS, sortedTools);
        callback(sortedTools);
      }, (error) => { console.warn("Firestore Tools access denied", error.message); });
    } catch (e) { return () => {}; }
  },

  // --- WORKERS ---
  getWorkers: (): Worker[] => loadLocal(KEYS.WORKERS, INITIAL_WORKERS),
  registerNewWorker: async (worker: Worker) => {
    const currentWorkers = loadLocal<Worker[]>(KEYS.WORKERS, INITIAL_WORKERS);
    saveLocal(KEYS.WORKERS, [...currentWorkers, worker]);
    try {
      await setDoc(doc(db, "workers", worker.id), safeClone(worker));
    } catch (e) { console.warn("Firebase Worker Sync failed", e); }
  },
  saveWorkers: async (workers: Worker[]) => {
    saveLocal(KEYS.WORKERS, workers);
    try { 
      await Promise.all(workers.map(w => setDoc(doc(db, "workers", w.id), safeClone(w)))); 
    } catch (e) { }
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
      }, (error) => { console.warn("Firestore Workers access denied", error.message); });
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
      }, (error) => { console.warn("Firestore Sites access denied", error.message); });
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
    try { await deleteDoc(doc(db, "admins", id)); } catch(e) { }
  },
  subscribeToAdmins: (callback: (admins: AdminUser[]) => void) => {
    callback(loadLocal(KEYS.ADMINS, []));
    try {
      return onSnapshot(collection(db, "admins"), (snapshot) => {
        const admins = snapshot.docs.map(doc => doc.data() as AdminUser);
        saveLocal(KEYS.ADMINS, admins);
        callback(admins);
      }, (error) => { console.warn("Firestore Admins access denied", error.message); });
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
        const sortedLogs = [...logs].sort((a, b) => b.timestamp - a.timestamp);
        saveLocal(KEYS.LOGS, sortedLogs);
        callback(sortedLogs);
      }, (error) => { console.warn("Firestore Logs access denied", error.message); });
    } catch (e) { return () => {}; }
  },

  // --- CONFIG ---
  getConfig: (): AppConfig => loadLocal(KEYS.CONFIG, INITIAL_CONFIG),
  saveConfig: (config: AppConfig) => saveLocal(KEYS.CONFIG, config),
  
  syncLog: async (log: WorkLog): Promise<boolean> => {
    const config = loadLocal<AppConfig>(KEYS.CONFIG, INITIAL_CONFIG);
    if (!config.googleSheetUrl) return false;
    try {
      const cleanedLog = safeClone(log);
      await fetch(config.googleSheetUrl, { 
        method: 'POST', 
        mode: 'no-cors', 
        body: JSON.stringify({ action: 'LOG', ...cleanedLog }) 
      });
      return true;
    } catch (error) { return false; }
  },

  exportToCSV: (logs: WorkLog[]): string => {
    const headers = ['ID', 'Trabajador', 'Obra', 'Tipo', 'Fecha', 'Hora', 'Modo', 'Reporte'];
    const rows = logs.map(l => [l.id, l.workerName, l.siteName, l.type, l.dateStr, l.timeStr, l.workMode || 'HORAS', `"${(l.workReport || '').replace(/"/g, '""')}"`]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
};
