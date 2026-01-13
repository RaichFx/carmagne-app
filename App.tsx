
import React, { useState, useEffect, useMemo } from 'react';
import { 
  User, MapPin, CheckCircle, 
  LogOut, Coffee, ArrowRight, ShieldAlert, Lock, Fingerprint, Delete, UserPlus, Save, ChevronLeft, Calendar, History, Clock, Smartphone, X, Mic, MicOff, FileText, Cloud, ExternalLink, Briefcase, Phone, KeyRound, BellRing, Search, Download, CalendarDays, Zap, Wrench, Package, Info, Plus, Trash2, Timer, Filter, ChevronDown, Shield, AlertTriangle, AlertCircle
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { StorageService, ELECTRICAL_TOOLS_LIST, ELECTRICAL_BRANDS_LIST } from './services/storageService';
import { LocationService } from './services/locationService';
import { Worker, Site, WorkLog, LogType, GeoLocationData, WorkMode, AdminUser, ToolRecord, AppConfig } from './types';
import { AdminPanel } from './components/AdminPanel';
import { InstallTutorial } from './components/InstallTutorial';
import { ConfirmationModal } from './components/ConfirmationModal';

enum Step {
  LOGIN_PHONE = 0,
  AUTHENTICATE = 1,
  WORKER_DASHBOARD = 15,
  WORKER_HISTORY = 16,
  WORKER_TOOLS = 17,
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
  const [historySearch, setHistorySearch] = useState('');
  const [historyPeriod, setHistoryPeriod] = useState<'ALL' | 'DAY' | 'WEEK' | 'MONTH'>('ALL');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [allTools, setAllTools] = useState<ToolRecord[]>([]);
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

  useEffect(() => {
    const timer = setTimeout(() => setIsAppLoading(false), 2000);
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    setWorkers(StorageService.getWorkers());
    setSites(StorageService.getSites());
    setWorkerLogs(StorageService.getLogs()); 
    setAdmins(StorageService.getAdmins());
    setAllTools(StorageService.getTools());
    setAppConfig(StorageService.getConfig());
    const unsubWorkers = StorageService.subscribeToWorkers(setWorkers);
    const unsubSites = StorageService.subscribeToSites(setSites);
    const unsubLogs = StorageService.subscribeToLogs(setWorkerLogs);
    const unsubAdmins = StorageService.subscribeToAdmins(setAdmins);
    const unsubTools = StorageService.subscribeToTools(setAllTools);
    const unsubConfig = StorageService.subscribeToConfig(setAppConfig);
    return () => {
      clearTimeout(timer); clearInterval(interval);
      unsubWorkers(); unsubSites(); unsubLogs(); unsubAdmins(); unsubTools(); unsubConfig();
    };
  }, []);

  // Lógica de recuperación de Brayan
  useEffect(() => {
    if (workers.length > 0) {
      const brayan = workers.find(w => w.name.toLowerCase().includes('brayan'));
      if (!brayan) {
        const recoveredBrayan: Worker = { 
          id: 'W-BRAYAN-RECOVERED', name: 'Brayan', pin: '1234', 
          qrCode: 'QR_BRAYAN', active: true, dni: '', phone: '', defaultMode: 'HORAS' 
        };
        StorageService.registerNewWorker(recoveredBrayan);
      }
    }
  }, [workers]);

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
      setSelectedWorker(worker); setPinInput(''); setError(''); setCurrentStep(Step.AUTHENTICATE);
    } else if(confirm("Este número no está registrado. ¿Quieres crear una cuenta nueva?")) {
      setRegPhone(formattedPhone); setError(''); setCurrentStep(Step.REGISTER);
    }
  };

  const handleRegistration = async () => {
    const fPhone = processSpanishPhone(regPhone);
    if (!regName || !regDni || !regPin || !fPhone) { setError('Campos obligatorios.'); return; }
    if (!isPhoneValidSpain(fPhone)) { setError('Solo números de España (+34)'); return; }
    if (regPin !== regPinConfirm) { setError('Los PINs no coinciden.'); return; }
    setLoading(true);
    const newWorker: Worker = { id: `W${Date.now()}`, name: regName, dni: regDni, phone: fPhone, pin: regPin, qrCode: `QR_${Date.now()}`, active: true, defaultMode: 'HORAS' };
    try { await StorageService.registerNewWorker(newWorker); setSelectedWorker(newWorker); setCurrentStep(Step.AUTHENTICATE); } catch (err) { setError('Error al registrar.'); } finally { setLoading(false); }
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
    try {
      const loc = await LocationService.getCurrentPosition();
      let distance = 0; let warning = false;
      if (selectedSite?.coordinates) {
        distance = LocationService.calculateDistance(loc.latitude, loc.longitude, selectedSite.coordinates.latitude, selectedSite.coordinates.longitude);
        if (distance > MAX_DISTANCE_METERS) warning = true;
      }
      const newLog: WorkLog = { id: `LOG-${Date.now()}`, workerId: selectedWorker!.id, workerName: selectedWorker!.name, siteId: selectedSite!.id, siteName: selectedSite!.name, type, timestamp: Date.now(), dateStr: new Date().toLocaleDateString('es-ES'), timeStr: new Date().toLocaleTimeString('es-ES'), location: loc, sentToWhatsapp: false, syncedToSheets: false, distanceMeters: distance, locationWarning: warning, workReport: report, workMode: mode };
      await StorageService.addLog(newLog); setCurrentStep(Step.SUCCESS);
    } catch (err) { setError('Error de GPS o Conexión.'); } finally { setLoading(false); setConfirmState({ isOpen: false, action: null }); }
  };

  const resetApp = () => { setCurrentStep(Step.LOGIN_PHONE); setSelectedWorker(null); setSelectedSite(null); setError(''); setPinInput(''); setLoginPhone(''); };

  const verifyAdminPassword = () => {
    const config = StorageService.getConfig();
    if (adminUsernameInput === 'admin' && adminPasswordInput === (config.adminPassword || 'admin')) { setIsAdmin(true); setCurrentAdminUser(null); setShowAdminLogin(false); setAdminError(''); setAdminUsernameInput(''); setAdminPasswordInput(''); return; }
    const foundAdmin = admins.find(a => a.active && a.username === adminUsernameInput && a.password === adminPasswordInput);
    if (foundAdmin) { setIsAdmin(true); setCurrentAdminUser(foundAdmin); setShowAdminLogin(false); setAdminError(''); setAdminUsernameInput(''); setAdminPasswordInput(''); } else { setAdminError('Usuario o contraseña incorrectos'); }
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
         <button onClick={() => setCurrentStep(Step.SELECT_SITE)} className="group bg-slate-900 border border-slate-800 p-5 rounded-[2rem] flex items-center justify-between shadow-lg active:scale-95 transition-all">
           <div><span className="block text-xl font-black text-white">Nuevo Fichaje</span><span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Registrar Movimiento</span></div>
           <div className="bg-blue-600/10 p-4 rounded-2xl text-blue-500"><Timer size={28} /></div>
         </button>
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
      case Step.AUTHENTICATE: return (
        <div className="flex flex-col h-full animate-fadeIn items-center justify-center gap-4">
          <div className="text-center mb-4"><div className="w-16 h-16 bg-slate-900 rounded-3xl flex items-center justify-center mx-auto mb-3 border border-slate-800 shadow-[0_0_20px_rgba(59,130,246,0.2)]"><Lock size={28} className="text-blue-500" /></div><h2 className="text-xl font-black text-white tracking-tighter">VERIFICACIÓN PIN</h2><p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{selectedWorker?.name}</p></div>
          <div className="flex gap-4 mb-10">{[0, 1, 2, 3].map(i => (<div key={i} className={`w-3 h-3 rounded-full transition-all duration-300 ${i < pinInput.length ? 'bg-blue-500 scale-150 shadow-[0_0_10px_rgba(59,130,246,0.8)]' : 'bg-slate-800'}`}/>))}</div>
          <div className="grid grid-cols-3 gap-4 w-full max-w-[300px]">{[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, 'del'].map((val, i) => (val === '' ? <div key={i}/> : val === 'del' ? <button key={i} onClick={() => setPinInput('')} className="h-16 flex items-center justify-center text-rose-500 active:scale-90 transition-transform"><Delete size={28} /></button> : <button key={i} onClick={() => handlePinInput(val.toString())} className="h-16 rounded-3xl bg-slate-900/50 text-white text-2xl font-black border border-slate-800 active:bg-blue-600 active:border-blue-500 active:scale-90 transition-all shadow-sm">{val}</button>))}</div>
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
           <div className="flex items-center gap-4 mb-6 shrink-0"><button onClick={() => setCurrentStep(Step.SELECT_SITE)} className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 text-slate-400"><ChevronLeft size={20}/></button><div><h2 className="text-xl font-black text-white">Acción en Obra</h2><p className="text-[10px] text-blue-500 font-bold uppercase tracking-widest">{selectedSite?.name}</p></div></div>
           <div className="grid grid-cols-2 gap-3 flex-1 pb-4">
             <button disabled={workerStatus?.type !== 'INACTIVO'} onClick={() => handleActionSelect(LogType.ENTRADA)} className={`bg-emerald-600/10 border border-emerald-500/20 rounded-[2rem] flex flex-col items-center justify-center gap-3 text-emerald-500 active:bg-emerald-600 active:text-white transition-all ${(workerStatus?.type !== 'INACTIVO') ? 'opacity-40 grayscale pointer-events-none' : ''}`}><Zap size={32} /> <span className="text-sm font-black uppercase">Entrada</span></button>
             <button disabled={workerStatus?.type === 'INACTIVO' || workerStatus?.type === 'DESCANSO'} onClick={() => handleActionSelect(LogType.SALIDA)} className={`bg-rose-600/10 border border-rose-500/20 rounded-[2rem] flex flex-col items-center justify-center gap-3 text-rose-500 active:bg-rose-600 active:text-white transition-all ${(workerStatus?.type === 'INACTIVO' || workerStatus?.type === 'DESCANSO') ? 'opacity-40 grayscale pointer-events-none' : ''}`}><LogOut size={32} /> <span className="text-sm font-black uppercase">Salida</span></button>
             <button disabled={workerStatus?.type !== 'TRABAJANDO'} onClick={() => handleActionSelect(LogType.INICIO_DESCANSO)} className={`bg-amber-600/10 border border-amber-500/20 rounded-[2rem] flex flex-col items-center justify-center gap-3 text-amber-500 active:bg-amber-600 active:text-white transition-all ${(workerStatus?.type !== 'TRABAJANDO') ? 'opacity-40 grayscale pointer-events-none' : ''}`}><Coffee size={32} /> <span className="text-sm font-black uppercase tracking-tighter">Ini Descanso</span></button>
             <button disabled={workerStatus?.type !== 'DESCANSO'} onClick={() => handleActionSelect(LogType.FIN_DESCANSO)} className={`bg-blue-600/10 border border-blue-500/20 rounded-[2rem] flex flex-col items-center justify-center gap-3 text-blue-500 active:bg-blue-600 active:text-white transition-all ${(workerStatus?.type !== 'DESCANSO') ? 'opacity-40 grayscale pointer-events-none' : ''}`}><Timer size={32} /> <span className="text-sm font-black uppercase tracking-tighter">Fin Descanso</span></button>
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
      default: return null;
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
                <input type="text" placeholder="Usuario" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-white outline-none" value={adminUsernameInput} onChange={(e) => setAdminUsernameInput(e.target.value)}/>
                <input type="password" placeholder="Contraseña" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-white outline-none" value={adminPasswordInput} onChange={(e) => setAdminPasswordInput(e.target.value)}/>
                {adminError && <p className="text-rose-500 text-[10px] font-bold uppercase text-center">{adminError}</p>}
                <button onClick={verifyAdminPassword} className="w-full bg-blue-600 py-4 rounded-xl font-black uppercase text-xs">Acceder al Panel</button>
             </div>
          </div>
        </div>
      )}
      {error && (<div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-rose-600 px-6 py-3 rounded-full text-xs font-black uppercase z-[200] shadow-2xl flex items-center gap-3"><ShieldAlert size={16}/> {error} <button onClick={()=>setError('')} className="bg-white/20 p-1 rounded-full"><X size={12}/></button></div>)}
      <ConfirmationModal isOpen={confirmState.isOpen} title={`Confirmar ${confirmState.action}`} message={`¿Deseas registrar ${confirmState.action}?`} onConfirm={() => executeLogSubmission(confirmState.action!)} onCancel={() => setConfirmState({ isOpen: false, action: null })} />
    </div>
  );
};
