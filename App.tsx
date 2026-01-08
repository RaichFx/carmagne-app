
import React, { useState, useEffect, useMemo } from 'react';
import { 
  User, MapPin, CheckCircle, 
  LogOut, Coffee, ArrowRight, ShieldAlert, Lock, Fingerprint, Delete, UserPlus, Save, ChevronLeft, Calendar, History, Clock, Smartphone, X, Mic, MicOff, FileText, Cloud, ExternalLink, Briefcase, Phone, KeyRound, BellRing, Search, Download, CalendarDays, Zap, Wrench, Package, Info, Plus, Trash2, Timer
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { StorageService, ELECTRICAL_TOOLS_LIST, ELECTRICAL_BRANDS_LIST } from './services/storageService';
import { LocationService } from './services/locationService';
import { Worker, Site, WorkLog, LogType, GeoLocationData, WorkMode, AdminUser, ToolRecord } from './types';
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

function App() {
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
  const [selectedAction, setSelectedAction] = useState<LogType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmState, setConfirmState] = useState<{isOpen: boolean; action: LogType | null;}>({ isOpen: false, action: null });

  const [currentTime, setCurrentTime] = useState(new Date());

  const [allTools, setAllTools] = useState<ToolRecord[]>([]);
  const [newToolName, setNewToolName] = useState('');
  const [newToolBrand, setNewToolBrand] = useState('');
  const [newToolModel, setNewToolModel] = useState('');
  const [toolSearchTerm, setToolSearchTerm] = useState('');

  const [exitReportText, setExitReportText] = useState('');
  const [exitWorkMode, setExitWorkMode] = useState<WorkMode>('HORAS');
  const [pinInput, setPinInput] = useState('');
  const [regName, setRegName] = useState('');
  const [regDni, setRegDni] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regRole, setRegRole] = useState('');
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

    const unsubWorkers = StorageService.subscribeToWorkers(setWorkers);
    const unsubSites = StorageService.subscribeToSites(setSites);
    const unsubLogs = StorageService.subscribeToLogs(setWorkerLogs);
    const unsubAdmins = StorageService.subscribeToAdmins(setAdmins);
    const unsubTools = StorageService.subscribeToTools(setAllTools);
    
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      unsubWorkers(); unsubSites(); unsubLogs(); unsubAdmins(); unsubTools();
    };
  }, []);

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
    const logs = workerLogs.filter(l => l.workerId === selectedWorker.id);
    if (logs.length === 0) return { type: 'INACTIVO', site: null, startTime: null };
    const lastLog = logs[0];
    if (lastLog.type === LogType.ENTRADA || lastLog.type === LogType.FIN_DESCANSO) return { type: 'TRABAJANDO', site: lastLog.siteName, startTime: lastLog.timestamp };
    if (lastLog.type === LogType.INICIO_DESCANSO) return { type: 'DESCANSO', site: lastLog.siteName, startTime: lastLog.timestamp };
    return { type: 'INACTIVO', site: null, startTime: null };
  }, [workerLogs, selectedWorker]);

  const formatElapsed = (startTime: number) => {
    const diff = currentTime.getTime() - startTime;
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
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
    // Validar si la acción es permitida según el estado actual
    if (type === LogType.ENTRADA && workerStatus?.type !== 'INACTIVO') {
        setError("Ya tienes una entrada activa. Debes fichar SALIDA primero.");
        return;
    }
    if (type === LogType.INICIO_DESCANSO && workerStatus?.type !== 'TRABAJANDO') {
        setError("Solo puedes iniciar descanso si estás TRABAJANDO.");
        return;
    }
    if (type === LogType.FIN_DESCANSO && workerStatus?.type !== 'DESCANSO') {
        setError("Solo puedes finalizar descanso si estás EN PAUSA.");
        return;
    }
    if (type === LogType.SALIDA && workerStatus?.type === 'INACTIVO') {
        setError("No puedes fichar salida sin haber fichado entrada.");
        return;
    }

    setConfirmState({ isOpen: true, action: type });
  };

  const handleConfirmAction = async () => {
    const type = confirmState.action; setConfirmState({ isOpen: false, action: null }); if (!type) return;
    if (type === LogType.SALIDA) { setExitWorkMode(selectedWorker?.defaultMode || 'HORAS'); setExitReportText(''); setCurrentStep(Step.REPORT_EXIT); }
    else executeLogSubmission(type);
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
    } catch (err) { setError('Error de GPS o Conexión.'); } finally { setLoading(false); }
  };

  const resetApp = () => { setCurrentStep(Step.LOGIN_PHONE); setSelectedWorker(null); setSelectedSite(null); setError(''); setPinInput(''); setLoginPhone(''); };

  const handleAddTool = async () => {
    if (!newToolName || !selectedWorker) return;
    const tool: ToolRecord = { id: `T-${Date.now()}`, workerId: selectedWorker.id, workerName: selectedWorker.name, toolName: newToolName, brand: newToolBrand, model: newToolModel, timestamp: Date.now(), dateStr: new Date().toLocaleDateString('es-ES'), timeStr: new Date().toLocaleTimeString('es-ES') };
    await StorageService.addTool(tool); setNewToolName(''); setNewToolBrand(''); setNewToolModel('');
  };

  const verifyAdminPassword = () => {
    const config = StorageService.getConfig();
    if (adminUsernameInput === 'admin' && adminPasswordInput === (config.adminPassword || 'admin')) {
      setIsAdmin(true); setCurrentAdminUser(null); setShowAdminLogin(false); setAdminError(''); setAdminUsernameInput(''); setAdminPasswordInput('');
      return;
    }
    const foundAdmin = admins.find(a => a.active && a.username === adminUsernameInput && a.password === adminPasswordInput);
    if (foundAdmin) {
      setIsAdmin(true); setCurrentAdminUser(foundAdmin); setShowAdminLogin(false); setAdminError(''); setAdminUsernameInput(''); setAdminPasswordInput('');
    } else { setAdminError('Usuario o contraseña incorrectos'); }
  };

  const renderWorkerDashboard = () => (
    <div className="flex flex-col gap-4 animate-fadeIn h-full overflow-hidden">
      <div className="flex justify-between items-center h-12">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Trabajador</span>
          <span className="text-lg font-black text-white leading-none">{selectedWorker?.name}</span>
        </div>
        <button onClick={resetApp} className="text-slate-400 p-2.5 bg-slate-900 rounded-xl border border-slate-800"><LogOut size={18} /></button>
      </div>

      <div className={`rounded-3xl p-5 shadow-xl relative overflow-hidden flex items-center justify-between border border-white/5 ${
        workerStatus?.type === 'TRABAJANDO' ? 'bg-gradient-to-r from-emerald-600 to-teal-800' :
        workerStatus?.type === 'DESCANSO' ? 'bg-gradient-to-r from-amber-500 to-orange-700' :
        'bg-gradient-to-r from-blue-600 to-indigo-800'
      }`}>
         <div className="relative z-10 flex items-center gap-4">
           <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-md">
             {workerStatus?.type === 'TRABAJANDO' ? <Zap size={28} className="text-white fill-white/20" /> :
              workerStatus?.type === 'DESCANSO' ? <Coffee size={28} className="text-white" /> :
              <Clock size={28} className="text-white" />}
           </div>
           <div>
             <h2 className="text-xl font-black text-white leading-none">{workerStatus?.type === 'TRABAJANDO' ? 'Trabajando' : workerStatus?.type === 'DESCANSO' ? 'En Pausa' : 'Sin Obra'}</h2>
             {workerStatus?.site && <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest mt-1 flex items-center gap-1"><MapPin size={10} /> {workerStatus.site}</p>}
           </div>
         </div>
         {workerStatus?.startTime && (
           <div className="bg-black/20 px-4 py-2 rounded-xl backdrop-blur-sm border border-white/10 z-10">
             <span className="text-lg font-mono font-black text-white">{formatElapsed(workerStatus.startTime)}</span>
           </div>
         )}
         <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-12 -mt-12 blur-2xl"></div>
      </div>

      <div className="grid grid-cols-1 gap-3 flex-1 overflow-hidden">
         <button onClick={() => setCurrentStep(Step.SELECT_SITE)} className="group bg-slate-900 border border-slate-800 p-5 rounded-[2rem] flex items-center justify-between shadow-lg active:scale-95 transition-all">
           <div>
             <span className="block text-xl font-black text-white">Nuevo Fichaje</span>
             <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Registrar Movimiento</span>
           </div>
           <div className="bg-blue-600/10 p-4 rounded-2xl text-blue-500"><Timer size={28} /></div>
         </button>
         
         <div className="grid grid-cols-2 gap-3">
           <button onClick={() => setCurrentStep(Step.WORKER_HISTORY)} className="bg-slate-900 border border-slate-800 p-4 rounded-[2rem] flex flex-col items-center justify-center gap-2 active:bg-slate-800">
             <div className="text-emerald-500"><History size={24} /></div>
             <span className="text-xs font-black text-white uppercase tracking-widest">Historial</span>
           </button>
           <button onClick={() => setCurrentStep(Step.WORKER_TOOLS)} className="bg-slate-900 border border-slate-800 p-4 rounded-[2rem] flex flex-col items-center justify-center gap-2 active:bg-slate-800">
             <div className="text-amber-500"><Wrench size={24} /></div>
             <span className="text-xs font-black text-white uppercase tracking-widest">Equipos</span>
           </button>
         </div>
      </div>
    </div>
  );

  const renderStep = () => {
    switch(currentStep) {
      case Step.LOGIN_PHONE: return (
        <div className="flex flex-col h-full animate-fadeIn justify-center gap-8 py-4">
          <div className="text-center">
            <div className="bg-blue-600 p-5 rounded-[2rem] inline-flex mb-4 shadow-xl"><Zap size={40} className="text-white fill-white/20" /></div>
            <h2 className="text-3xl font-black text-white tracking-tighter">Carmagne Solu</h2>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.2em]">Acceso Operario</p>
          </div>
          <div className="bg-slate-900/50 p-6 rounded-[2.5rem] border border-slate-800">
             <input type="tel" value={loginPhone} onChange={(e) => setLoginPhone(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl p-5 text-2xl font-black focus:border-blue-500 outline-none text-center tracking-widest" placeholder="600000000"/>
             <button onClick={handlePhoneLogin} className="w-full bg-blue-600 text-white font-black py-5 rounded-2xl shadow-lg mt-6 flex items-center justify-center gap-3 active:scale-95 uppercase text-xs tracking-widest">Entrar <ArrowRight size={16} /></button>
          </div>
          <button onClick={() => setShowAdminLogin(true)} className="text-slate-800 text-[10px] font-black uppercase tracking-[0.4em] text-center">Admin Panel</button>
        </div>
      );
      case Step.AUTHENTICATE: return (
        <div className="flex flex-col h-full animate-fadeIn items-center justify-center gap-4">
          <div className="text-center mb-4">
            <div className="w-16 h-16 bg-slate-900 rounded-3xl flex items-center justify-center mx-auto mb-3 border border-slate-800"><Lock size={28} className="text-blue-500" /></div>
            <h2 className="text-xl font-black text-white">Introduce PIN</h2>
            <p className="text-slate-500 text-xs">{selectedWorker?.name}</p>
          </div>
          <div className="flex gap-4 mb-6">
            {[0, 1, 2, 3].map(i => (<div key={i} className={`w-3 h-3 rounded-full ${i < pinInput.length ? 'bg-blue-500 scale-125' : 'bg-slate-800'}`}/>))}
          </div>
          <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, 'del'].map((val, i) => (
              val === '' ? <div key={i}/> :
              val === 'del' ? <button key={i} onClick={() => setPinInput('')} className="h-16 flex items-center justify-center text-rose-500"><Delete size={24} /></button> :
              <button key={i} onClick={() => handlePinInput(val.toString())} className="h-16 rounded-2xl bg-slate-900 text-white text-xl font-black border border-slate-800 active:bg-blue-600">{val}</button>
            ))}
          </div>
        </div>
      );
      case Step.WORKER_DASHBOARD: return renderWorkerDashboard();
      case Step.SELECT_SITE: return (
        <div className="flex flex-col h-full animate-fadeIn overflow-hidden">
           <div className="flex items-center gap-4 mb-4">
             <button onClick={() => setCurrentStep(Step.WORKER_DASHBOARD)} className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 text-slate-400"><ChevronLeft size={20}/></button>
             <h2 className="text-xl font-black text-white">Selecciona Obra</h2>
           </div>
           <div className="flex-1 overflow-y-auto space-y-2 pb-4 custom-scrollbar">
             {sites.map(site => (
               <button key={site.id} onClick={() => {setSelectedSite(site); setCurrentStep(Step.SELECT_ACTION);}} className="w-full bg-slate-900 p-4 rounded-2xl border border-slate-800 text-left active:border-blue-500">
                 <h3 className="font-bold text-white text-sm">{site.name}</h3>
                 <p className="text-[10px] text-slate-500 truncate uppercase tracking-widest">{site.address}</p>
               </button>
             ))}
           </div>
        </div>
      );
      case Step.SELECT_ACTION: return (
        <div className="flex flex-col h-full animate-fadeIn overflow-hidden">
           <div className="flex items-center gap-4 mb-6">
             <button onClick={() => setCurrentStep(Step.SELECT_SITE)} className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 text-slate-400"><ChevronLeft size={20}/></button>
             <div><h2 className="text-xl font-black text-white">Acción en Obra</h2><p className="text-[10px] text-blue-500 font-bold uppercase tracking-widest">{selectedSite?.name}</p></div>
           </div>
           <div className="grid grid-cols-2 gap-3 flex-1 pb-4">
             {/* BOTÓN ENTRADA: Solo si está INACTIVO */}
             <button 
                disabled={workerStatus?.type !== 'INACTIVO'}
                onClick={() => handleActionSelect(LogType.ENTRADA)} 
                className={`bg-emerald-600/10 border border-emerald-500/20 rounded-[2rem] flex flex-col items-center justify-center gap-3 text-emerald-500 active:bg-emerald-600 active:text-white transition-all ${workerStatus?.type !== 'INACTIVO' ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}
             >
               <Zap size={32} /> <span className="text-sm font-black uppercase">Entrada</span>
             </button>

             {/* BOTÓN SALIDA: Solo si NO está INACTIVO */}
             <button 
                disabled={workerStatus?.type === 'INACTIVO'}
                onClick={() => handleActionSelect(LogType.SALIDA)} 
                className={`bg-rose-600/10 border border-rose-500/20 rounded-[2rem] flex flex-col items-center justify-center gap-3 text-rose-500 active:bg-rose-600 active:text-white transition-all ${workerStatus?.type === 'INACTIVO' ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}
             >
               <LogOut size={32} /> <span className="text-sm font-black uppercase">Salida</span>
             </button>

             {/* BOTÓN INICIO DESCANSO: Solo si está TRABAJANDO */}
             <button 
                disabled={workerStatus?.type !== 'TRABAJANDO'}
                onClick={() => handleActionSelect(LogType.INICIO_DESCANSO)} 
                className={`bg-amber-600/10 border border-amber-500/20 rounded-[2rem] flex flex-col items-center justify-center gap-3 text-amber-500 active:bg-amber-600 active:text-white transition-all ${workerStatus?.type !== 'TRABAJANDO' ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}
             >
               <Coffee size={32} /> <span className="text-sm font-black uppercase tracking-tighter">Ini Descanso</span>
             </button>

             {/* BOTÓN FIN DESCANSO: Solo si está DESCANSO */}
             <button 
                disabled={workerStatus?.type !== 'DESCANSO'}
                onClick={() => handleActionSelect(LogType.FIN_DESCANSO)} 
                className={`bg-blue-600/10 border border-blue-500/20 rounded-[2rem] flex flex-col items-center justify-center gap-3 text-blue-500 active:bg-blue-600 active:text-white transition-all ${workerStatus?.type !== 'DESCANSO' ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}
             >
               <Timer size={32} /> <span className="text-sm font-black uppercase tracking-tighter">Fin Descanso</span>
             </button>
           </div>
        </div>
      );
      case Step.REPORT_EXIT: return (
        <div className="flex flex-col h-full animate-fadeIn overflow-hidden pb-4">
           <h2 className="text-xl font-black text-white mb-4">Reporte Diario</h2>
           <div className="bg-slate-900 p-5 rounded-[2rem] border border-slate-800 flex flex-col flex-1 gap-4 shadow-xl">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase mb-2 block tracking-widest">Modo Trabajo</label>
                <div className="flex gap-2">
                   {['HORAS', 'DESTAJO'].map(m => (
                     <button key={m} onClick={() => setExitWorkMode(m as WorkMode)} className={`flex-1 py-3 rounded-xl font-black text-xs transition ${exitWorkMode === m ? 'bg-blue-600 text-white' : 'bg-slate-950 text-slate-600'}`}>{m}</button>
                   ))}
                </div>
              </div>
              <div className="flex flex-col flex-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase mb-2 block tracking-widest">Tareas realizadas</label>
                <textarea className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white flex-1 outline-none focus:border-blue-500 resize-none" placeholder="Escribe aquí..." value={exitReportText} onChange={(e)=>setExitReportText(e.target.value)} />
              </div>
              <button onClick={() => executeLogSubmission(LogType.SALIDA, exitReportText, exitWorkMode)} className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-xs shadow-lg active:scale-95 transition-all">Finalizar Salida</button>
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
           <div className="flex items-center gap-4 mb-4">
             <button onClick={() => setCurrentStep(Step.WORKER_DASHBOARD)} className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 text-slate-400"><ChevronLeft size={20}/></button>
             <h2 className="text-xl font-black text-white">Mi Actividad</h2>
           </div>
           <div className="flex-1 overflow-y-auto space-y-3 pb-4 custom-scrollbar">
             {workerLogs.filter(l => l.workerId === selectedWorker?.id).map(log => (
               <div key={log.id} className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
                 <div className="flex justify-between items-start mb-2">
                   <span className="text-[10px] font-black uppercase text-blue-400 tracking-widest">{log.type}</span>
                   <span className="text-[9px] text-slate-600 font-bold">{log.dateStr} • {log.timeStr}</span>
                 </div>
                 <p className="text-xs font-black text-white uppercase tracking-tight truncate">{log.siteName}</p>
                 {log.workReport && <p className="text-[10px] text-slate-500 italic mt-1 line-clamp-1">"{log.workReport}"</p>}
               </div>
             ))}
           </div>
        </div>
      );
      case Step.WORKER_TOOLS: return (
        <div className="flex flex-col h-full animate-fadeIn overflow-hidden">
          <div className="flex items-center gap-4 mb-4">
            <button onClick={() => setCurrentStep(Step.WORKER_DASHBOARD)} className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 text-slate-400"><ChevronLeft size={20}/></button>
            <h2 className="text-xl font-black text-white">Herramientas</h2>
          </div>
          <div className="bg-slate-900 p-4 rounded-3xl border border-slate-800 mb-4 space-y-3 shadow-lg">
             <input type="text" placeholder="Nombre" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white" value={newToolName} onChange={(e)=>setNewToolName(e.target.value)}/>
             <div className="grid grid-cols-2 gap-2">
               <select className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[10px] text-slate-400" value={newToolBrand} onChange={(e)=>setNewToolBrand(e.target.value)}>
                 <option value="">Marca</option>
                 {ELECTRICAL_BRANDS_LIST.map(b => <option key={b} value={b}>{b}</option>)}
               </select>
               <input type="text" placeholder="Modelo" className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white" value={newToolModel} onChange={(e)=>setNewToolModel(e.target.value)}/>
             </div>
             <button onClick={handleAddTool} className="w-full bg-amber-600 text-white font-black py-3 rounded-xl uppercase text-[10px] tracking-widest">Añadir Equipo</button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pb-4 custom-scrollbar">
             {allTools.filter(t => t.workerId === selectedWorker?.id).map(tool => (
               <div key={tool.id} className="bg-slate-900 border border-slate-800 p-3 rounded-2xl flex items-center justify-between">
                 <div className="flex items-center gap-3">
                   <div className="bg-slate-950 p-2 rounded-lg text-amber-500"><Wrench size={14} /></div>
                   <div>
                     <h4 className="font-bold text-white text-xs">{tool.toolName}</h4>
                     <p className="text-[9px] text-slate-600 uppercase font-black">{tool.brand} • {tool.model || 'S/M'}</p>
                   </div>
                 </div>
                 <button onClick={() => StorageService.deleteTool(tool.id)} className="text-slate-700 hover:text-rose-500 p-2"><Trash2 size={16} /></button>
               </div>
             ))}
          </div>
        </div>
      );
      case Step.REGISTER: return (
        <div className="flex flex-col h-full animate-fadeIn overflow-hidden pb-4">
           <h2 className="text-2xl font-black text-white mb-4">Nueva Cuenta</h2>
           <div className="bg-slate-900 p-5 rounded-[2.5rem] border border-slate-800 space-y-3 shadow-xl overflow-y-auto custom-scrollbar">
              <input type="text" placeholder="Nombre completo" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-white focus:border-blue-500 outline-none" value={regName} onChange={(e)=>setRegName(e.target.value)}/>
              <input type="text" placeholder="DNI / NIE" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-white focus:border-blue-500 outline-none" value={regDni} onChange={(e)=>setRegDni(e.target.value)}/>
              <input type="tel" placeholder="Teléfono" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-white font-bold" value={regPhone} onChange={(e)=>setRegPhone(e.target.value)}/>
              <div className="grid grid-cols-2 gap-3">
                <input type="password" placeholder="PIN (4)" maxLength={4} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-white text-center tracking-[1em] outline-none" value={regPin} onChange={(e)=>setRegPin(e.target.value.replace(/\D/g,''))}/>
                <input type="password" placeholder="Repetir" maxLength={4} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-white text-center tracking-[1em] outline-none" value={regPinConfirm} onChange={(e)=>setRegPinConfirm(e.target.value.replace(/\D/g,''))}/>
              </div>
              <button onClick={handleRegistration} className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-xs mt-4 active:scale-95 shadow-lg">Registrarme</button>
           </div>
        </div>
      );
      default: return <div className="text-center p-10 text-slate-500">Error</div>;
    }
  };

  if (isAppLoading) return (
    <div className="fixed inset-0 bg-slate-950 z-[100] flex flex-col items-center justify-center">
       <div className="bg-blue-600 p-8 rounded-[3rem] mb-6 animate-pulse"><Zap size={64} className="text-white fill-white/20" /></div>
       <h1 className="text-3xl font-black text-white tracking-tighter">CARMAGNE</h1>
    </div>
  );

  if (isAdmin) return <AdminPanel onBack={() => setIsAdmin(false)} currentUser={currentAdminUser} />;

  return (
    <div className="h-[100dvh] bg-slate-950 text-slate-100 flex flex-col overflow-hidden max-w-lg mx-auto border-x border-slate-900 shadow-2xl relative">
      <ConfirmationModal 
        isOpen={confirmState.isOpen}
        title="Confirmar"
        message={`¿Vas a registrar ${confirmState.action}?`}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmState({ isOpen: false, action: null })}
        isDestructive={confirmState.action === LogType.SALIDA}
      />

      {showAdminLogin && (
        <div className="fixed inset-0 z-[110] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-[2.5rem] w-full max-w-sm shadow-2xl">
            <h3 className="text-xl font-black text-white mb-4 text-center">Admin Access</h3>
            <div className="space-y-3">
              <input type="text" placeholder="Usuario" className="w-full bg-slate-950 border border-slate-800 p-4 rounded-xl text-white outline-none focus:border-blue-500" value={adminUsernameInput} onChange={(e)=>setAdminUsernameInput(e.target.value)}/>
              <input type="password" placeholder="Pass" className="w-full bg-slate-950 border border-slate-800 p-4 rounded-xl text-white outline-none focus:border-blue-500" value={adminPasswordInput} onChange={(e)=>setAdminPasswordInput(e.target.value)}/>
              {adminError && <p className="text-rose-500 text-[10px] font-black text-center uppercase">{adminError}</p>}
              <button onClick={verifyAdminPassword} className="w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase text-xs tracking-widest shadow-lg">Entrar</button>
              <button onClick={() => {setShowAdminLogin(false); setAdminError('');}} className="w-full text-slate-600 text-[10px] font-black uppercase py-2">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      <header className="p-4 flex justify-between items-center border-b border-slate-900 bg-slate-950 z-40 h-16 shrink-0">
        <div className="flex items-center gap-2">
           <div className="bg-blue-600 p-1.5 rounded-lg"><Zap size={16} className="text-white" /></div>
           <h1 className="text-sm font-black tracking-tighter uppercase text-white">Carmagne</h1>
        </div>
        <button onClick={() => setShowAdminLogin(true)} className="p-2.5 bg-slate-900 text-slate-500 rounded-xl border border-slate-800 active:text-white"><Lock size={16} /></button>
      </header>

      <main className="flex-1 overflow-hidden p-4 relative flex flex-col">
        {error && <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-xl flex items-center gap-2 animate-slideDown text-[10px] font-black uppercase"><ShieldAlert size={16} />{error}</div>}
        {loading && <div className="absolute inset-0 z-50 bg-slate-950/60 flex items-center justify-center backdrop-blur-sm"><div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>}
        <div className="flex-1 overflow-hidden">{renderStep()}</div>
      </main>

      <footer className="h-10 flex items-center justify-center text-slate-800 text-[8px] font-black tracking-[0.5em] uppercase border-t border-slate-900 shrink-0">
        Carmagne Solu 2024 • V4.4
      </footer>
    </div>
  );
}

export default App;
