
import React, { useState, useEffect, useMemo } from 'react';
import { 
  User, MapPin, CheckCircle, 
  LogOut, Coffee, ArrowRight, ShieldAlert, Lock, Fingerprint, Delete, UserPlus, Save, ChevronLeft, Calendar, History, Clock, Smartphone, X, Mic, MicOff, FileText, Cloud, ExternalLink, Briefcase, Phone, KeyRound, BellRing, Search, Download, CalendarDays, Zap, Wrench, Package, Info, Plus, Trash2, Timer, Filter, ChevronDown, Shield, AlertTriangle, AlertCircle, CheckCircle2
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { StorageService, ELECTRICAL_TOOLS_LIST, ELECTRICAL_BRANDS_LIST } from './services/storageService';
import { LocationService } from './services/locationService';
import { TelegramService } from './services/telegramService';
import { Worker, Site, WorkLog, LogType, GeoLocationData, WorkMode, AdminUser, ToolRecord, AppConfig, WeeklyReport } from './types';
import { AdminPanel } from './components/AdminPanel';
import { InstallTutorial } from './components/InstallTutorial';
import { ConfirmationModal } from './components/ConfirmationModal';
import { WeeklyReportModal } from './components/WeeklyReportModal';
import { WeeklyReportService } from './services/weeklyReportService';

enum Step {
  LOGIN_PHONE = 0,
  WORKER_DASHBOARD = 15,
  WORKER_HISTORY = 16,
  WORKER_TOOLS = 17,
  WORKER_WEEKLY_HISTORY = 18,
  SELECT_SITE = 2,
  SELECT_ACTION = 3,
  REPORT_EXIT = 4, 
  SUCCESS = 5,
  REGISTER = 99,
  RECOVERY = 100
}

const MAX_DISTANCE_METERS = 500;
const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const formatMsToTime = (ms: number) => {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const calculateTotalsFromLogs = (logs: WorkLog[]) => {
  const sorted = [...logs].sort((a, b) => a.timestamp - b.timestamp);
  let totalWork = 0;
  let totalBreak = 0;
  let lastWorkStart: number | null = null;
  let lastBreakStart: number | null = null;
  let currentState: LogType | null = null;

  sorted.forEach(log => {
    if (log.type === LogType.ENTRADA || log.type === LogType.FIN_DESCANSO) {
      if (lastBreakStart && currentState === LogType.INICIO_DESCANSO) {
        totalBreak += Math.max(0, log.timestamp - lastBreakStart);
      }
      lastBreakStart = null;
      lastWorkStart = log.timestamp;
      currentState = log.type;
    } else if (log.type === LogType.INICIO_DESCANSO) {
      if (lastWorkStart && (currentState === LogType.ENTRADA || currentState === LogType.FIN_DESCANSO)) {
        totalWork += Math.max(0, log.timestamp - lastWorkStart);
      }
      lastWorkStart = null;
      lastBreakStart = log.timestamp;
      currentState = log.type;
    } else if (log.type === LogType.SALIDA) {
      if (lastWorkStart && (currentState === LogType.ENTRADA || currentState === LogType.FIN_DESCANSO)) {
        totalWork += Math.max(0, log.timestamp - lastWorkStart);
      }
      if (lastBreakStart && currentState === LogType.INICIO_DESCANSO) {
        totalBreak += Math.max(0, log.timestamp - lastBreakStart);
      }
      lastWorkStart = null;
      lastBreakStart = null;
      currentState = LogType.SALIDA;
    }
  });

  const isOngoing = currentState !== null && currentState !== LogType.SALIDA;
  if (isOngoing) {
    const now = Date.now();
    const isToday = logs.length > 0 && logs.some(l => l.dateStr === new Date().toLocaleDateString('es-ES'));
    if (isToday) {
      if (lastWorkStart) totalWork += Math.max(0, now - lastWorkStart);
      if (lastBreakStart) totalBreak += Math.max(0, now - lastBreakStart);
    }
  }
  return { totalWork, totalBreak, isOngoing };
};

const AppLogo = ({ className, size = "md", logoUrl, scale = 1.0 }: { className?: string, size?: "sm" | "md" | "lg", logoUrl?: string, scale?: number }) => {
  const baseSize = size === "sm" ? 28 : size === "md" ? 64 : size === "lg" ? 140 : 64;
  const iconSize = baseSize * scale;
  if (logoUrl) {
    return (
      <div className={`relative flex items-center justify-center ${className}`}>
        <img src={logoUrl} alt="Company Logo" style={{ width: iconSize, height: iconSize }} className="object-contain rounded-2xl drop-shadow-[0_0_15px_rgba(59,130,246,0.4)]"/>
      </div>
    );
  }
  return (
    <div className={`relative flex items-center justify-center ${className} text-blue-500`}>
      <Zap size={iconSize} className="drop-shadow-[0_0_20px_rgba(59,130,246,0.6)] fill-blue-500/20" strokeWidth={2.5}/>
    </div>
  );
};

export const App: React.FC = () => {
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentAdminUser, setCurrentAdminUser] = useState<AdminUser | null>(null);
  const [currentStep, setCurrentStep] = useState<Step>(Step.LOGIN_PHONE);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminUsernameInput, setAdminUsernameInput] = useState(''); 
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminError, setAdminError] = useState('');
  const [loginPhone, setLoginPhone] = useState('');
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmState, setConfirmState] = useState<{isOpen: boolean; action: LogType | null;}>({ isOpen: false, action: null });
  const [currentTime, setCurrentTime] = useState(new Date());
  const [appConfig, setAppConfig] = useState<AppConfig>(StorageService.getConfig());
  
  // History and Tools state
  const [historySearch, setHistorySearch] = useState('');
  const [toolSearch, setToolSearch] = useState('');
  const [historyPeriod, setHistoryPeriod] = useState<'ALL' | 'DAY' | 'WEEK' | 'MONTH'>('ALL');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [allTools, setAllTools] = useState<ToolRecord[]>([]);
  
  // New Tool Form State
  const [isToolModalOpen, setIsToolModalOpen] = useState(false);
  const [newToolForm, setNewToolForm] = useState({ name: '', brand: '', model: '' });
  
  const [exitReportText, setExitReportText] = useState('');
  const [exitWorkMode, setExitWorkMode] = useState<WorkMode>('HORAS');
  const [pinInput, setPinInput] = useState('');
  const [regName, setRegName] = useState('');
  const [regDni, setRegDni] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPin, setRegPin] = useState('');
  const [regPinConfirm, setRegPinConfirm] = useState('');
  const [workerLogs, setWorkerLogs] = useState<WorkLog[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [weeklyReports, setWeeklyReports] = useState<WeeklyReport[]>([]);
  const [showWeeklyReportModal, setShowWeeklyReportModal] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsAppLoading(false), 2000);
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    
    // Load data from storage
    const storedWorkers = StorageService.getWorkers();
    setWorkers(storedWorkers);
    setSites(StorageService.getSites());
    setWorkerLogs(StorageService.getLogs()); 
    setAdmins(StorageService.getAdmins());
    setAllTools(StorageService.getTools());
    setAppConfig(StorageService.getConfig());
    setWeeklyReports(StorageService.getWeeklyReports());

    // Check for existing session
    const savedWorkerId = localStorage.getItem('carmagne_session_worker_id');
    if (savedWorkerId) {
      const worker = storedWorkers.find(w => w.id === savedWorkerId);
      if (worker && worker.active) {
        setSelectedWorker(worker);
        setCurrentStep(Step.WORKER_DASHBOARD);
      }
    }

    const unsubWorkers = StorageService.subscribeToWorkers((ws) => {
      setWorkers(ws);
      // Update session if worker data changed
      const currentId = localStorage.getItem('carmagne_session_worker_id');
      if (currentId) {
        const found = ws.find(w => w.id === currentId);
        if (found) setSelectedWorker(found);
      }
    });
    const unsubSites = StorageService.subscribeToSites(setSites);
    const unsubLogs = StorageService.subscribeToLogs(setWorkerLogs);
    const unsubAdmins = StorageService.subscribeToAdmins(setAdmins);
    const unsubTools = StorageService.subscribeToTools(setAllTools);
    const unsubConfig = StorageService.subscribeToConfig(setAppConfig);
    const unsubWeekly = StorageService.subscribeToWeeklyReports(setWeeklyReports);
    return () => {
      clearTimeout(timer); clearInterval(interval);
      unsubWorkers(); unsubSites(); unsubLogs(); unsubAdmins(); unsubTools(); unsubConfig(); unsubWeekly();
    };
  }, []);

  // Worker tools filtered list
  const workerTools = useMemo(() => {
    if (!selectedWorker) return [];
    let base = allTools.filter(t => t.workerId === selectedWorker.id);
    if (toolSearch) {
      const q = toolSearch.toLowerCase();
      base = base.filter(t => t.toolName.toLowerCase().includes(q) || t.brand.toLowerCase().includes(q));
    }
    return base;
  }, [allTools, selectedWorker, toolSearch]);

  const filteredHistory = useMemo(() => {
    if (!selectedWorker) return [];
    let baseHistory = workerLogs.filter(l => l.workerId === selectedWorker.id);
    if (historyPeriod === 'DAY') {
      const pickedDateStr = new Date(selectedDate).toLocaleDateString('es-ES');
      baseHistory = baseHistory.filter(l => l.dateStr === pickedDateStr);
    } else if (historyPeriod === 'WEEK') {
      const pickedDate = new Date(selectedDate);
      const day = pickedDate.getDay();
      const diffToMonday = pickedDate.getDate() - day + (day === 0 ? -6 : 1);
      const startOfWeek = new Date(pickedDate);
      startOfWeek.setDate(diffToMonday);
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);
      baseHistory = baseHistory.filter(l => l.timestamp >= startOfWeek.getTime() && l.timestamp <= endOfWeek.getTime());
    } else if (historyPeriod === 'MONTH') {
      baseHistory = baseHistory.filter(l => {
        const logDate = new Date(l.timestamp);
        return logDate.getMonth() === selectedMonth && logDate.getFullYear() === new Date().getFullYear();
      });
    }
    if (historySearch) {
      const q = historySearch.toLowerCase();
      baseHistory = baseHistory.filter(l => l.siteName.toLowerCase().includes(q) || (l.workReport || '').toLowerCase().includes(q));
    }
    return baseHistory;
  }, [workerLogs, selectedWorker, historySearch, historyPeriod, selectedMonth, selectedDate]);

  const historyTotals = useMemo(() => calculateTotalsFromLogs(filteredHistory), [filteredHistory, currentTime]);

  const handleDownloadPDF = () => {
    if (!selectedWorker) return;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text("Historial de Actividad - CARMAGNE INSTAL SL", 105, 15, { align: 'center' });
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 30, 182, 20, 2, 2, 'F');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(`Trabajo Neto: ${formatMsToTime(historyTotals.totalWork)} | Descanso: ${formatMsToTime(historyTotals.totalBreak)} | Total: ${formatMsToTime(historyTotals.totalWork + historyTotals.totalBreak)}`, 20, 42);
    const tableData = filteredHistory.map(l => [l.dateStr, l.timeStr, l.type, l.siteName, l.workMode || 'HORAS', l.workReport || '-']);
    autoTable(doc, {
      startY: 55, head: [['Fecha', 'Hora', 'Acción', 'Obra', 'Modo', 'Reporte']], body: tableData,
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' }, styles: { fontSize: 8 }
    });
    doc.save(`Historial_${selectedWorker.name.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`);
  };

  const processSpanishPhone = (phone: string): string => {
    let cleaned = phone.trim().replace(/\s/g, '');
    if (cleaned.startsWith('0034')) cleaned = '+34' + cleaned.slice(4);
    if (cleaned.length === 9 && /^[6789]/.test(cleaned)) cleaned = '+34' + cleaned;
    if (cleaned.startsWith('34') && cleaned.length === 11) cleaned = '+' + cleaned;
    return cleaned;
  };
  const isPhoneValidSpain = (phone: string): boolean => /^\+34[6789]\d{8}$/.test(phone);

  const workerStatus = useMemo(() => {
    if (!selectedWorker) return null;
    const today = new Date().toLocaleDateString('es-ES');
    const allTodayLogs = workerLogs.filter(l => l.workerId === selectedWorker.id && l.dateStr === today).slice().reverse();
    let lastSalidaIndex = -1;
    for (let i = allTodayLogs.length - 1; i >= 0; i--) { if (allTodayLogs[i].type === LogType.SALIDA) { lastSalidaIndex = i; break; } }
    const currentSessionLogs = lastSalidaIndex === -1 ? allTodayLogs : allTodayLogs.slice(lastSalidaIndex + 1);
    let accumulatedWorkTime = 0; let accumulatedBreakTime = 0;
    let currentWorkStart: number | null = null; let currentBreakStart: number | null = null;
    let currentState: 'INACTIVO' | 'TRABAJANDO' | 'DESCANSO' = 'INACTIVO';
    let currentSite = null; let currentSiteId = null;
    for (const log of currentSessionLogs) {
      if (log.type === LogType.ENTRADA || log.type === LogType.FIN_DESCANSO) {
        if (currentBreakStart) { accumulatedBreakTime += (log.timestamp - currentBreakStart); currentBreakStart = null; }
        currentWorkStart = log.timestamp; currentState = 'TRABAJANDO'; currentSite = log.siteName; currentSiteId = log.siteId;
      } else if (log.type === LogType.INICIO_DESCANSO) {
        if (currentWorkStart) { accumulatedWorkTime += (log.timestamp - currentWorkStart); currentWorkStart = null; }
        currentBreakStart = log.timestamp; currentState = 'DESCANSO'; currentSite = log.siteName; currentSiteId = log.siteId;
      }
    }
    return { type: currentState, site: currentSite, siteId: currentSiteId, accumulatedWorkTime, currentWorkStart, accumulatedBreakTime, currentBreakStart };
  }, [workerLogs, selectedWorker]);

  const getEffectiveWorkTime = () => {
    if (!workerStatus) return 0;
    let total = workerStatus.accumulatedWorkTime;
    if (workerStatus.type === 'TRABAJANDO' && workerStatus.currentWorkStart) total += (currentTime.getTime() - workerStatus.currentWorkStart);
    return total;
  };
  const getEffectiveBreakTime = () => {
    if (!workerStatus) return 0;
    let total = workerStatus.accumulatedBreakTime;
    if (workerStatus.type === 'DESCANSO' && workerStatus.currentBreakStart) total += (currentTime.getTime() - workerStatus.currentBreakStart);
    return total;
  };

  const handlePhoneLogin = () => {
    const formattedPhone = processSpanishPhone(loginPhone);
    if(!isPhoneValidSpain(formattedPhone)) { setError("Solo se permiten números de España (+34)"); return; }
    const worker = workers.find(w => w.phone && processSpanishPhone(w.phone) === formattedPhone);
    if (worker) {
      if (!worker.active) { setError("Cuenta desactivada."); return; }
      setSelectedWorker(worker); 
      localStorage.setItem('carmagne_session_worker_id', worker.id);
      setError(''); 
      setCurrentStep(Step.WORKER_DASHBOARD);
    } else if(confirm("Este número no está registrado. ¿Quieres crear una cuenta nueva?")) {
      setRegPhone(formattedPhone); setError(''); setCurrentStep(Step.REGISTER);
    }
  };

  const handleAddWorkerTool = async () => {
    if (!newToolForm.name || !newToolForm.brand || !selectedWorker) return;
    const tool: ToolRecord = {
      id: `T-W-${Date.now()}`,
      workerId: selectedWorker.id,
      workerName: selectedWorker.name,
      toolName: newToolForm.name,
      brand: newToolForm.brand,
      model: newToolForm.model,
      timestamp: Date.now(),
      dateStr: new Date().toLocaleDateString('es-ES'),
      timeStr: new Date().toLocaleTimeString('es-ES')
    };
    await StorageService.addTool(tool);

    // Notificación Telegram: Nueva Herramienta
    const telegramMessage = `🛠️ <b>Nueva Herramienta Registrada</b>\n👷‍♂️ Operario: <b>${selectedWorker.name}</b>\n🔧 Equipo: <b>${tool.toolName}</b>\n🏷️ Marca: ${tool.brand}\n📦 Modelo: ${tool.model || 'S/M'}`;
    TelegramService.enviarNotificacionTelegram(telegramMessage);

    setNewToolForm({ name: '', brand: '', model: '' });
    setIsToolModalOpen(false);
  };

  const handleRegistration = async () => {
    const fPhone = processSpanishPhone(regPhone);
    if (!regName || !regDni || !fPhone) { setError('Campos obligatorios.'); return; }
    if (!isPhoneValidSpain(fPhone)) { setError('Solo números de España (+34)'); return; }
    setLoading(true);
    const newWorker: Worker = { id: `W${Date.now()}`, name: regName, dni: regDni, phone: fPhone, pin: '0000', qrCode: `QR_${Date.now()}`, active: true, defaultMode: 'HORAS' };
    try { 
      await StorageService.registerNewWorker(newWorker); 
      setSelectedWorker(newWorker); 
      localStorage.setItem('carmagne_session_worker_id', newWorker.id);

      // Notificación Telegram: Nuevo Operario
      const telegramMessage = `🆕 <b>Nuevo Operario Registrado</b>\n👷‍♂️ Nombre: <b>${newWorker.name}</b>\n🆔 DNI: ${newWorker.dni}\n📱 Teléfono: ${newWorker.phone}`;
      TelegramService.enviarNotificacionTelegram(telegramMessage);

      setCurrentStep(Step.WORKER_DASHBOARD); 
    } catch (err) { setError('Error al registrar.'); } finally { setLoading(false); }
  };

  const handlePinInput = (digit: string) => {
    if (pinInput.length < 4) {
      const newPin = pinInput + digit;
      setPinInput(newPin);
      if (newPin.length === 4) {
        if (selectedWorker?.pin === newPin) { setCurrentStep(Step.WORKER_DASHBOARD); setError(''); }
        else { setError('PIN Incorrecto'); setTimeout(() => setPinInput(''), 500); }
      }
    }
  };

  const handleActionSelect = (type: LogType) => {
    if (type === LogType.SALIDA) {
      if (workerStatus?.type === 'DESCANSO') { setError("Primero debes finalizar el descanso antes de dar salida."); return; }
      setCurrentStep(Step.REPORT_EXIT); return;
    }
    setConfirmState({ isOpen: true, action: type });
  };

  const executeLogSubmission = async (type: LogType, report?: string, mode?: WorkMode) => {
    setLoading(true);
    let loc: GeoLocationData | null = null;
    try {
      loc = await LocationService.getCurrentPosition();
    } catch (err) {
      console.warn("Ubicación no disponible para el fichaje:", err);
    }

    try {
      let distance = 0; let warning = false;
      const targetSite = selectedSite || sites.find(s => s.name === workerStatus?.site);
      
      if (loc && targetSite?.coordinates) {
        distance = LocationService.calculateDistance(loc.latitude, loc.longitude, targetSite.coordinates.latitude, targetSite.coordinates.longitude);
        if (distance > MAX_DISTANCE_METERS) warning = true;
      }

      const now = new Date();
      const actualLoc = loc || { latitude: 0, longitude: 0, accuracy: 0, address: 'Ubicación no disponible' };
      
      const newLog: WorkLog = { 
        id: `LOG-${Date.now()}`, 
        workerId: selectedWorker!.id, 
        workerName: selectedWorker!.name, 
        siteId: targetSite?.id || 'UNKNOWN', 
        siteName: targetSite?.name || workerStatus?.site || 'UNKNOWN', 
        type, 
        timestamp: Date.now(), 
        dateStr: now.toLocaleDateString('es-ES'), 
        timeStr: now.toLocaleTimeString('es-ES'), 
        location: actualLoc, 
        sentToWhatsapp: false, 
        syncedToSheets: false, 
        distanceMeters: distance, 
        locationWarning: warning, 
        workReport: report, 
        workMode: mode 
      };
      
      await StorageService.addLog(newLog); 
      
      // Send Telegram Notification
      const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      const actionEmoji = type === LogType.ENTRADA ? '🚀' : type === LogType.SALIDA ? '🏠' : type === LogType.INICIO_DESCANSO ? '☕' : '⚙️';
      
      let locationText = '📍 Ubicación: No disponible';
      if (loc) {
        locationText = `📍 Ubicación: <a href="https://www.google.com/maps?q=${loc.latitude},${loc.longitude}">Ver en Google Maps</a>`;
      }

      const telegramMessage = `👷‍♂️ <b>${selectedWorker!.name}</b> ha marcado <b>${type}</b> a las <b>${timeStr}</b> ${actionEmoji}\n🏢 Obra: ${newLog.siteName}${report ? `\n📝 Reporte: ${report}` : ''}\n${locationText}`;
      
      TelegramService.enviarNotificacionTelegram(telegramMessage);

      setExitReportText('');
      setCurrentStep(Step.SUCCESS);
    } catch (err) { 
      setError('Error al registrar el fichaje.'); 
    } finally { 
      setLoading(false); 
      setConfirmState({ isOpen: false, action: null }); 
    }
  };

  const resetApp = () => { 
    localStorage.removeItem('carmagne_session_worker_id');
    setCurrentStep(Step.LOGIN_PHONE); 
    setSelectedWorker(null); 
    setSelectedSite(null); 
    setError(''); 
    setPinInput(''); 
    setLoginPhone(''); 
  };

  // Fix: Added the missing verifyAdminPassword function to handle admin panel authentication
  const verifyAdminPassword = () => {
    if (adminUsernameInput === 'admin' && adminPasswordInput === appConfig.adminPassword) {
      setIsAdmin(true);
      setCurrentAdminUser(null);
      setShowAdminLogin(false);
      setAdminError('');
      return;
    }

    const matchedAdmin = admins.find(a => a.username === adminUsernameInput && a.password === adminPasswordInput);
    if (matchedAdmin) {
      setIsAdmin(true);
      setCurrentAdminUser(matchedAdmin);
      setShowAdminLogin(false);
      setAdminError('');
    } else {
      setAdminError('Credenciales incorrectas');
    }
  };

  const renderWorkerDashboard = () => (
    <div className="flex flex-col gap-4 animate-fadeIn h-full overflow-hidden">
      <div className="flex justify-between items-center h-12 shrink-0">
        <div className="flex flex-col"><span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Trabajador</span><span className="text-lg font-black text-white leading-none">{selectedWorker?.name}</span></div>
        <button onClick={resetApp} className="text-slate-400 p-2.5 bg-slate-900 rounded-xl border border-slate-800"><LogOut size={18} /></button>
      </div>
      <div className={`rounded-3xl p-5 shadow-xl relative overflow-hidden flex flex-col gap-4 border border-white/5 transition-colors duration-500 ${workerStatus?.type === 'TRABAJANDO' ? 'bg-gradient-to-r from-emerald-600 to-teal-800' : workerStatus?.type === 'DESCANSO' ? 'bg-gradient-to-r from-amber-500/80 to-orange-700/80' : 'bg-gradient-to-r from-blue-600 to-indigo-800'}`}>
         <div className="relative z-10 flex items-center justify-between">
           <div className="flex items-center gap-4">
              <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-md">
                {workerStatus?.type === 'TRABAJANDO' ? <Zap size={28} className="text-white fill-white/20" /> : workerStatus?.type === 'DESCANSO' ? <Coffee size={28} className="text-white" /> : <Clock size={28} className="text-white" />}
              </div>
              <div>
                <h2 className="text-xl font-black text-white leading-none">{workerStatus?.type === 'TRABAJANDO' ? 'Trabajando' : workerStatus?.type === 'DESCANSO' ? 'En Pausa' : 'Sin Obra'}</h2>
                {workerStatus?.site && <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest mt-1 flex items-center gap-1"><MapPin size={10} /> {workerStatus.site}</p>}
              </div>
           </div>
         </div>
         <div className="relative z-10 flex flex-col gap-2">
            <div className="flex justify-between items-end bg-black/20 p-4 rounded-2xl backdrop-blur-sm border border-white/10">
               <div className="flex flex-col"><span className="text-[8px] font-black text-white/50 uppercase tracking-widest">Tiempo de Trabajo</span><span className={`text-2xl font-mono font-black text-white ${workerStatus?.type === 'TRABAJANDO' ? 'animate-pulse' : ''}`}>{formatMsToTime(getEffectiveWorkTime())}</span></div>
            </div>
            {(getEffectiveBreakTime() > 0 || workerStatus?.type === 'DESCANSO') && (
              <div className="flex justify-between items-center bg-amber-900/40 p-3 rounded-xl border border-amber-500/20">
                <div className="flex items-center gap-2"><Coffee size={14} className="text-amber-400" /><span className="text-[9px] font-black text-amber-200 uppercase tracking-widest">Tiempo de Descanso</span></div>
                <span className={`text-sm font-mono font-black text-amber-400 ${workerStatus?.type === 'DESCANSO' ? 'animate-pulse' : ''}`}>{formatMsToTime(getEffectiveBreakTime())}</span>
              </div>
            )}
         </div>
      </div>
      <div className="grid grid-cols-1 gap-3 flex-1 overflow-hidden">
         {(() => {
           const range = WeeklyReportService.getWeekRange(new Date());
           const submitted = weeklyReports.some(r => r.workerId === selectedWorker?.id && r.weekStart === range.start);
           const todayDow = new Date().getDay(); // 0 sun, 5 fri, 6 sat
           const showReminder = !submitted && (todayDow === 5 || todayDow === 6 || todayDow === 0);
           if (!showReminder) return null;
           return (
             <div data-testid="weekly-report-reminder" className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 flex items-center gap-3 animate-fadeIn">
               <div className="p-2 bg-amber-500/20 rounded-xl text-amber-400 shrink-0"><AlertTriangle size={16} /></div>
               <div className="flex-1 min-w-0">
                 <p className="text-[11px] font-black text-amber-200 uppercase tracking-tight leading-tight">No has enviado tu parte semanal</p>
                 <p className="text-[9px] text-amber-400/80 font-bold uppercase tracking-widest mt-0.5">Recuerda enviarlo antes del lunes</p>
               </div>
               <button onClick={() => setShowWeeklyReportModal(true)} className="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-[10px] font-black uppercase tracking-widest shrink-0 active:scale-95 transition" data-testid="reminder-enviar-btn">Enviar</button>
             </div>
           );
         })()}
         <button onClick={() => setCurrentStep(Step.SELECT_SITE)} className="group bg-slate-900 border border-slate-800 p-5 rounded-[2rem] flex items-center justify-between shadow-lg active:scale-95 transition-all">
           <div><span className="block text-xl font-black text-white">Nuevo Fichaje</span><span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Registrar Movimiento</span></div>
           <div className="bg-blue-600/10 p-4 rounded-2xl text-blue-500"><Timer size={28} /></div>
         </button>
         <div className="grid grid-cols-[1fr_auto] gap-2">
           <button
             data-testid="weekly-report-btn"
             onClick={() => setShowWeeklyReportModal(true)}
             className="group bg-gradient-to-br from-indigo-900/60 to-purple-900/40 border border-indigo-500/20 p-5 rounded-[2rem] flex items-center justify-between shadow-lg active:scale-95 transition-all"
           >
             <div className="text-left">
               <span className="block text-xl font-black text-white flex items-center gap-2">
                 Parte Semanal
                 <span className="px-1.5 py-0.5 bg-indigo-500/20 border border-indigo-400/30 rounded-md text-[8px] font-black text-indigo-300 uppercase tracking-widest">IA</span>
               </span>
               <span className="text-indigo-300/70 text-[10px] font-bold uppercase tracking-widest">Foto o archivo → extracción auto</span>
             </div>
             <div className="bg-indigo-500/10 p-4 rounded-2xl text-indigo-400"><FileText size={28} /></div>
           </button>
           <button
             data-testid="my-weekly-reports-btn"
             onClick={() => setCurrentStep(Step.WORKER_WEEKLY_HISTORY)}
             title="Mis partes anteriores"
             className="bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/40 rounded-[2rem] flex flex-col items-center justify-center gap-1 px-4 active:scale-95 transition-all text-slate-400 hover:text-indigo-400"
           >
             <History size={20} />
             <span className="text-[8px] font-black uppercase tracking-widest">Mis Partes</span>
           </button>
         </div>
         <div className="grid grid-cols-2 gap-3">
           <button onClick={() => setCurrentStep(Step.WORKER_HISTORY)} className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col items-center justify-center gap-2 active:bg-slate-800"><div className="text-emerald-500"><History size={24} /></div><span className="text-xs font-black text-white uppercase tracking-widest">Historial</span></button>
           <button onClick={() => setCurrentStep(Step.WORKER_TOOLS)} className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col items-center justify-center gap-2 active:bg-slate-800"><div className="text-amber-500"><Wrench size={24} /></div><span className="text-xs font-black text-white uppercase tracking-widest">Equipos</span></button>
         </div>
      </div>
    </div>
  );

  const renderStep = () => {
    switch(currentStep) {
      case Step.LOGIN_PHONE: return (
        <div className="flex flex-col h-full animate-fadeIn justify-center gap-8 py-4">
          <div className="text-center"><div className="inline-flex mb-8"><AppLogo size="lg" logoUrl={appConfig.logoUrl} scale={appConfig.logoScaleLogin} /></div><h2 className="text-3xl font-black text-white tracking-tighter uppercase">CARMAGNE INSTAL SL</h2><p className="text-slate-500 text-xs font-bold uppercase tracking-[0.2em]">Acceso Operario</p></div>
          <div className="bg-slate-900/50 p-6 rounded-[2.5rem] border border-slate-800"><input type="tel" value={loginPhone} onChange={(e) => setLoginPhone(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl p-5 text-2xl font-black focus:border-blue-500 outline-none text-center tracking-widest" placeholder="600000000"/><button onClick={handlePhoneLogin} className="w-full bg-blue-600 text-white font-black py-5 rounded-2xl shadow-lg mt-6 flex items-center justify-center gap-3 active:scale-95 uppercase text-xs tracking-widest">Entrar <ArrowRight size={16} /></button></div>
          <button onClick={() => setShowAdminLogin(true)} className="text-slate-800 text-[10px] font-black uppercase tracking-[0.4em] text-center">Admin Panel</button>
        </div>
      );
      case Step.WORKER_DASHBOARD: return renderWorkerDashboard();
      case Step.SELECT_SITE: return (
        <div className="flex flex-col h-full animate-fadeIn overflow-hidden">
           <div className="flex items-center gap-4 mb-4 shrink-0"><button onClick={() => setCurrentStep(Step.WORKER_DASHBOARD)} className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 text-slate-400"><ChevronLeft size={20}/></button><h2 className="text-xl font-black text-white">Selecciona Obra</h2></div>
           <div className="flex-1 overflow-y-auto space-y-3 pb-4 custom-scrollbar">{sites.map(site => { const isActiveSite = workerStatus?.siteId === site.id; const isLocked = workerStatus?.type !== 'INACTIVO' && !isActiveSite; return (<button key={site.id} disabled={isLocked} onClick={() => { if (isLocked) return; setSelectedSite(site); setCurrentStep(Step.SELECT_ACTION); }} className={`w-full p-4 rounded-[1.5rem] border text-left transition-all ${isActiveSite ? 'bg-blue-600/20 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : isLocked ? 'bg-slate-900/30 border-slate-900 opacity-40 grayscale' : 'bg-slate-900 border-slate-800 hover:border-blue-500 active:scale-95'}`}><div className="flex justify-between items-start"><div className="max-w-[75%]"><h3 className="font-black text-white text-sm uppercase tracking-tight">{site.name}</h3><p className="text-[9px] text-slate-500 truncate uppercase font-bold mt-1">{site.address}</p></div>{isActiveSite && (<span className="bg-blue-600 text-white text-[8px] font-black px-2 py-1 rounded-full uppercase tracking-widest shadow-lg">Sesión Activa</span>)}</div></button>); })}</div>
        </div>
      );
      case Step.SELECT_ACTION: return (
        <div className="flex flex-col h-full animate-fadeIn overflow-hidden">
           <div className="flex items-center gap-4 mb-6 shrink-0"><button onClick={() => setCurrentStep(Step.SELECT_SITE)} className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 text-slate-400"><ChevronLeft size={20}/></button><div><h2 className="text-xl font-black text-white">Acción en Obra</h2><p className="text-[10px] text-blue-500 font-bold uppercase tracking-widest">{selectedSite?.name || workerStatus?.site}</p></div></div>
           <div className="grid grid-cols-2 gap-3 flex-1 pb-4">
             <button disabled={workerStatus?.type !== 'INACTIVO'} onClick={() => handleActionSelect(LogType.ENTRADA)} className={`bg-emerald-600/10 border border-emerald-500/20 rounded-[2rem] flex flex-col items-center justify-center gap-3 text-emerald-500 active:bg-emerald-600 active:text-white transition-all ${(workerStatus?.type !== 'INACTIVO') ? 'opacity-40 grayscale pointer-events-none' : ''}`}><Zap size={32} /> <span className="text-sm font-black uppercase">Entrada</span></button>
             <button disabled={workerStatus?.type === 'INACTIVO' || workerStatus?.type === 'DESCANSO'} onClick={() => handleActionSelect(LogType.SALIDA)} className={`bg-rose-600/10 border border-rose-500/20 rounded-[2rem] flex flex-col items-center justify-center gap-3 text-rose-500 active:bg-rose-600 active:text-white transition-all ${(workerStatus?.type === 'INACTIVO' || workerStatus?.type === 'DESCANSO') ? 'opacity-40 grayscale pointer-events-none' : ''}`}><LogOut size={32} /> <span className="text-sm font-black uppercase">Salida</span></button>
             <button disabled={workerStatus?.type !== 'TRABAJANDO'} onClick={() => handleActionSelect(LogType.INICIO_DESCANSO)} className={`bg-amber-600/10 border border-amber-500/20 rounded-[2rem] flex flex-col items-center justify-center gap-3 text-amber-500 active:bg-amber-600 active:text-white transition-all ${(workerStatus?.type !== 'TRABAJANDO') ? 'opacity-40 grayscale pointer-events-none' : ''}`}><Coffee size={32} /> <span className="text-sm font-black uppercase tracking-tighter">Ini Descanso</span></button>
             <button disabled={workerStatus?.type !== 'DESCANSO'} onClick={() => handleActionSelect(LogType.FIN_DESCANSO)} className={`bg-blue-600/10 border border-blue-500/20 rounded-[2rem] flex flex-col items-center justify-center gap-3 text-blue-500 active:bg-blue-600 active:text-white transition-all ${(workerStatus?.type !== 'DESCANSO') ? 'opacity-40 grayscale pointer-events-none' : ''}`}><Timer size={32} /> <span className="text-sm font-black uppercase tracking-tighter">Fin Descanso</span></button>
           </div>
        </div>
      );
      case Step.REPORT_EXIT: return (
        <div className="flex flex-col h-full animate-fadeIn overflow-hidden pb-4">
           <div className="flex items-center gap-4 mb-6 shrink-0"><button onClick={() => setCurrentStep(Step.SELECT_ACTION)} className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 text-slate-400"><ChevronLeft size={20}/></button><div><h2 className="text-xl font-black text-white">Finalizar Jornada</h2><p className="text-[10px] text-rose-500 font-bold uppercase tracking-widest">{workerStatus?.site}</p></div></div>
           <div className="flex-1 bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 shadow-xl space-y-6 overflow-y-auto custom-scrollbar">
              <div className="space-y-3">
                 <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Modo de Trabajo</label>
                 <div className="flex gap-2">
                    {(['HORAS', 'DESTAJO'] as const).map(m => (
                      <button key={m} onClick={() => setExitWorkMode(m)} className={`flex-1 py-4 rounded-2xl text-xs font-black transition-all border ${exitWorkMode === m ? 'bg-blue-600 border-blue-500 text-white shadow-lg' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>{m}</button>
                    ))}
                 </div>
              </div>
              <div className="space-y-3">
                 <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Resumen de Tareas</label>
                 <textarea value={exitReportText} onChange={(e) => setExitReportText(e.target.value)} placeholder="¿Qué has hecho hoy?" className="w-full bg-slate-950 border border-slate-800 rounded-[2rem] p-5 text-sm text-white focus:border-blue-500 outline-none h-40 resize-none font-medium leading-relaxed" />
              </div>
              <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
                 <div className="flex items-center gap-2"><Clock size={16} className="text-slate-500" /><span className="text-[10px] font-black text-slate-500 uppercase">Tiempo hoy</span></div>
                 <span className="text-lg font-mono font-black text-white">{formatMsToTime(getEffectiveWorkTime())}</span>
              </div>
              <button 
                disabled={!exitReportText.trim()}
                onClick={() => setConfirmState({ isOpen: true, action: LogType.SALIDA })}
                className={`w-full py-5 rounded-[2rem] font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 transition-all shadow-2xl ${exitReportText.trim() ? 'bg-rose-600 text-white active:scale-95' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
              >
                 <LogOut size={18} /> Enviar y Salir
              </button>
           </div>
        </div>
      );
      case Step.WORKER_HISTORY: return (
        <div className="flex flex-col h-full animate-fadeIn overflow-hidden">
           <div className="flex items-center justify-between gap-4 mb-4 shrink-0"><div className="flex items-center gap-4"><button onClick={() => setCurrentStep(Step.WORKER_DASHBOARD)} className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 text-slate-400"><ChevronLeft size={20}/></button><h2 className="text-xl font-black text-white">Mi Actividad</h2></div><button onClick={handleDownloadPDF} className="p-2.5 bg-emerald-600/10 text-emerald-500 rounded-xl border border-emerald-500/20 active:bg-emerald-600 active:text-white"><Download size={20}/></button></div>
           <div className="bg-slate-900/50 p-4 rounded-3xl border border-slate-800 mb-4 shrink-0 space-y-4">
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div><span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Resumen del periodo</span></div>
              <div className="grid grid-cols-3 gap-2">
                 <div className="flex flex-col items-center gap-1"><span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Trabajo Neto</span><span className="text-sm font-mono font-black text-white">{formatMsToTime(historyTotals.totalWork)}</span></div>
                 <div className="flex flex-col items-center gap-1 border-x border-slate-800"><span className="text-[8px] font-black text-amber-500 uppercase tracking-widest">Descanso</span><span className="text-sm font-mono font-black text-white">{formatMsToTime(historyTotals.totalBreak)}</span></div>
                 <div className="flex flex-col items-center gap-1"><span className="text-[8px] font-black text-blue-400 uppercase tracking-widest">Total Bruto</span><span className="text-sm font-mono font-black text-white">{formatMsToTime(historyTotals.totalWork + historyTotals.totalBreak)}</span></div>
              </div>
           </div>
           <div className="space-y-3 mb-4 shrink-0">
             <div className="relative"><Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" /><input type="text" placeholder="Buscar obra..." className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-3 pl-11 pr-4 text-xs text-white outline-none focus:border-blue-500" value={historySearch} onChange={(e) => setHistorySearch(e.target.value)}/></div>
             <div className="flex gap-2">{(['ALL', 'DAY', 'WEEK', 'MONTH'] as const).map(p => (<button key={p} onClick={() => setHistoryPeriod(p)} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${historyPeriod === p ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-500'}`}>{p === 'ALL' ? 'Todo' : p === 'DAY' ? 'Día' : p === 'WEEK' ? 'Semana' : 'Mes'}</button>))}</div>
             {historyPeriod === 'MONTH' && (<div className="animate-slideDown relative"><select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-3 px-4 text-xs font-bold text-blue-400 outline-none appearance-none">{MONTH_NAMES.map((name, idx) => (<option key={name} value={idx}>{name}</option>))}</select><ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} /></div>)}
             {(historyPeriod === 'WEEK' || historyPeriod === 'DAY') && (<div className="animate-slideDown flex flex-col gap-1"><span className="text-[10px] text-slate-500 font-black uppercase tracking-widest ml-1">{historyPeriod === 'DAY' ? 'Elegir día:' : 'Elegir día de la semana:'}</span><div className="relative"><CalendarDays size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500" /><input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-3 pl-11 pr-4 text-xs font-bold text-white outline-none [color-scheme:dark]"/></div></div>)}
           </div>
           <div className="flex-1 overflow-y-auto space-y-3 pb-4 custom-scrollbar">
             {filteredHistory.map(log => (<div key={log.id} className="bg-slate-900 p-4 rounded-2xl border border-slate-800"><div className="flex justify-between items-start mb-2"><span className={`text-[10px] font-black uppercase tracking-widest ${log.type === LogType.ENTRADA ? 'text-emerald-400' : log.type === LogType.SALIDA ? 'text-rose-400' : 'text-blue-400'}`}>{log.type}</span><span className="text-[9px] text-slate-600 font-bold">{log.dateStr} • {log.timeStr}</span></div><p className="text-xs font-black text-white uppercase tracking-tight truncate">{log.siteName}</p></div>))}
           </div>
        </div>
      );
      case Step.WORKER_WEEKLY_HISTORY: {
        const myReports = weeklyReports.filter(r => r.workerId === selectedWorker?.id);
        const currentRange = WeeklyReportService.getWeekRange(new Date());
        const submittedThisWeek = myReports.some(r => r.weekStart === currentRange.start);
        return (
          <div className="flex flex-col h-full animate-fadeIn overflow-hidden">
            <div className="flex items-center justify-between gap-4 mb-4 shrink-0">
              <div className="flex items-center gap-4 min-w-0">
                <button onClick={() => setCurrentStep(Step.WORKER_DASHBOARD)} className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 text-slate-400 shrink-0"><ChevronLeft size={20}/></button>
                <div className="min-w-0">
                  <h2 className="text-xl font-black text-white uppercase tracking-tighter truncate">Mis Partes</h2>
                  <p className="text-[9px] text-indigo-400 font-bold uppercase tracking-widest">{myReports.length} parte{myReports.length === 1 ? '' : 's'} enviado{myReports.length === 1 ? '' : 's'}</p>
                </div>
              </div>
              <button onClick={() => setShowWeeklyReportModal(true)} className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg active:scale-95" data-testid="weekly-history-new-btn"><Plus size={20}/></button>
            </div>

            <div className={`shrink-0 mb-4 p-4 rounded-2xl border ${submittedThisWeek ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${submittedThisWeek ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                  {submittedThisWeek ? <CheckCircle2 size={18}/> : <AlertTriangle size={18}/>}
                </div>
                <div className="flex-1">
                  <p className={`text-[10px] font-black uppercase tracking-widest ${submittedThisWeek ? 'text-emerald-200' : 'text-amber-200'}`}>Semana actual</p>
                  <p className={`text-xs font-bold ${submittedThisWeek ? 'text-emerald-300' : 'text-amber-300'}`}>{submittedThisWeek ? '✓ Parte enviado' : 'Pendiente de envío'}</p>
                </div>
                <p className="text-[9px] text-slate-400 font-mono font-bold">{currentRange.start} → {currentRange.end}</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pb-4 custom-scrollbar">
              {myReports.length === 0 && (
                <div className="text-center py-16 bg-slate-900/30 rounded-3xl border border-dashed border-slate-800">
                  <FileText size={36} className="text-slate-700 mx-auto mb-3" />
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Sin partes enviados</p>
                  <p className="text-slate-600 text-[10px] mt-1">Pulsa + para enviar tu primer parte</p>
                </div>
              )}
              {myReports.map(r => (
                <div key={r.id} data-testid={`worker-report-${r.id}`} className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                  <div className="flex gap-3 p-3">
                    {r.photoBase64 && <img src={r.photoBase64} alt="" className="w-20 h-20 object-cover rounded-xl shrink-0 border border-slate-800" />}
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest truncate">{r.weekStart} → {r.weekEnd}</p>
                          {r.extracted?.totalHours != null && (
                            <span className="px-1.5 py-0.5 bg-indigo-500/20 border border-indigo-400/30 rounded text-[7px] font-black text-indigo-300 uppercase tracking-widest">IA</span>
                          )}
                        </div>
                        <p className="text-sm font-black text-white uppercase truncate">{r.siteName || 'Sin obra'}</p>
                        <p className="text-[10px] text-slate-500 line-clamp-2 leading-tight mt-1">{r.tasks || '—'}</p>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800">
                        <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">{r.dateStr} • {r.timeStr}</span>
                        <span className="text-base font-mono font-black text-white">{r.totalHours.toFixed(1)}<span className="text-[10px] text-slate-500 ml-0.5">h</span></span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      }
      case Step.WORKER_TOOLS: return (
        <div className="flex flex-col h-full animate-fadeIn overflow-hidden">
          <div className="flex items-center justify-between gap-4 mb-4 shrink-0">
            <div className="flex items-center gap-4">
              <button onClick={() => setCurrentStep(Step.WORKER_DASHBOARD)} className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 text-slate-400">
                <ChevronLeft size={20}/>
              </button>
              <h2 className="text-xl font-black text-white uppercase tracking-tighter">Mis Herramientas</h2>
            </div>
            <button onClick={() => setIsToolModalOpen(true)} className="p-2.5 bg-amber-600 text-white rounded-xl shadow-lg active:scale-95"><Plus size={20}/></button>
          </div>
          <div className="relative mb-4 shrink-0"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16}/><input type="text" placeholder="Buscar por nombre o marca..." className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-4 pl-11 pr-4 text-xs text-white outline-none focus:border-amber-500" value={toolSearch} onChange={(e) => setToolSearch(e.target.value)}/></div>
          <div className="flex-1 overflow-y-auto space-y-3 pb-4 custom-scrollbar">
            {workerTools.map(tool => (
              <div key={tool.id} className="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-600/10 rounded-xl flex items-center justify-center text-amber-500 border border-amber-500/10 shrink-0"><Wrench size={24} /></div>
                <div className="flex-1 min-w-0"><h4 className="font-black text-white uppercase text-sm truncate">{tool.toolName}</h4><p className="text-[10px] text-slate-500 font-bold uppercase truncate">{tool.brand} • {tool.model || 'S/M'}</p></div>
                <button onClick={() => StorageService.deleteTool(tool.id)} className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg transition"><Trash2 size={18} /></button>
              </div>
            ))}
          </div>
          {isToolModalOpen && (
            <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6 animate-fadeIn">
              <div className="bg-slate-900 w-full max-w-sm rounded-[2.5rem] border border-slate-800 p-8 shadow-2xl relative">
                <div className="flex justify-between items-center mb-6"><div><h3 className="text-lg font-black text-white uppercase tracking-tighter">Añadir Herramienta</h3><p className="text-amber-500 text-[10px] font-bold uppercase tracking-widest">Nueva Ficha</p></div><button onClick={() => setIsToolModalOpen(false)} className="text-slate-500 p-2"><X size={20}/></button></div>
                <div className="space-y-4">
                  <div className="space-y-1.5"><label className="text-[9px] font-black text-slate-500 uppercase ml-1">Nombre *</label><input list="worker-tools-list" type="text" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-white outline-none" value={newToolForm.name} onChange={(e)=>setNewToolForm({...newToolForm, name: e.target.value})} /></div>
                  <div className="space-y-1.5"><label className="text-[9px] font-black text-slate-500 uppercase ml-1">Marca *</label><input list="worker-brands-list" type="text" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-white outline-none" value={newToolForm.brand} onChange={(e)=>setNewToolForm({...newToolForm, brand: e.target.value})} /></div>
                  <div className="space-y-1.5"><label className="text-[9px] font-black text-slate-500 uppercase ml-1">Modelo</label><input type="text" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-white outline-none" value={newToolForm.model} onChange={(e)=>setNewToolForm({...newToolForm, model: e.target.value})} /></div>
                  <button onClick={handleAddWorkerTool} className="w-full bg-amber-600 text-white py-4 rounded-2xl font-black uppercase text-xs shadow-lg active:scale-95 transition mt-2">Guardar Equipo</button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
      case Step.SUCCESS: return (
        <div className="flex flex-col items-center justify-center h-full gap-6 animate-fadeIn text-center">
           <div className="w-24 h-24 bg-emerald-600 rounded-[2rem] flex items-center justify-center shadow-2xl animate-bounce"><CheckCircle size={48} className="text-white" /></div>
           <div><h2 className="text-3xl font-black text-white uppercase tracking-tighter">¡Operación con Éxito!</h2><p className="text-slate-500 text-sm mt-2 font-medium">Tu fichaje ha sido registrado en el sistema.</p></div>
           <button onClick={() => setCurrentStep(Step.WORKER_DASHBOARD)} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black border border-slate-800 uppercase tracking-widest text-xs shadow-lg active:scale-95">Regresar al Panel</button>
        </div>
      );
      case Step.REGISTER: return (
        <div className="flex flex-col h-full animate-fadeIn overflow-hidden pb-4">
           <h2 className="text-2xl font-black text-white mb-4 shrink-0 tracking-tighter uppercase">Crear Cuenta</h2>
           <div className="bg-slate-900 p-5 rounded-[2.5rem] border border-slate-800 space-y-3 shadow-xl overflow-y-auto custom-scrollbar flex-1">
             <input type="text" placeholder="Nombre completo" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-white focus:border-blue-500 outline-none" value={regName} onChange={(e)=>setRegName(e.target.value)}/>
             <input type="text" placeholder="DNI / NIE" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-white focus:border-blue-500 outline-none" value={regDni} onChange={(e)=>setRegDni(e.target.value)}/>
             <input type="tel" placeholder="Teléfono" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-white font-bold" value={regPhone} onChange={(e)=>setRegPhone(e.target.value)}/>
             <button onClick={handleRegistration} className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-xs mt-4 active:scale-95 shadow-lg shrink-0">Registrarme</button>
           </div>
        </div>
      );
      default: return (
        <div className="flex items-center justify-center h-full text-slate-500 text-xs font-black uppercase tracking-[0.2em] animate-pulse">
           Cargando interfaz...
        </div>
      );
    }
  };

  if (isAdmin) return <AdminPanel onBack={() => setIsAdmin(false)} currentUser={currentAdminUser} />;
  return (
    <div className="max-w-md mx-auto h-screen flex flex-col bg-slate-950 text-white p-4 relative overflow-hidden">
      {renderStep()}
      {showAdminLogin && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6 animate-fadeIn">
          <div className="bg-slate-900 w-full max-w-sm rounded-[2.5rem] border border-slate-800 p-8 shadow-2xl relative overflow-hidden">
             <div className="flex justify-between items-center mb-6"><div className="flex items-center gap-3"><div className="p-2 bg-blue-600/10 rounded-xl text-blue-500"><Shield size={24}/></div><h2 className="text-xl font-black text-white uppercase tracking-tighter">Admin Login</h2></div><button onClick={() => setShowAdminLogin(false)} className="text-slate-500 hover:text-white"><X size={20}/></button></div>
             <div className="space-y-4">
                <input type="text" placeholder="Usuario" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-white outline-none focus:border-blue-500" value={adminUsernameInput} onChange={(e) => setAdminUsernameInput(e.target.value)}/>
                <input type="password" placeholder="Contraseña" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-white outline-none focus:border-blue-500" value={adminPasswordInput} onChange={(e) => setAdminPasswordInput(e.target.value)}/>
                {adminError && <p className="text-rose-500 text-[10px] font-bold uppercase text-center">{adminError}</p>}
                <button onClick={verifyAdminPassword} className="w-full bg-blue-600 py-4 rounded-xl font-black uppercase text-xs tracking-widest shadow-lg">Acceder al Panel</button>
             </div>
          </div>
        </div>
      )}
      {error && (<div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-rose-600 px-6 py-3 rounded-full text-xs font-black uppercase z-[200] shadow-2xl flex items-center gap-3"><ShieldAlert size={16}/> {error} <button onClick={()=>setError('')} className="bg-white/20 p-1 rounded-full"><X size={12}/></button></div>)}
      <ConfirmationModal 
        isOpen={confirmState.isOpen} 
        title={`Confirmar ${confirmState.action}`} 
        message={confirmState.action === LogType.SALIDA ? '¿Estás seguro de que deseas enviar el reporte y finalizar tu jornada?' : `¿Deseas registrar tu ${confirmState.action}?`} 
        onConfirm={() => executeLogSubmission(confirmState.action!, exitReportText, exitWorkMode)} 
        onCancel={() => setConfirmState({ isOpen: false, action: null })} 
      />
      {showWeeklyReportModal && selectedWorker && (
        <WeeklyReportModal
          worker={selectedWorker}
          onClose={() => setShowWeeklyReportModal(false)}
          existingReports={weeklyReports}
        />
      )}
    </div>
  );
};
