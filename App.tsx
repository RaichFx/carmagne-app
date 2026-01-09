
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

const AppLogo = ({ className, size = "md", logoUrl, scale = 1.0 }: { className?: string, size?: "sm" | "md" | "lg", logoUrl?: string, scale?: number }) => {
  const baseSize = size === "sm" ? 28 : size === "md" ? 64 : size === "lg" ? 140 : 64;
  const iconSize = baseSize * scale;
  
  if (logoUrl) {
    return (
      <div className={`relative flex items-center justify-center ${className}`}>
        <img 
          src={logoUrl} 
          alt="Company Logo" 
          style={{ width: iconSize, height: iconSize }} 
          className="object-contain rounded-2xl drop-shadow-[0_0_15px_rgba(59,130,246,0.4)]"
        />
      </div>
    );
  }

  return (
    <div className={`relative flex items-center justify-center ${className} text-blue-500`}>
      <Zap 
        size={iconSize} 
        className="drop-shadow-[0_0_20px_rgba(59,130,246,0.6)] fill-blue-500/20" 
        strokeWidth={2.5}
      />
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

  // History states
  const [historySearch, setHistorySearch] = useState('');
  const [historyPeriod, setHistoryPeriod] = useState<'ALL' | 'WEEK' | 'MONTH'>('ALL');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const [allTools, setAllTools] = useState<ToolRecord[]>([]);
  const [newToolName, setNewToolName] = useState('');
  const [newToolBrand, setNewToolBrand] = useState('');
  const [newToolModel, setNewToolModel] = useState('');

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
      clearTimeout(timer);
      clearInterval(interval);
      unsubWorkers(); unsubSites(); unsubLogs(); unsubAdmins(); unsubTools(); unsubConfig();
    };
  }, []);

  const filteredHistory = useMemo(() => {
    if (!selectedWorker) return [];
    let baseHistory = workerLogs.filter(l => l.workerId === selectedWorker.id);
    if (historyPeriod === 'WEEK') {
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

  const handleDownloadPDF = () => {
    if (!selectedWorker) return;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text("Historial de Actividad - CARMAGNE INSTAL SL", 105, 15, { align: 'center' });
    doc.setFontSize(12);
    doc.text(`Operario: ${selectedWorker.name}`, 105, 25, { align: 'center' });
    const tableData = filteredHistory.map(l => [l.dateStr, l.timeStr, l.type, l.siteName, l.workMode || 'HORAS', l.workReport || '-']);
    autoTable(doc, {
      startY: 35,
      head: [['Fecha', 'Hora', 'Acción', 'Obra', 'Modo', 'Reporte']],
      body: tableData,
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8 }
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
    let accumulatedWorkTime = 0;
    let accumulatedBreakTime = 0;
    let currentWorkStart: number | null = null;
    let currentBreakStart: number | null = null;
    let currentState: 'INACTIVO' | 'TRABAJANDO' | 'DESCANSO' = 'INACTIVO';
    let currentSite = null;
    let currentSiteId = null;
    for (const log of currentSessionLogs) {
      if (log.type === LogType.ENTRADA || log.type === LogType.FIN_DESCANSO) {
        if (currentBreakStart) { accumulatedBreakTime += (log.timestamp - currentBreakStart); currentBreakStart = null; }
        currentWorkStart = log.timestamp;
        currentState = 'TRABAJANDO';
        currentSite = log.siteName;
        currentSiteId = log.siteId;
      } else if (log.type === LogType.INICIO_DESCANSO) {
        if (currentWorkStart) { accumulatedWorkTime += (log.timestamp - currentWorkStart); currentWorkStart = null; }
        currentBreakStart = log.timestamp;
        currentState = 'DESCANSO';
        currentSite = log.siteName;
        currentSiteId = log.siteId;
      }
    }
    return { type: currentState, site: currentSite, siteId: currentSiteId, accumulatedWorkTime, currentWorkStart, accumulatedBreakTime, currentBreakStart };
  }, [workerLogs, selectedWorker]);

  const formatMsToTime = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

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
      setSelectedWorker(worker); setPinInput(''); setError(''); setCurrentStep(Step.WORKER_DASHBOARD);
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

  const handleAddTool = async () => {
    if (!newToolName || !selectedWorker) return;
    const tool: ToolRecord = { id: `T-${Date.now()}`, workerId: selectedWorker.id, workerName: selectedWorker.name, toolName: newToolName, brand: newToolBrand, model: newToolModel, timestamp: Date.now(), dateStr: new Date().toLocaleDateString('es-ES'), timeStr: new Date().toLocaleTimeString('es-ES') };
    await StorageService.addTool(tool); setNewToolName(''); setNewToolBrand(''); setNewToolModel('');
  };

  const verifyAdminPassword = () => {
    const config = StorageService.getConfig();
    if (adminUsernameInput === 'admin' && adminPasswordInput === (config.adminPassword || 'admin')) { setIsAdmin(true); setCurrentAdminUser(null); setShowAdminLogin(false); setAdminError(''); setAdminUsernameInput(''); setAdminPasswordInput(''); return; }
    const foundAdmin = admins.find(a => a.active && a.username === adminUsernameInput && a.password === adminPasswordInput);
    if (foundAdmin) { setIsAdmin(true); setCurrentAdminUser(foundAdmin); setShowAdminLogin(false); setAdminError(''); setAdminUsernameInput(''); setAdminPasswordInput(''); } else { setAdminError('Usuario o contraseña incorrectos'); }
  };

  const renderWorkerDashboard = () => (
    <div className="flex flex-col gap-4 animate-fadeIn h-full overflow-hidden">
      <div className="flex justify-between items-center h-12 shrink-0">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Trabajador</span>
          <span className="text-lg font-black text-white leading-none">{selectedWorker?.name}</span>
        </div>
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
               <div className="flex flex-col">
                  <span className="text-[8px] font-black text-white/50 uppercase tracking-widest">Tiempo de Trabajo</span>
                  <span className={`text-2xl font-mono font-black text-white ${workerStatus?.type === 'TRABAJANDO' ? 'animate-pulse' : ''}`}>{formatMsToTime(getEffectiveWorkTime())}</span>
               </div>
               {workerStatus?.type === 'DESCANSO' && <div className="flex flex-col items-end"><span className="text-[8px] font-black text-amber-300 uppercase tracking-widest">En Pausa</span><div className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></div></div>}
            </div>
            {(getEffectiveBreakTime() > 0 || workerStatus?.type === 'DESCANSO') && (
              <div className="flex justify-between items-center bg-amber-900/40 p-3 rounded-xl border border-amber-500/20">
                <div className="flex items-center gap-2"><Coffee size={14} className="text-amber-400" /><span className="text-[9px] font-black text-amber-200 uppercase tracking-widest">Tiempo de Descanso</span></div>
                <span className={`text-sm font-mono font-black text-amber-400 ${workerStatus?.type === 'DESCANSO' ? 'animate-pulse' : ''}`}>{formatMsToTime(getEffectiveBreakTime())}</span>
              </div>
            )}
         </div>
         <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl"></div>
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
          <div className="text-center"><div className="inline-flex mb-8"><AppLogo size="lg" logoUrl={appConfig.logoUrl} scale={appConfig.logoScaleLogin} /></div><h2 className="text-3xl font-black text-white tracking-tighter">CARMAGNE INSTAL SL</h2><p className="text-slate-500 text-xs font-bold uppercase tracking-[0.2em]">Acceso Operario</p></div>
          <div className="bg-slate-900/50 p-6 rounded-[2.5rem] border border-slate-800"><input type="tel" value={loginPhone} onChange={(e) => setLoginPhone(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl p-5 text-2xl font-black focus:border-blue-500 outline-none text-center tracking-widest" placeholder="600000000"/><button onClick={handlePhoneLogin} className="w-full bg-blue-600 text-white font-black py-5 rounded-2xl shadow-lg mt-6 flex items-center justify-center gap-3 active:scale-95 uppercase text-xs tracking-widest">Entrar <ArrowRight size={16} /></button></div>
          <button onClick={() => setShowAdminLogin(true)} className="text-slate-800 text-[10px] font-black uppercase tracking-[0.4em] text-center">Admin Panel</button>
        </div>
      );
      case Step.AUTHENTICATE: return (
        <div className="flex flex-col h-full animate-fadeIn items-center justify-center gap-4">
          <div className="text-center mb-4"><div className="w-16 h-16 bg-slate-900 rounded-3xl flex items-center justify-center mx-auto mb-3 border border-slate-800"><Lock size={28} className="text-blue-500" /></div><h2 className="text-xl font-black text-white">Introduce PIN</h2><p className="text-slate-500 text-xs">{selectedWorker?.name}</p></div>
          <div className="flex gap-4 mb-6">{[0, 1, 2, 3].map(i => (<div key={i} className={`w-3 h-3 rounded-full ${i < pinInput.length ? 'bg-blue-500 scale-125' : 'bg-slate-800'}`}/>))}</div>
          <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">{[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, 'del'].map((val, i) => (val === '' ? <div key={i}/> : val === 'del' ? <button key={i} onClick={() => setPinInput('')} className="h-16 flex items-center justify-center text-rose-500"><Delete size={24} /></button> : <button key={i} onClick={() => handlePinInput(val.toString())} className="h-16 rounded-2xl bg-slate-900 text-white text-xl font-black border border-slate-800 active:bg-blue-600">{val}</button>))}</div>
        </div>
      );
      case Step.WORKER_DASHBOARD: return renderWorkerDashboard();
      case Step.SELECT_SITE: return (
        <div className="flex flex-col h-full animate-fadeIn overflow-hidden">
           <div className="flex items-center gap-4 mb-4 shrink-0"><button onClick={() => setCurrentStep(Step.WORKER_DASHBOARD)} className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 text-slate-400"><ChevronLeft size={20}/></button><h2 className="text-xl font-black text-white">Selecciona Obra</h2></div>
           {workerStatus?.type !== 'INACTIVO' && (<div className="bg-blue-600/10 border border-blue-500/20 p-4 rounded-2xl mb-4 flex items-start gap-3 shrink-0"><Info size={20} className="text-blue-500 shrink-0 mt-0.5" /><p className="text-[10px] text-blue-200 font-bold uppercase tracking-wider leading-relaxed">Tienes una sesión activa en <span className="text-white font-black underline">{workerStatus.site}</span>. Debes finalizarla para poder fichar en otra obra.</p></div>)}
           <div className="flex-1 overflow-y-auto space-y-3 pb-4 custom-scrollbar">{sites.map(site => { const isActiveSite = workerStatus?.siteId === site.id; const isLocked = workerStatus?.type !== 'INACTIVO' && !isActiveSite; return (<button key={site.id} disabled={isLocked} onClick={() => { if (isLocked) return; setSelectedSite(site); setCurrentStep(Step.SELECT_ACTION); }} className={`w-full p-4 rounded-[1.5rem] border text-left transition-all ${isActiveSite ? 'bg-blue-600/20 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : isLocked ? 'bg-slate-900/30 border-slate-900 opacity-40 grayscale' : 'bg-slate-900 border-slate-800 hover:border-blue-500 active:scale-95'}`}><div className="flex justify-between items-start"><div className="max-w-[75%]"><h3 className="font-black text-white text-sm uppercase tracking-tight">{site.name}</h3><p className="text-[9px] text-slate-500 truncate uppercase font-bold mt-1">{site.address}</p></div>{isActiveSite && (<span className="bg-blue-600 text-white text-[8px] font-black px-2 py-1 rounded-full uppercase tracking-widest shadow-lg">Sesión Activa</span>)}{isLocked && (<Lock size={14} className="text-slate-700" />)}</div></button>); })}</div>
        </div>
      );
      case Step.SELECT_ACTION: return (
        <div className="flex flex-col h-full animate-fadeIn overflow-hidden">
           <div className="flex items-center gap-4 mb-6 shrink-0"><button onClick={() => setCurrentStep(Step.SELECT_SITE)} className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 text-slate-400"><ChevronLeft size={20}/></button><div><h2 className="text-xl font-black text-white">Acción en Obra</h2><p className="text-[10px] text-blue-500 font-bold uppercase tracking-widest">{selectedSite?.name}</p></div></div>
           {workerStatus?.type === 'DESCANSO' && workerStatus.siteId === selectedSite?.id && (<div className="bg-amber-600/10 border border-amber-500/30 p-4 rounded-2xl mb-6 flex items-start gap-3 animate-pulse shrink-0"><AlertCircle size={20} className="text-amber-500 shrink-0" /><p className="text-[10px] text-amber-200 font-bold uppercase tracking-tight leading-relaxed">Estás en descanso. Debes pulsar <span className="text-white font-black underline">Fin Descanso</span> antes de poder registrar la salida.</p></div>)}
           <div className="grid grid-cols-2 gap-3 flex-1 pb-4">
             <button disabled={workerStatus?.type !== 'INACTIVO' || (workerStatus?.type !== 'INACTIVO' && workerStatus.siteId !== selectedSite?.id)} onClick={() => handleActionSelect(LogType.ENTRADA)} className={`bg-emerald-600/10 border border-emerald-500/20 rounded-[2rem] flex flex-col items-center justify-center gap-3 text-emerald-500 active:bg-emerald-600 active:text-white transition-all ${(workerStatus?.type !== 'INACTIVO') ? 'opacity-40 grayscale pointer-events-none' : ''}`}><Zap size={32} /> <span className="text-sm font-black uppercase">Entrada</span></button>
             <button disabled={workerStatus?.type === 'INACTIVO' || workerStatus?.type === 'DESCANSO' || workerStatus?.siteId !== selectedSite?.id} onClick={() => handleActionSelect(LogType.SALIDA)} className={`bg-rose-600/10 border border-rose-500/20 rounded-[2rem] flex flex-col items-center justify-center gap-3 text-rose-500 active:bg-rose-600 active:text-white transition-all ${(workerStatus?.type === 'INACTIVO' || workerStatus?.type === 'DESCANSO' || workerStatus?.siteId !== selectedSite?.id) ? 'opacity-40 grayscale pointer-events-none' : ''}`}><LogOut size={32} /> <span className="text-sm font-black uppercase">Salida</span></button>
             <button disabled={workerStatus?.type !== 'TRABAJANDO' || workerStatus?.siteId !== selectedSite?.id} onClick={() => handleActionSelect(LogType.INICIO_DESCANSO)} className={`bg-amber-600/10 border border-amber-500/20 rounded-[2rem] flex flex-col items-center justify-center gap-3 text-amber-500 active:bg-amber-600 active:text-white transition-all ${(workerStatus?.type !== 'TRABAJANDO' || workerStatus?.siteId !== selectedSite?.id) ? 'opacity-40 grayscale pointer-events-none' : ''}`}><Coffee size={32} /> <span className="text-sm font-black uppercase tracking-tighter">Ini Descanso</span></button>
             <button disabled={workerStatus?.type !== 'DESCANSO' || workerStatus?.siteId !== selectedSite?.id} onClick={() => handleActionSelect(LogType.FIN_DESCANSO)} className={`bg-blue-600/10 border border-blue-500/20 rounded-[2rem] flex flex-col items-center justify-center gap-3 text-blue-500 active:bg-blue-600 active:text-white transition-all ${(workerStatus?.type !== 'DESCANSO' || workerStatus?.siteId !== selectedSite?.id) ? 'opacity-40 grayscale pointer-events-none' : ''}`}><Timer size={32} /> <span className="text-sm font-black uppercase tracking-tighter">Fin Descanso</span></button>
           </div>
        </div>
      );
      case Step.REPORT_EXIT: return (
        <div className="flex flex-col h-full animate-fadeIn overflow-hidden pb-4">
           <h2 className="text-xl font-black text-white mb-4 shrink-0">Reporte Diario</h2>
           <div className="bg-slate-900 p-5 rounded-[2rem] border border-slate-800 flex flex-col flex-1 gap-4 shadow-xl">
              <div className="shrink-0"><label className="text-[10px] font-bold text-slate-500 uppercase mb-2 block tracking-widest">Modo Trabajo</label><div className="flex gap-2">{['HORAS', 'DESTAJO'].map(m => (<button key={m} onClick={() => setExitWorkMode(m as WorkMode)} className={`flex-1 py-3 rounded-xl font-black text-xs transition ${exitWorkMode === m ? 'bg-blue-600 text-white' : 'bg-slate-950 text-slate-600'}`}>{m}</button>))}</div></div>
              <div className="flex flex-col flex-1"><label className="text-[10px] font-bold text-slate-500 uppercase mb-2 block tracking-widest">Tareas realizadas</label><textarea className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white flex-1 outline-none focus:border-blue-500 resize-none" placeholder="Escribe aquí..." value={exitReportText} onChange={(e)=>setExitReportText(e.target.value)} /></div>
              <button onClick={() => executeLogSubmission(LogType.SALIDA, exitReportText, exitWorkMode)} className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-xs shadow-lg active:scale-95 transition-all shrink-0">Finalizar Salida</button>
           </div>
        </div>
      );
      case Step.SUCCESS: return (
        <div className="flex flex-col items-center justify-center h-full gap-6 animate-fadeIn text-center">
           <div className="w-24 h-24 bg-emerald-600 rounded-[2rem] flex items-center justify-center shadow-2xl animate-bounce"><CheckCircle size={48} className="text-white" /></div>
           <div><h2 className="text-3xl font-black text-white">¡Listo!</h2><p className="text-slate-500 text-sm">Registro guardado correctamente.</p></div>
           <button onClick={() => setCurrentStep(Step.WORKER_DASHBOARD)} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black border border-slate-800 uppercase tracking-widest text-xs">Volver al Panel</button>
        </div>
      );
      case Step.WORKER_HISTORY: return (
        <div className="flex flex-col h-full animate-fadeIn overflow-hidden">
           <div className="flex items-center justify-between gap-4 mb-4 shrink-0"><div className="flex items-center gap-4"><button onClick={() => setCurrentStep(Step.WORKER_DASHBOARD)} className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 text-slate-400"><ChevronLeft size={20}/></button><h2 className="text-xl font-black text-white">Mi Actividad</h2></div><button onClick={handleDownloadPDF} className="p-2.5 bg-emerald-600/10 text-emerald-500 rounded-xl border border-emerald-500/20 active:bg-emerald-600 active:text-white"><Download size={20}/></button></div>
           <div className="space-y-3 mb-4 shrink-0"><div className="relative"><Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" /><input type="text" placeholder="Buscar obra o tarea..." className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-3 pl-11 pr-4 text-xs text-white outline-none focus:border-blue-500" value={historySearch} onChange={(e) => setHistorySearch(e.target.value)}/></div><div className="flex gap-2">{(['ALL', 'WEEK', 'MONTH'] as const).map(p => (<button key={p} onClick={() => setHistoryPeriod(p)} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${historyPeriod === p ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-500'}`}>{p === 'ALL' ? 'Todo' : p === 'WEEK' ? 'Semana' : 'Mes'}</button>))}</div>{historyPeriod === 'MONTH' && (<div className="animate-slideDown relative"><select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-3 px-4 text-xs font-bold text-blue-400 outline-none appearance-none">{MONTH_NAMES.map((name, idx) => (<option key={name} value={idx}>{name}</option>))}</select><ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} /></div>)}{historyPeriod === 'WEEK' && (<div className="animate-slideDown flex flex-col gap-1"><span className="text-[10px] text-slate-500 font-black uppercase tracking-widest ml-1">Elegir día de la semana:</span><div className="relative"><CalendarDays size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500" /><input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-3 pl-11 pr-4 text-xs font-bold text-white outline-none [color-scheme:dark]"/></div></div>)}</div>
           <div className="flex-1 overflow-y-auto space-y-3 pb-4 custom-scrollbar">{filteredHistory.map(log => (<div key={log.id} className="bg-slate-900 p-4 rounded-2xl border border-slate-800 animate-slideUp"><div className="flex justify-between items-start mb-2"><span className={`text-[10px] font-black uppercase tracking-widest ${log.type === LogType.ENTRADA ? 'text-emerald-400' : log.type === LogType.SALIDA ? 'text-rose-400' : 'text-blue-400'}`}>{log.type}</span><span className="text-[9px] text-slate-600 font-bold">{log.dateStr} • {log.timeStr}</span></div><p className="text-xs font-black text-white uppercase tracking-tight truncate">{log.siteName}</p>{log.workReport && <p className="text-[10px] text-slate-500 italic mt-1 line-clamp-2">"{log.workReport}"</p>}<div className="flex gap-2 mt-2"><span className="text-[8px] bg-slate-950 px-2 py-0.5 rounded text-slate-500 font-bold uppercase tracking-widest">{log.workMode || 'HORAS'}</span></div></div>))}{filteredHistory.length === 0 && (<div className="flex flex-col items-center justify-center py-20 text-slate-600"><History size={48} className="mb-4 opacity-20" /><p className="text-xs font-bold uppercase tracking-widest">Sin registros encontrados</p></div>)}</div>
        </div>
      );
      case Step.WORKER_TOOLS: return (
        <div className="flex flex-col h-full animate-fadeIn overflow-hidden">
          <div className="flex items-center gap-4 mb-4 shrink-0"><button onClick={() => setCurrentStep(Step.WORKER_DASHBOARD)} className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 text-slate-400"><ChevronLeft size={20}/></button><h2 className="text-xl font-black text-white">Herramientas</h2></div>
          <div className="bg-slate-900 p-4 rounded-3xl border border-slate-800 mb-4 space-y-3 shadow-lg shrink-0"><div className="space-y-1"><label htmlFor="tool-input" className="text-[10px] text-slate-500 font-black uppercase tracking-widest ml-1">Nombre Herramienta</label><input id="tool-input" list="tools-list" type="text" placeholder="Ej: Multímetro, Taladro..." className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white outline-none focus:border-blue-500" value={newToolName} onChange={(e)=>setNewToolName(e.target.value)}/><datalist id="tools-list">{ELECTRICAL_TOOLS_LIST.map(tool => <option key={tool} value={tool} />)}</datalist></div><div className="grid grid-cols-2 gap-2"><div className="space-y-1"><label htmlFor="brand-input" className="text-[10px] text-slate-500 font-black uppercase tracking-widest ml-1">Marca</label><input id="brand-input" list="brands-list" type="text" placeholder="Marca" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white outline-none focus:border-blue-500" value={newToolBrand} onChange={(e)=>setNewToolBrand(e.target.value)}/><datalist id="brands-list">{ELECTRICAL_BRANDS_LIST.map(brand => <option key={brand} value={brand} />)}</datalist></div><div className="space-y-1"><label className="text-[10px] text-slate-500 font-black uppercase tracking-widest ml-1">Modelo (Opcional)</label><input type="text" placeholder="Modelo" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white outline-none focus:border-blue-500" value={newToolModel} onChange={(e)=>setNewToolModel(e.target.value)}/></div></div><button onClick={handleAddTool} className="w-full bg-amber-600 text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest shadow-lg active:scale-95 transition-all">Añadir Equipo</button></div>
          <div className="flex-1 overflow-y-auto space-y-2 pb-4 custom-scrollbar">{allTools.filter(t => t.workerId === selectedWorker?.id).map(tool => (<div key={tool.id} className="bg-slate-900 border border-slate-800 p-3 rounded-2xl flex items-center justify-between animate-slideUp"><div className="flex items-center gap-3"><div className="bg-slate-950 p-2 rounded-lg text-amber-500"><Wrench size={14} /></div><div><h4 className="font-bold text-white text-xs">{tool.toolName}</h4><p className="text-[9px] text-slate-600 uppercase font-black">{tool.brand} • {tool.model || 'S/M'}</p></div></div><button onClick={() => StorageService.deleteTool(tool.id)} className="text-slate-700 hover:text-rose-500 p-2"><Trash2 size={16} /></button></div>))}{allTools.filter(t => t.workerId === selectedWorker?.id).length === 0 && (<div className="flex flex-col items-center justify-center py-10 opacity-20"><Wrench size={40} className="mb-2" /><p className="text-[10px] font-black uppercase tracking-widest">Sin herramientas registradas</p></div>)}</div>
        </div>
      );
      case Step.REGISTER: return (
        <div className="flex flex-col h-full animate-fadeIn overflow-hidden pb-4">
           <h2 className="text-2xl font-black text-white mb-4 shrink-0">Nueva Cuenta</h2>
           <div className="bg-slate-900 p-5 rounded-[2.5rem] border border-slate-800 space-y-3 shadow-xl overflow-y-auto custom-scrollbar flex-1"><input type="text" placeholder="Nombre completo" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-white focus:border-blue-500 outline-none" value={regName} onChange={(e)=>setRegName(e.target.value)}/><input type="text" placeholder="DNI / NIE" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-white focus:border-blue-500 outline-none" value={regDni} onChange={(e)=>setRegDni(e.target.value)}/><input type="tel" placeholder="Teléfono" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-white font-bold" value={regPhone} onChange={(e)=>setRegPhone(e.target.value)}/><div className="grid grid-cols-2 gap-3"><input type="password" placeholder="PIN" maxLength={4} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-white text-center tracking-[1em] outline-none" value={regPin} onChange={(e)=>setRegPin(e.target.value.replace(/\D/g,''))}/><input type="password" placeholder="Confirm" maxLength={4} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-white text-center tracking-[1em] outline-none" value={regPinConfirm} onChange={(e)=>setRegPinConfirm(e.target.value.replace(/\D/g,''))}/></div><button onClick={handleRegistration} className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-xs mt-4 active:scale-95 shadow-lg shrink-0">Registrarme</button></div>
        </div>
      );
      default: return null;
    }
  };

  if (isAdmin) return <AdminPanel onBack={() => setIsAdmin(false)} currentUser={currentAdminUser} />;

  if (isAppLoading) return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center gap-6 z-[100]">
       <AppLogo className="animate-pulse" size="lg" logoUrl={appConfig.logoUrl} scale={appConfig.logoScaleLogin} />
       <div className="w-48 h-1 bg-slate-900 rounded-full overflow-hidden">
          <div className="h-full bg-blue-600 animate-[loading_1.5s_ease-in-out_infinite]"></div>
       </div>
       <style>{`@keyframes loading { 0% { width: 0%; transform: translateX(-100%); } 50% { width: 100%; transform: translateX(0%); } 100% { width: 0%; transform: translateX(100%); } }`}</style>
    </div>
  );

  return (
    <div className="max-w-md mx-auto h-screen flex flex-col bg-slate-950 text-white p-4 relative overflow-hidden">
      {renderStep()}
      {showAdminLogin && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6 animate-fadeIn">
          <div className="bg-slate-900 w-full max-w-sm rounded-[2.5rem] border border-slate-800 p-8 shadow-2xl relative overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 to-indigo-600"></div>
             <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3"><div className="p-2 bg-blue-600/10 rounded-xl text-blue-500"><Shield size={24} /></div><h2 className="text-xl font-black text-white uppercase tracking-tighter">Admin Login</h2></div>
                <button onClick={() => setShowAdminLogin(false)} className="text-slate-500 hover:text-white"><X size={20} /></button>
             </div>
             <div className="space-y-4">
                <input type="text" placeholder="Usuario" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-white focus:border-blue-500 outline-none" value={adminUsernameInput} onChange={(e) => setAdminUsernameInput(e.target.value)}/>
                <input type="password" placeholder="Contraseña" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-white focus:border-blue-500 outline-none" value={adminPasswordInput} onChange={(e) => setAdminPasswordInput(e.target.value)}/>
                {adminError && <p className="text-rose-500 text-[10px] font-bold uppercase tracking-widest text-center">{adminError}</p>}
                <button onClick={verifyAdminPassword} className="w-full bg-blue-600 py-4 rounded-xl font-black uppercase text-xs tracking-widest shadow-lg active:scale-95 transition-all">Acceder al Panel</button>
             </div>
          </div>
        </div>
      )}
      {error && (<div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-rose-600 px-6 py-3 rounded-full text-xs font-black uppercase tracking-widest animate-bounce z-[200] shadow-2xl flex items-center gap-3"><ShieldAlert size={16} /> {error} <button onClick={() => setError('')} className="bg-white/20 p-1 rounded-full"><X size={12}/></button></div>)}
      {loading && (<div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[300] flex items-center justify-center"><div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 flex flex-col items-center gap-4"><div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500">Procesando...</p></div></div>)}
      <ConfirmationModal isOpen={confirmState.isOpen} title={`¿Confirmar ${confirmState.action}?`} message={`Vas a registrar un evento de ${confirmState.action} en la obra ${selectedSite?.name}. ¿Estás seguro?`} onConfirm={() => executeLogSubmission(confirmState.action!)} onCancel={() => setConfirmState({ isOpen: false, action: null })} />
    </div>
  );
};
