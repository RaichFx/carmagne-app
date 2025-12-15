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

// *** IMPORTANTE: PEGA TU URL DE APPS SCRIPT AQUÍ ENTRE LAS COMILLAS ***
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

// Helper to remove undefined values for Firebase
const sanitizeForFirebase = (data: any) => {
  return JSON.parse(JSON.stringify(data));
};

// Service Methods
export const StorageService = {
  // --- WORKERS ---
  getWorkers: (): Worker[] => loadLocal(KEYS.WORKERS, INITIAL_WORKERS),
  
  registerNewWorker: async (worker: Worker) => {
    try {
      // 1. Guardar Trabajador en Firebase (Source of Truth)
      const cleanWorker = sanitizeForFirebase(worker);
      await setDoc(doc(db, "workers", worker.id), cleanWorker);

      // 2. CREAR LOG DE REGISTRO (Esto faltaba para que salga en el panel)
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

      // 3. Guardar Log en Firebase
      const cleanLog = sanitizeForFirebase(regLog);
      await setDoc(doc(db, "logs", regLog.id), cleanLog);

      // 4. Actualizar LocalStorage (Caché inmediata)
      const currentWorkers = loadLocal<Worker[]>(KEYS.WORKERS, INITIAL_WORKERS);
      saveLocal(KEYS.WORKERS, [...currentWorkers, worker]);

      const currentLogs = loadLocal<WorkLog[]>(KEYS.LOGS, []);
      saveLocal(KEYS.LOGS, [regLog, ...currentLogs]);

      // 5. Sincronizar con Sheets (Legacy/Backup)
      StorageService.syncWorkerToSheets(worker);

      console.log("Registro completado exitosamente");

    } catch (e: any) {
      console.error("Error crítico en registro:", e);
      throw new Error(`Error de base de datos: ${e.message}`);
    }
  },

  saveWorkers: async (workers: Worker[]) => {
    saveLocal(KEYS.WORKERS, workers);
    // Sync to Firebase (Update each worker doc)
    try {
      await Promise.all(workers.map(w => {
        const cleanW = sanitizeForFirebase(w);
        return setDoc(doc(db, "workers", w.id), cleanW);
      }));
    } catch (e) { console.error("Error syncing workers to FB", e); }
  },

  deleteWorker: async (id: string) => {
    // Local delete
    const workers = loadLocal<Worker[]>(KEYS.WORKERS, INITIAL_WORKERS);
    const updated = workers.filter(w => w.id !== id);
    saveLocal(KEYS.WORKERS, updated);

    // Firebase delete
    try {
      await deleteDoc(doc(db, "workers", id));
    } catch (e) { console.error("Error deleting worker from FB", e); }
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
    } catch (e) { console.error("Error syncing sites to FB", e); }
  },

  updateSite: async (updatedSite: Site) => {
    // Local Update
    const sites = loadLocal<Site[]>(KEYS.SITES, INITIAL_SITES);
    const updatedSites = sites.map(s => s.id === updatedSite.id ? updatedSite : s);
    saveLocal(KEYS.SITES, updatedSites);

    // Firebase Update
    try {
      const cleanSite = sanitizeForFirebase(updatedSite);
      await setDoc(doc(db, "sites", updatedSite.id), cleanSite);
    } catch (e) { console.error("Error updating site in FB", e); }
  },

  deleteSite: async (id: string) => {
    // Local delete
    const sites = loadLocal<Site[]>(KEYS.SITES, INITIAL_SITES);
    const updated = sites.filter(s => s.id !== id);
    saveLocal(KEYS.SITES, updated);

    // Firebase delete
    try {
      await deleteDoc(doc(db, "sites", id));
    } catch (e) { console.error("Error deleting site from FB", e); }
  },

  // --- ADMIN USERS (NEW) ---
  getAdmins: (): AdminUser[] => loadLocal(KEYS.ADMINS, INITIAL_ADMINS),

  addAdmin: async (admin: AdminUser) => {
    // Local Update
    const admins = loadLocal<AdminUser[]>(KEYS.ADMINS, INITIAL_ADMINS);
    saveLocal(KEYS.ADMINS, [...admins, admin]);

    // Firebase Update
    try {
      const cleanAdmin = sanitizeForFirebase(admin);
      await setDoc(doc(db, "admins", admin.id), cleanAdmin);
    } catch(e) { console.error("Error saving admin to FB", e); }
  },

  deleteAdmin: async (id: string) => {
    // Local Update
    const admins = loadLocal<AdminUser[]>(KEYS.ADMINS, INITIAL_ADMINS);
    const updated = admins.filter(a => a.id !== id);
    saveLocal(KEYS.ADMINS, updated);

    // Firebase Update
    try {
      await deleteDoc(doc(db, "admins", id));
    } catch(e) { console.error("Error deleting admin from FB", e); }
  },

  // --- LOGS (FICHAJES) ---
  getLogs: (): WorkLog[] => loadLocal(KEYS.LOGS, []),
  
  addLog: async (log: WorkLog) => {
    // 1. Save Local (Instant Feedback)
    const logs = loadLocal<WorkLog[]>(KEYS.LOGS, []);
    saveLocal(KEYS.LOGS, [log, ...logs]);

    // 2. Save to Firebase (Real-time Cloud)
    try {
      const cleanLog = sanitizeForFirebase(log);
      await setDoc(doc(db, "logs", log.id), cleanLog);
    } catch (e: any) {
      console.error("Firebase Add Error", e);
      throw new Error(`Error guardando fichaje: ${e.message}`);
    }
  },

  updateLog: async (updatedLog: WorkLog) => {
    // Local Update
    const logs = loadLocal<WorkLog[]>(KEYS.LOGS, []);
    const newLogs = logs.map(l => l.id === updatedLog.id ? updatedLog : l);
    saveLocal(KEYS.LOGS, newLogs);

    // Firebase Update
    try {
      const cleanLog = sanitizeForFirebase(updatedLog);
      const logRef = doc(db, "logs", updatedLog.id);
      await updateDoc(logRef, cleanLog);
    } catch (e) { console.error("Firebase Update Error", e); }
  },

  // --- CONFIG ---
  getConfig: (): AppConfig => loadLocal(KEYS.CONFIG, INITIAL_CONFIG),
  saveConfig: (config: AppConfig) => saveLocal(KEYS.CONFIG, config),
  
  // --- SYNC HELPERS (Google Sheets Legacy) ---
  syncLog: async (log: WorkLog): Promise<boolean> => {
    const config = loadLocal<AppConfig>(KEYS.CONFIG, INITIAL_CONFIG);
    // Prioridad: Configuración guardada > Constante Hardcodeada
    const url = config.googleSheetUrl || GOOGLE_SCRIPT_URL;
    
    if (!url || url.length < 10) {
      return false;
    }

    try {
      await fetch(url, {
        method: 'POST', 
        mode: 'no-cors', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'LOG', ...log })
      });
      return true;
    } catch (error) { 
      return false; 
    }
  },

  syncWorkerToSheets: async (worker: Worker): Promise<boolean> => {
    const config = loadLocal<AppConfig>(KEYS.CONFIG, INITIAL_CONFIG);
    const url = config.googleSheetUrl || GOOGLE_SCRIPT_URL;
    
    if (!url || url.length < 10) {
      return false;
    }

    try {
      await fetch(url, {
        method: 'POST', 
        mode: 'no-cors', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REGISTER', worker: worker })
      });
      return true;
    } catch (error) { 
      return false; 
    }
  },
  
  // Helper for sheets
  syncWorker: async (worker: Worker) => {
     return StorageService.syncWorkerToSheets(worker);
  },

  // --- REAL-TIME LISTENERS ---
  
  // Escuchar Fichajes (Para Admin y App)
  subscribeToLogs: (callback: (logs: WorkLog[]) => void) => {
    // Usamos query simple para evitar errores de índice, ordenamos en cliente
    const q = collection(db, "logs");
    return onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map(doc => doc.data() as WorkLog);
      // Ordenar por fecha descendente
      logs.sort((a, b) => b.timestamp - a.timestamp);
      
      saveLocal(KEYS.LOGS, logs);
      callback(logs);
    }, (error) => {
       console.error("Error subscribing to logs", error);
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

  // Escuchar Admins (Solo AdminPanel)
  subscribeToAdmins: (callback: (admins: AdminUser[]) => void) => {
    return onSnapshot(collection(db, "admins"), (snapshot) => {
       const admins = snapshot.docs.map(doc => doc.data() as AdminUser);
       saveLocal(KEYS.ADMINS, admins);
       callback(admins);
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