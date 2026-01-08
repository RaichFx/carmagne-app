
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

  // --- HELPER: PROCESAR TELÉFONO ESPAÑA ---
  const processSpanishPhone = (phone: string): string => {
    let cleaned = phone.trim().replace(/\s/g, '');
    
    // Convertir 0034 a +34
    if (cleaned.startsWith('0034')) cleaned = '+34' + cleaned.slice(4);
    
    // Si tiene 9 dígitos y empieza por 6, 7, 8 o 9, añadir +34
    if (cleaned.length === 9 && /^[6789]/.test(cleaned)) {
      cleaned = '+34' + cleaned;
    }
    
    // Si empieza por 34 sin el +, añadirlo
    if (cleaned.startsWith('34') && cleaned.length === 11) {
      cleaned = '+' + cleaned;
    }
    
    return cleaned;
  };

  const isPhoneValidSpain = (phone: string): boolean => {
    // Formato: +34 seguido de 9 dígitos que empiezan por 6, 7, 8 o 9
    return /^\+34[6789]\d{8}$/.test(phone);
  };

  const workerStatus = useMemo(() => {
    if (!selectedWorker) return null;
    const logs = workerLogs.filter(l => l.workerId === selectedWorker.id);
    if (logs.length === 0) return { type: 'INACTIVO', site: null, startTime: null };
    
    const lastLog = logs[0];
    if (lastLog.type === LogType.ENTRADA || lastLog.type === LogType.FIN_DESCANSO) {
      return { type: 'TRABAJANDO', site: lastLog.siteName, startTime: lastLog.timestamp };
    }
    if (lastLog.type === LogType.INICIO_DESCANSO) {
      return { type: 'DESCANSO', site: lastLog.siteName, startTime: lastLog.timestamp };
    }
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
    
    if(!isPhoneValidSpain(formattedPhone)) { 
      setError("Introduce un número de España válido (+34)"); 
      return; 
    }

    const worker = workers.find(w => w.phone && processSpanishPhone(w.phone) === formattedPhone);
    
    if (worker) {
      if (!worker.active) { setError("Cuenta desactivada."); return; }
      setSelectedWorker(worker); setPinInput(''); setError(''); setCurrentStep(Step.AUTHENTICATE);
    } else if(confirm("¿Este número no está registrado. ¿Quieres crear una cuenta nueva?")) {
      setRegPhone(formattedPhone); setError(''); setCurrentStep(Step.REGISTER);
    }
  };

  const handleRegistration = async () => {
    const formattedRegPhone = processSpanishPhone(regPhone);

    if (!regName || !regDni || !regPin || !formattedRegPhone) { setError('Todos los campos son obligatorios.'); return; }
    if (!isPhoneValidSpain(formattedRegPhone)) { setError('Solo se admiten números de España (+34)'); return; }
    if (regPin !== regPinConfirm) { setError('Los PINs no coinciden.'); return; }
    
    setLoading(true);
    const newWorker: Worker = { 
      id: `W${Date.now()}`, 
      name: regName, 
      dni: regDni, 
      phone: formattedRegPhone, 
      role: regRole, 
      pin: regPin, 
      qrCode: `QR_${Date.now()}`, 
      active: true, 
      defaultMode: 'HORAS' 
    };
    
    try {
      await StorageService.registerNewWorker(newWorker);
      setSelectedWorker(newWorker); setCurrentStep(Step.AUTHENTICATE);
    } catch (err) { setError('Error al registrar.'); } finally { setLoading(false); }
  };

  const handlePinInput = (digit: string) => {
    if (pinInput.length < 4) {
      const newPin = pinInput + digit;
      setPinInput(newPin);
      if (newPin.length === 4) {
        if (selectedWorker?.pin === newPin) {
          setCurrentStep(Step.WORKER_DASHBOARD); setError('');
        } else {
          setError('PIN Incorrecto'); setTimeout(() => setPinInput(''), 500);
        }
      }
    }
  };

  const handleActionSelect = (type: LogType) => setConfirmState({ isOpen: true, action: type });

  const handleConfirmAction = async () => {
    const type = confirmState.action;
    setConfirmState({ isOpen: false, action: null });
    if (!type) return;
    if (type === LogType.SALIDA) {
      setExitWorkMode(selectedWorker?.defaultMode || 'HORAS'); setExitReportText(''); setCurrentStep(Step.REPORT_EXIT);
    } else {
      executeLogSubmission(type);
    }
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
      const newLog: WorkLog = {
        id: `LOG-${Date.now()}`, workerId: selectedWorker!.id, workerName: selectedWorker!.name,
        siteId: selectedSite!.id, siteName: selectedSite!.name, type: type, timestamp: Date.now(),
        dateStr: new Date().toLocaleDateString('es-ES'), timeStr: new Date().toLocaleTimeString('es-ES'),
        location: loc, sentToWhatsapp: false, syncedToSheets: false, distanceMeters: distance, locationWarning: warning, workReport: report, workMode: mode
      };
      await StorageService.addLog(newLog);
      setCurrentStep(Step.SUCCESS);
    } catch (err) { setError('Error de GPS o Conexión.'); } finally { setLoading(false); }
  };

  const handleAddTool = async () => {
    if (!newToolName || !newToolBrand) { alert("Nombre y Marca obligatorios"); return; }
    const tool: ToolRecord = {
      id: `TOOL-${Date.now()}`, workerId: selectedWorker!.id, workerName: selectedWorker!.name,
      toolName: newToolName, brand: newToolBrand, model: newToolModel,
      timestamp: Date.now(), dateStr: new Date().toLocaleDateString('es-ES'), timeStr: new Date().toLocaleTimeString('es-ES')
    };
    await StorageService.addTool(tool);
    setNewToolName(''); setNewToolBrand(''); setNewToolModel(''); setToolSearchTerm('');
  };

  const resetApp = () => {
    setCurrentStep(Step.LOGIN_PHONE); setSelectedWorker(null); setSelectedSite(null); setError(''); setPinInput(''); setLoginPhone('');
  };

  const verifyAdminPassword = () => {
    const config = StorageService.getConfig();
    const masterPass = config.adminPassword || 'admin';
    const isMaster = adminPasswordInput === masterPass;
    const foundAdmin = admins.find(a => a.active && a.username.trim().toLowerCase() === adminUsernameInput.trim().toLowerCase() && a.password === adminPasswordInput);
    if (isMaster || foundAdmin) {
      setIsAdmin(true); setCurrentAdminUser(foundAdmin || null); setShowAdminLogin(false); setAdminUsernameInput(''); setAdminPasswordInput('');
    } else {
      setAdminError('Acceso denegado'); setAdminPasswordInput('');
    }
  };

  const renderWorkerDashboard = () => (
    <div className="flex flex-col gap-6 animate-fadeIn h-full">
      <div className="flex justify-between items-center px-2">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Trabajador</span>
          <span className="text-xl font-black text-white tracking-tight">{selectedWorker?.name}</span>
        </div>
        <button onClick={resetApp} className="text-slate-400 hover:text-white transition p-3 bg-slate-900 rounded-2xl border border-slate-800">
          <LogOut size={20} />
        </button>
      </div>

      <div className={`rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden transition-all duration-500 ${
        workerStatus?.type === 'TRABAJANDO' ? 'bg-gradient-to-br from-emerald-600 to-teal-800' :
        workerStatus?.type === 'DESCANSO' ? 'bg-gradient-to-br from-amber-500 to-orange-700' :
        'bg-gradient-to-br from-blue-600 to-indigo-800'
      }`}>
         <div className="relative z-10 flex flex-col items-center text-center">
           <div className="bg-white/20 p-4 rounded-3xl mb-4 backdrop-blur-md">
             {workerStatus?.type === 'TRABAJANDO' ? <Zap size={40} className="text-white fill-white/20 animate-pulse" /> :
              workerStatus?.type === 'DESCANSO' ? <Coffee size={40} className="text-white" /> :
              <Clock size={40} className="text-white" />}
           </div>
           
           <h2 className="text-3xl font-black text-white mb-1 tracking-tight">
             {workerStatus?.type === 'TRABAJANDO' ? 'Trabajando' :
              workerStatus?.type === 'DESCANSO' ? 'En Descanso' :
              'Fuera de Obra'}
           </h2>
           
           {workerStatus?.site && (
             <p className="text-white/80 text-sm font-bold uppercase tracking-widest flex items-center gap-2 mb-4">
               <MapPin size={14} /> {workerStatus.site}
             </p>
           )}

           {workerStatus?.startTime && (
             <div className="bg-black/20 px-6 py-2 rounded-2xl backdrop-blur-sm border border-white/10">
               <span className="text-2xl font-mono font-black text-white">
                 {formatElapsed(workerStatus.startTime)}
               </span>
             </div>
           )}
         </div>
         <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-3xl"></div>
      </div>

      <div className="grid grid-cols-1 gap-4">
         <button onClick={() => setCurrentStep(Step.SELECT_SITE)} className="group bg-slate-900 hover:bg-slate-800 border border-slate-800 p-8 rounded-[2.5rem] transition-all flex items-center justify-between shadow-lg">
           <div className="text-left">
             <span className="block text-2xl font-black text-white group-active:text-blue-400">Nuevo Registro</span>
             <span className="text-slate-500 text-xs font-medium">Entrada, Salida o Descanso</span>
           </div>
           <div className="bg-slate-950 p-5 rounded-[1.5rem] text-blue-500 shadow-inner group-active:scale-110 transition-transform">
             <Timer size={32} />
           </div>
         </button>
         
         <div className="grid grid-cols-2 gap-4">
           <button onClick={() => setCurrentStep(Step.WORKER_HISTORY)} className="group bg-slate-900 hover:bg-slate-800 border border-slate-800 p-6 rounded-3xl transition-all text-left flex flex-col gap-3">
             <div className="bg-slate-950 p-3 rounded-xl text-emerald-500 w-fit shadow-inner"><History size={22} /></div>
             <span className="font-bold text-white">Mi Historial</span>
           </button>
           <button onClick={() => setCurrentStep(Step.WORKER_TOOLS)} className="group bg-slate-900 hover:bg-slate-800 border border-slate-800 p-6 rounded-3xl transition-all text-left flex flex-col gap-3">
             <div className="bg-slate-950 p-3 rounded-xl text-amber-500 w-fit shadow-inner"><Wrench size={22} /></div>
             <span className="font-bold text-white">Herramientas</span>
           </button>
         </div>
      </div>
    </div>
  );

  const renderWorkerTools = () => {
    const myTools = allTools.filter(t => t.workerId === selectedWorker?.id);
    const filteredPredefined = ELECTRICAL_TOOLS_LIST.filter(t => t.toLowerCase().includes(toolSearchTerm.toLowerCase()));

    return (
      <div className="flex flex-col h-full animate-fadeIn">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => setCurrentStep(Step.WORKER_DASHBOARD)} className="bg-slate-900 p-3 rounded-2xl text-slate-400 border border-slate-800"><ChevronLeft size={20}/></button>
          <div><h2 className="text-xl font-bold text-white">Mis Herramientas</h2><p className="text-xs text-slate-500">Gestión de equipo industrial</p></div>
        </div>
        <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 mb-6 space-y-4 shadow-xl">
           <div className="relative">
             <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
             <input type="text" placeholder="Buscar herramienta..." className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-11 pr-4 py-3 text-sm text-white focus:border-amber-500 outline-none" value={toolSearchTerm} onChange={(e) => setToolSearchTerm(e.target.value)}/>
             {toolSearchTerm && filteredPredefined.length > 0 && (
               <div className="absolute top-full left-0 w-full mt-2 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-50 max-h-48 overflow-y-auto p-2">
                 {filteredPredefined.map(tool => (
                   <button key={tool} onClick={() => {setNewToolName(tool); setToolSearchTerm('');}} className="w-full text-left p-3 hover:bg-slate-800 rounded-xl text-sm text-slate-300">{tool}</button>
                 ))}
               </div>
             )}
           </div>
           <div className="space-y-3">
             <input type="text" placeholder="Nombre" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3.5 text-sm text-white outline-none" value={newToolName} onChange={(e)=>setNewToolName(e.target.value)}/>
             <div className="grid grid-cols-2 gap-3">
               <select className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 text-sm text-slate-400 outline-none" value={newToolBrand} onChange={(e)=>setNewToolBrand(e.target.value)}>
                 <option value="">Marca</option>
                 {ELECTRICAL_BRANDS_LIST.map(b => <option key={b} value={b}>{b}</option>)}
                 <option value="OTRA">Personalizada...</option>
               </select>
               <input type="text" placeholder="Modelo" className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 text-sm text-white outline-none" value={newToolModel} onChange={(e)=>setNewToolModel(e.target.value)}/>
             </div>
           </div>
           <button onClick={handleAddTool} className="w-full bg-amber-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 uppercase tracking-widest text-xs shadow-lg shadow-amber-900/20"><Plus size={18} /> Registrar</button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-3 pb-8 custom-scrollbar">
           {myTools.map(tool => (
             <div key={tool.id} className="bg-slate-900 border border-slate-800 p-5 rounded-3xl flex items-center justify-between group">
               <div className="flex items-center gap-4">
                 <div className="bg-slate-950 p-4 rounded-2xl text-amber-500 shadow-inner group-hover:scale-105 transition-transform"><Wrench size={20} /></div>
                 <div>
                   <h4 className="font-bold text-white text-sm">{tool.toolName}</h4>
                   <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">{tool.brand} • {tool.model || 'S/M'}</p>
                 </div>
               </div>
               <button onClick={() => StorageService.deleteTool(tool.id)} className="text-slate-600 hover:text-rose-500 p-2 transition-colors"><Trash2 size={18} /></button>
             </div>
           ))}
        </div>
      </div>
    );
  };

  const renderStep = () => {
    switch(currentStep) {
      case Step.LOGIN_PHONE: return (
        <div className="flex flex-col gap-8 animate-fadeIn pt-12">
          <div className="text-center">
            <div className="bg-blue-600 p-6 rounded-[2.5rem] inline-flex mb-8 shadow-xl shadow-blue-900/40"><Zap size={48} className="text-white fill-white/20" /></div>
            <h2 className="text-4xl font-black text-white mb-2 tracking-tighter">Carmagne Instal</h2>
            <p className="text-slate-500 text-sm font-medium">Solo números de España (+34)</p>
          </div>
          <div className="bg-slate-900/50 p-8 rounded-[2.5rem] border border-slate-800">
             <label className="block text-[10px] uppercase text-slate-500 font-black mb-4 tracking-widest">Teléfono Corporativo</label>
             <input type="tel" value={loginPhone} onChange={(e) => setLoginPhone(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl p-5 text-2xl font-black focus:border-blue-500 outline-none text-center tracking-widest" placeholder="600 000 000"/>
             <p className="text-center text-[10px] text-slate-600 mt-4 uppercase font-bold tracking-widest">Se añadirá +34 automáticamente</p>
             <button onClick={handlePhoneLogin} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-5 rounded-2xl shadow-xl shadow-blue-900/30 transition-all uppercase tracking-widest text-xs mt-8 flex items-center justify-center gap-3 active:scale-95">Comenzar <ArrowRight size={18} /></button>
          </div>
          <button onClick={() => setShowAdminLogin(true)} className="text-slate-700 text-[10px] font-black uppercase tracking-widest text-center mt-4">Acceso Administración</button>
        </div>
      );
      case Step.AUTHENTICATE: return (
        <div className="flex flex-col gap-6 animate-fadeIn items-center justify-center flex-1">
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-slate-900 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-slate-800"><Lock size={32} className="text-blue-500" /></div>
            <h2 className="text-3xl font-black text-white mb-2 tracking-tight">PIN de Acceso</h2>
            <p className="text-slate-400 text-sm">{selectedWorker?.name}</p>
          </div>
          <div className="flex gap-4 mb-10">
            {[0, 1, 2, 3].map(i => (<div key={i} className={`w-3 h-3 rounded-full transition-all ${i < pinInput.length ? 'bg-blue-500 scale-125' : 'bg-slate-800'}`}/>))}
          </div>
          <div className="grid grid-cols-3 gap-5 w-full max-w-[300px]">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (<button key={num} onClick={() => handlePinInput(num.toString())} className="h-20 rounded-3xl bg-slate-900 text-white text-2xl font-black border border-slate-800 active:bg-blue-600 active:scale-90 transition-all">{num}</button>))}
            <div />
            <button onClick={() => handlePinInput('0')} className="h-20 rounded-3xl bg-slate-900 text-white text-2xl font-black border border-slate-800 active:bg-blue-600 active:scale-90 transition-all">0</button>
            <button onClick={() => setPinInput('')} className="flex items-center justify-center text-rose-500"><Delete size={28} /></button>
          </div>
        </div>
      );
      case Step.WORKER_DASHBOARD: return renderWorkerDashboard();
      case Step.WORKER_TOOLS: return renderWorkerTools();
      case Step.SELECT_SITE: return (
        <div className="flex flex-col gap-6 animate-fadeIn h-full">
           <div className="flex items-center gap-4">
             <button onClick={() => setCurrentStep(Step.WORKER_DASHBOARD)} className="p-3 bg-slate-900 rounded-2xl border border-slate-800 text-slate-400"><ChevronLeft size={20}/></button>
             <h2 className="text-2xl font-black text-white">Selecciona Obra</h2>
           </div>
           <div className="grid gap-3 flex-1 overflow-y-auto pb-10 custom-scrollbar">
             {sites.map(site => (
               <button key={site.id} onClick={() => {setSelectedSite(site); setCurrentStep(Step.SELECT_ACTION);}} className="bg-slate-900 p-6 rounded-3xl border border-slate-800 text-left group active:border-blue-500 shadow-md">
                 <h3 className="font-bold text-white mb-1 group-active:text-blue-400">{site.name}</h3>
                 <p className="text-xs text-slate-500">{site.address}</p>
               </button>
             ))}
           </div>
        </div>
      );
      case Step.SELECT_ACTION: return (
        <div className="flex flex-col gap-6 animate-fadeIn h-full">
           <div className="flex items-center gap-4">
             <button onClick={() => setCurrentStep(Step.SELECT_SITE)} className="p-3 bg-slate-900 rounded-2xl border border-slate-800 text-slate-400"><ChevronLeft size={20}/></button>
             <div><h2 className="text-2xl font-black text-white">¿Qué vas a hacer?</h2><p className="text-xs text-blue-500 font-bold uppercase tracking-widest">{selectedSite?.name}</p></div>
           </div>
           <div className="grid grid-cols-1 gap-4">
             <button onClick={() => handleActionSelect(LogType.ENTRADA)} className="bg-emerald-600/10 border border-emerald-500/30 p-8 rounded-[2.5rem] flex flex-col items-center gap-4 text-emerald-500 active:bg-emerald-600 active:text-white transition group">
               <Zap size={40} className="fill-emerald-500/20 group-active:fill-white" /> <span className="text-xl font-black uppercase">Fichar Entrada</span>
             </button>
             <button onClick={() => handleActionSelect(LogType.SALIDA)} className="bg-rose-600/10 border border-rose-500/30 p-8 rounded-[2.5rem] flex flex-col items-center gap-4 text-rose-500 active:bg-rose-600 active:text-white transition group">
               <LogOut size={40} className="group-active:text-white" /> <span className="text-xl font-black uppercase">Fichar Salida</span>
             </button>
             <div className="grid grid-cols-2 gap-4">
               <button onClick={() => handleActionSelect(LogType.INICIO_DESCANSO)} className="bg-amber-600/10 border border-amber-500/30 p-6 rounded-3xl flex flex-col items-center gap-3 text-amber-500 transition active:bg-amber-600 active:text-white">
                 <Coffee size={24} /> <span className="text-xs font-black uppercase">Ini. Descanso</span>
               </button>
               <button onClick={() => handleActionSelect(LogType.FIN_DESCANSO)} className="bg-blue-600/10 border border-blue-500/30 p-6 rounded-3xl flex flex-col items-center gap-3 text-blue-500 transition active:bg-blue-600 active:text-white">
                 <Timer size={24} /> <span className="text-xs font-black uppercase">Fin Descanso</span>
               </button>
             </div>
           </div>
        </div>
      );
      case Step.REPORT_EXIT: return (
        <div className="flex flex-col gap-6 animate-fadeIn h-full">
           <h2 className="text-2xl font-black text-white">Reporte de Jornada</h2>
           <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 space-y-6 shadow-2xl">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-3 block tracking-widest">Modo de Trabajo</label>
                <div className="flex gap-2">
                   {['HORAS', 'DESTAJO'].map(m => (
                     <button key={m} onClick={() => setExitWorkMode(m as WorkMode)} className={`flex-1 py-4 rounded-2xl font-black transition ${exitWorkMode === m ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'bg-slate-950 text-slate-600 border border-slate-800'}`}>{m}</button>
                   ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-3 block tracking-widest">Resumen de Tareas</label>
                <textarea className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white min-h-[150px] outline-none focus:border-blue-500 transition-colors" placeholder="Describe brevemente el trabajo realizado..." value={exitReportText} onChange={(e)=>setExitReportText(e.target.value)} />
              </div>
              <button onClick={() => executeLogSubmission(LogType.SALIDA, exitReportText, exitWorkMode)} className="w-full bg-blue-600 text-white font-black py-5 rounded-2xl uppercase tracking-widest shadow-xl shadow-blue-900/20 active:scale-95 transition-transform">Finalizar Salida</button>
           </div>
        </div>
      );
      case Step.SUCCESS: return (
        <div className="flex flex-col items-center justify-center flex-1 gap-8 animate-fadeIn text-center">
           <div className="w-32 h-32 bg-emerald-600 rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-emerald-900/40 animate-bounce">
             <CheckCircle size={64} className="text-white" />
           </div>
           <div><h2 className="text-4xl font-black text-white mb-2 tracking-tighter">¡Registrado!</h2><p className="text-slate-400 font-medium">El registro se ha sincronizado con éxito.</p></div>
           <button onClick={() => setCurrentStep(Step.WORKER_DASHBOARD)} className="bg-slate-900 text-white px-10 py-5 rounded-2xl font-black border border-slate-800 uppercase tracking-widest text-xs">Volver al Dashboard</button>
        </div>
      );
      case Step.WORKER_HISTORY: return (
        <div className="flex flex-col h-full animate-fadeIn">
           <div className="flex items-center gap-4 mb-6">
             <button onClick={() => setCurrentStep(Step.WORKER_DASHBOARD)} className="p-3 bg-slate-900 rounded-2xl border border-slate-800 text-slate-400"><ChevronLeft size={20}/></button>
             <h2 className="text-2xl font-black text-white">Mi Historial</h2>
           </div>
           <div className="flex-1 overflow-y-auto space-y-4 pb-10 custom-scrollbar">
             {workerLogs.filter(l => l.workerId === selectedWorker?.id).map(log => (
               <div key={log.id} className="bg-slate-900 p-5 rounded-3xl border border-slate-800 shadow-md">
                 <div className="flex justify-between items-start mb-3">
                   <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg border ${
                     log.type === LogType.ENTRADA ? 'bg-emerald-900/40 text-emerald-400 border-emerald-800' : 
                     log.type === LogType.SALIDA ? 'bg-rose-900/40 text-rose-400 border-rose-800' :
                     'bg-amber-900/40 text-amber-400 border-amber-800'
                   }`}>{log.type}</span>
                   <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{log.dateStr} • {log.timeStr}</span>
                 </div>
                 <p className="text-sm font-black text-white mb-1 uppercase tracking-tight">{log.siteName}</p>
                 {log.workReport && <p className="text-xs text-slate-500 italic line-clamp-2">"{log.workReport}"</p>}
               </div>
             ))}
           </div>
        </div>
      );
      case Step.REGISTER: return (
        <div className="flex flex-col gap-6 animate-fadeIn pb-10">
           <h2 className="text-3xl font-black text-white tracking-tighter">Crear Cuenta</h2>
           <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 space-y-4 shadow-2xl">
              <input type="text" placeholder="Nombre completo" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white focus:border-blue-500 outline-none" value={regName} onChange={(e)=>setRegName(e.target.value)}/>
              <input type="text" placeholder="DNI / NIE" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white focus:border-blue-500 outline-none" value={regDni} onChange={(e)=>setRegDni(e.target.value)}/>
              <div className="space-y-2">
                 <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Teléfono (España)</label>
                 <input type="tel" placeholder="600 000 000" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white focus:border-blue-500 outline-none font-bold" value={regPhone} onChange={(e)=>setRegPhone(e.target.value)}/>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <input type="password" placeholder="PIN (4)" maxLength={4} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white text-center tracking-[1em] focus:border-blue-500 outline-none" value={regPin} onChange={(e)=>setRegPin(e.target.value.replace(/\D/g,''))}/>
                <input type="password" placeholder="Repetir PIN" maxLength={4} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white text-center tracking-[1em] focus:border-blue-500 outline-none" value={regPinConfirm} onChange={(e)=>setRegPinConfirm(e.target.value.replace(/\D/g,''))}/>
              </div>
              <button onClick={handleRegistration} className="w-full bg-blue-600 text-white font-black py-5 rounded-2xl uppercase tracking-widest shadow-xl shadow-blue-900/20 active:scale-95 transition-transform mt-4">Registrarse</button>
           </div>
        </div>
      );
      default: return <div className="text-center p-10 text-slate-500">Paso no encontrado</div>;
    }
  };

  if (isAppLoading) return (
    <div className="fixed inset-0 bg-slate-950 z-[100] flex flex-col items-center justify-center">
       <div className="bg-blue-600 p-8 rounded-[3rem] mb-6 shadow-2xl shadow-blue-500/40 animate-pulse"><Zap size={64} className="text-white fill-white/20" /></div>
       <h1 className="text-4xl font-black text-white tracking-tighter">CARMAGNE</h1>
       <div className="mt-4 flex gap-1">
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce delay-0"></div>
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce delay-100"></div>
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce delay-200"></div>
       </div>
    </div>
  );

  if (isAdmin) return <AdminPanel onBack={() => setIsAdmin(false)} currentUser={currentAdminUser} />;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden max-w-lg mx-auto border-x border-slate-900 shadow-2xl">
      <ConfirmationModal 
        isOpen={confirmState.isOpen}
        title="Confirmar Acción"
        message={confirmState.action === LogType.ENTRADA ? "Vas a iniciar tu jornada laboral en esta obra." : 
                 confirmState.action === LogType.SALIDA ? "Vas a marcar el final de tu jornada." :
                 "Vas a registrar este cambio de estado."}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmState({ isOpen: false, action: null })}
        isDestructive={confirmState.action === LogType.SALIDA}
      />

      {showAdminLogin && (
        <div className="fixed inset-0 z-[110] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-[2.5rem] w-full max-w-sm shadow-2xl">
            <h3 className="text-2xl font-black text-white mb-6 text-center tracking-tight">Acceso Admin</h3>
            <div className="space-y-4">
              <input type="text" placeholder="Usuario" className="w-full bg-slate-950 border border-slate-800 p-4 rounded-2xl text-white outline-none focus:border-blue-500" value={adminUsernameInput} onChange={(e)=>setAdminUsernameInput(e.target.value)}/>
              <input type="password" placeholder="Contraseña" className="w-full bg-slate-950 border border-slate-800 p-4 rounded-2xl text-white outline-none focus:border-blue-500" value={adminPasswordInput} onChange={(e)=>setAdminPasswordInput(e.target.value)}/>
              {adminError && <p className="text-rose-500 text-xs font-bold text-center uppercase tracking-widest">{adminError}</p>}
              <button onClick={verifyAdminPassword} className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-blue-900/20 active:scale-95 transition-transform">Entrar</button>
              <button onClick={() => {setShowAdminLogin(false); setAdminError('');}} className="w-full text-slate-500 text-[10px] font-black uppercase tracking-widest py-2">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      <header className="p-6 flex justify-between items-center border-b border-slate-900 sticky top-0 bg-slate-950/80 backdrop-blur-md z-40">
        <div className="flex items-center gap-3">
           <div className="bg-blue-600 p-2.5 rounded-xl shadow-lg shadow-blue-900/20"><Zap size={20} className="text-white fill-white/20" /></div>
           <h1 className="text-xl font-black tracking-tighter uppercase text-white">Carmagne</h1>
        </div>
        <button onClick={() => setShowAdminLogin(true)} className="p-3 bg-slate-900 text-slate-500 rounded-2xl border border-slate-800 active:text-white transition-colors shadow-lg"><Lock size={18} /></button>
      </header>

      <main className="flex-1 overflow-y-auto p-6 relative custom-scrollbar">
        {error && <div className="mb-6 p-5 bg-rose-500/10 border border-rose-500/30 text-rose-500 rounded-2xl flex items-center gap-3 animate-slideDown text-xs font-black uppercase tracking-widest"><ShieldAlert size={20} />{error}</div>}
        {loading && <div className="absolute inset-0 z-50 bg-slate-950/60 flex items-center justify-center backdrop-blur-sm"><div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>}
        {renderStep()}
      </main>

      <footer className="p-6 text-center text-slate-800 text-[10px] font-black tracking-[0.5em] uppercase border-t border-slate-900">
        Carmagne Solu 2024 • V4.1
      </footer>
    </div>
  );
}

export default App;
