
import React, { useState, useEffect } from 'react';
import { 
  User, MapPin, CheckCircle, 
  LogOut, Coffee, ArrowRight, ShieldAlert, Lock, Fingerprint, Delete, UserPlus, Save, ChevronLeft, Calendar, History, Clock, Smartphone, X, Mic, MicOff, FileText, Cloud, ExternalLink, Briefcase, Phone, KeyRound, BellRing, Search, Download, CalendarDays, Zap, Wrench, Package, Info, Plus, Trash2
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

  // Herramientas
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
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => setIsAppLoading(false), 2000);
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
      clearTimeout(timer); unsubWorkers(); unsubSites(); unsubLogs(); unsubAdmins(); unsubTools();
    };
  }, []);

  const handlePhoneLogin = () => {
    if(!loginPhone || loginPhone.length < 6) { setError("Ingresa un teléfono válido"); return; }
    const worker = workers.find(w => w.phone && w.phone.replace(/\s/g, '') === loginPhone.replace(/\s/g, ''));
    if (worker) {
      if (!worker.active) { setError("Cuenta desactivada."); return; }
      setSelectedWorker(worker); setPinInput(''); setError(''); setCurrentStep(Step.AUTHENTICATE);
    } else if(confirm("¿No tienes cuenta? ¿Quieres registrarte ahora?")) {
      setRegPhone(loginPhone); setError(''); setCurrentStep(Step.REGISTER);
    }
  };

  const handleRegistration = async () => {
    if (!regName || !regDni || !regPin || !regPhone) { setError('Todos los campos son obligatorios.'); return; }
    if (regPin !== regPinConfirm) { setError('Los PINs no coinciden.'); return; }
    setLoading(true);
    const newWorker: Worker = { id: `W${Date.now()}`, name: regName, dni: regDni, phone: regPhone.trim(), role: regRole, pin: regPin, qrCode: `QR_${Date.now()}`, active: true, defaultMode: 'HORAS' };
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

  // --- RENDERERS ---

  const renderWorkerDashboard = () => (
    <div className="flex flex-col gap-6 animate-fadeIn h-full">
      <div className="flex justify-between items-center px-2">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Trabajador Activo</span>
          <span className="text-xl font-black text-white tracking-tight">{selectedWorker?.name}</span>
        </div>
        <button onClick={resetApp} className="text-slate-400 hover:text-white transition p-3 bg-slate-900 rounded-2xl border border-slate-800">
          <LogOut size={20} />
        </button>
      </div>

      <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
         <div className="relative z-10">
           <Zap size={32} className="text-white fill-white/20 mb-4" />
           <h2 className="text-3xl font-black text-white mb-1 tracking-tight">Carmagne Instal</h2>
           <p className="text-blue-100/70 text-sm font-medium">Panel de Operaciones</p>
         </div>
         <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-3xl"></div>
      </div>

      <div className="grid grid-cols-1 gap-4">
         <button onClick={() => setCurrentStep(Step.SELECT_SITE)} className="group bg-slate-900 hover:bg-slate-800 border border-slate-800 p-6 rounded-3xl transition-all flex items-center justify-between">
           <div className="text-left"><span className="block text-xl font-bold text-white">Nuevo Registro</span><span className="text-slate-500 text-xs">Entrada o Salida de obra</span></div>
           <div className="bg-slate-950 p-4 rounded-2xl text-blue-500"><Clock size={24} /></div>
         </button>
         <div className="grid grid-cols-2 gap-4">
           <button onClick={() => setCurrentStep(Step.WORKER_HISTORY)} className="group bg-slate-900 hover:bg-slate-800 border border-slate-800 p-6 rounded-3xl transition-all text-left flex flex-col gap-3">
             <div className="bg-slate-950 p-3 rounded-xl text-emerald-500 w-fit"><History size={22} /></div>
             <span className="font-bold text-white">Mi Historial</span>
           </button>
           <button onClick={() => setCurrentStep(Step.WORKER_TOOLS)} className="group bg-slate-900 hover:bg-slate-800 border border-slate-800 p-6 rounded-3xl transition-all text-left flex flex-col gap-3">
             <div className="bg-slate-950 p-3 rounded-xl text-amber-500 w-fit"><Wrench size={22} /></div>
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
        <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 mb-6 space-y-4">
           <div className="relative">
             <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
             <input type="text" placeholder="Buscar herramienta predefinida..." className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-11 pr-4 py-3 text-sm text-white focus:border-amber-500 outline-none" value={toolSearchTerm} onChange={(e) => setToolSearchTerm(e.target.value)}/>
             {toolSearchTerm && filteredPredefined.length > 0 && (
               <div className="absolute top-full left-0 w-full mt-2 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-50 max-h-48 overflow-y-auto p-2">
                 {filteredPredefined.map(tool => (
                   <button key={tool} onClick={() => {setNewToolName(tool); setToolSearchTerm('');}} className="w-full text-left p-3 hover:bg-slate-800 rounded-xl text-sm text-slate-300">{tool}</button>
                 ))}
               </div>
             )}
           </div>
           <div className="space-y-3">
             <input type="text" placeholder="Nombre de herramienta" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3.5 text-sm text-white focus:border-amber-500 outline-none" value={newToolName} onChange={(e)=>setNewToolName(e.target.value)}/>
             <div className="grid grid-cols-2 gap-3">
               <select className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 text-sm text-slate-400 outline-none" value={newToolBrand} onChange={(e)=>setNewToolBrand(e.target.value)}>
                 <option value="">Marca</option>
                 {ELECTRICAL_BRANDS_LIST.map(b => <option key={b} value={b}>{b}</option>)}
                 <option value="OTRA">Personalizada...</option>
               </select>
               <input type="text" placeholder="Modelo" className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 text-sm text-white focus:border-amber-500 outline-none" value={newToolModel} onChange={(e)=>setNewToolModel(e.target.value)}/>
             </div>
           </div>
           <button onClick={handleAddTool} className="w-full bg-amber-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 uppercase tracking-widest text-xs"><Plus size={18} /> Registrar Herramienta</button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-3 pb-8 custom-scrollbar">
           {myTools.map(tool => (
             <div key={tool.id} className="bg-slate-900 border border-slate-800 p-5 rounded-3xl flex items-center justify-between">
               <div className="flex items-center gap-4">
                 <div className="bg-slate-950 p-4 rounded-2xl text-amber-500"><Wrench size={20} /></div>
                 <div>
                   <h4 className="font-bold text-white text-sm">{tool.toolName}</h4>
                   <p className="text-[10px] text-slate-500 uppercase font-bold">{tool.brand} • {tool.model || 'S/M'}</p>
                 </div>
               </div>
               <button onClick={() => StorageService.deleteTool(tool.id)} className="text-slate-600 hover:text-rose-500 p-2"><Trash2 size={18} /></button>
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
            <div className="bg-blue-600 p-6 rounded-[2rem] inline-flex mb-8 shadow-xl shadow-blue-900/40"><Zap size={48} className="text-white fill-white/20" /></div>
            <h2 className="text-4xl font-black text-white mb-2 tracking-tighter">Carmagne Instal</h2>
            <p className="text-slate-500 text-sm font-medium">Control de Presencia 2024</p>
          </div>
          <div className="bg-slate-900/50 p-8 rounded-[2.5rem] border border-slate-800">
             <label className="block text-[10px] uppercase text-slate-500 font-black mb-4 tracking-widest">Teléfono Corporativo</label>
             <input type="tel" value={loginPhone} onChange={(e) => setLoginPhone(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl p-5 text-2xl font-black focus:border-blue-500 outline-none text-center tracking-widest" placeholder="600000000"/>
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
               <button key={site.id} onClick={() => {setSelectedSite(site); setCurrentStep(Step.SELECT_ACTION);}} className="bg-slate-900 p-6 rounded-3xl border border-slate-800 text-left group active:border-blue-500">
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
             <div><h2 className="text-2xl font-black text-white">¿Qué vas a hacer?</h2><p className="text-xs text-blue-500 font-bold uppercase">{selectedSite?.name}</p></div>
           </div>
           <div className="grid grid-cols-1 gap-4">
             <button onClick={() => handleActionSelect(LogType.ENTRADA)} className="bg-emerald-600/10 border border-emerald-500/30 p-8 rounded-[2.5rem] flex flex-col items-center gap-4 text-emerald-500 active:bg-emerald-600 active:text-white transition">
               <Zap size={40} className="fill-emerald-500/20" /> <span className="text-xl font-black uppercase">Fichar Entrada</span>
             </button>
             <button onClick={() => handleActionSelect(LogType.SALIDA)} className="bg-rose-600/10 border border-rose-500/30 p-8 rounded-[2.5rem] flex flex-col items-center gap-4 text-rose-500 active:bg-rose-600 active:text-white transition">
               <LogOut size={40} /> <span className="text-xl font-black uppercase">Fichar Salida</span>
             </button>
             <button onClick={() => handleActionSelect(LogType.INICIO_DESCANSO)} className="bg-amber-600/10 border border-amber-500/30 p-6 rounded-3xl flex items-center justify-center gap-4 text-amber-500 transition">
               <Coffee size={24} /> <span className="font-bold uppercase">Inicio Descanso</span>
             </button>
           </div>
        </div>
      );
      case Step.REPORT_EXIT: return (
        <div className="flex flex-col gap-6 animate-fadeIn h-full">
           <h2 className="text-2xl font-black text-white">Reporte de Jornada</h2>
           <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 space-y-6">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-3 block">Modo de Trabajo</label>
                <div className="flex gap-2">
                   {['HORAS', 'DESTAJO'].map(m => (
                     <button key={m} onClick={() => setExitWorkMode(m as WorkMode)} className={`flex-1 py-3 rounded-xl font-bold transition ${exitWorkMode === m ? 'bg-blue-600 text-white' : 'bg-slate-950 text-slate-600 border border-slate-800'}`}>{m}</button>
                   ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-3 block">¿Qué se ha hecho hoy?</label>
                <textarea className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white min-h-[150px] outline-none focus:border-blue-500" placeholder="Escribe aquí tu reporte..." value={exitReportText} onChange={(e)=>setExitReportText(e.target.value)} />
              </div>
              <button onClick={() => executeLogSubmission(LogType.SALIDA, exitReportText, exitWorkMode)} className="w-full bg-blue-600 text-white font-black py-5 rounded-2xl uppercase tracking-widest shadow-xl shadow-blue-900/20">Finalizar Salida</button>
           </div>
        </div>
      );
      case Step.SUCCESS: return (
        <div className="flex flex-col items-center justify-center flex-1 gap-8 animate-fadeIn text-center">
           <div className="w-32 h-32 bg-emerald-600 rounded-full flex items-center justify-center shadow-2xl shadow-emerald-900/40 animate-bounce">
             <CheckCircle size={64} className="text-white" />
           </div>
           <div><h2 className="text-4xl font-black text-white mb-2">¡Completado!</h2><p className="text-slate-400">Tu registro ha sido enviado correctamente.</p></div>
           <button onClick={() => setCurrentStep(Step.WORKER_DASHBOARD)} className="bg-slate-900 text-white px-10 py-4 rounded-2xl font-bold border border-slate-800">Volver al Panel</button>
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
               <div key={log.id} className="bg-slate-900 p-5 rounded-3xl border border-slate-800">
                 <div className="flex justify-between items-start mb-2">
                   <span className={`text-[10px] font-black uppercase px-2 py-1 rounded border ${log.type === LogType.ENTRADA ? 'bg-emerald-900 text-emerald-400 border-emerald-800' : 'bg-rose-900 text-rose-400 border-rose-800'}`}>{log.type}</span>
                   <span className="text-[10px] text-slate-500 font-bold">{log.dateStr} • {log.timeStr}</span>
                 </div>
                 <p className="text-sm font-bold text-white">{log.siteName}</p>
                 {log.workReport && <p className="text-xs text-slate-500 mt-2 italic">"{log.workReport}"</p>}
               </div>
             ))}
           </div>
        </div>
      );
      case Step.REGISTER: return (
        <div className="flex flex-col gap-6 animate-fadeIn pb-10">
           <h2 className="text-3xl font-black text-white">Registro Nuevo</h2>
           <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 space-y-4">
              <input type="text" placeholder="Nombre completo" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white" value={regName} onChange={(e)=>setRegName(e.target.value)}/>
              <input type="text" placeholder="DNI / NIE" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white" value={regDni} onChange={(e)=>setRegDni(e.target.value)}/>
              <input type="password" placeholder="PIN de 4 dígitos" maxLength={4} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white text-center tracking-[1em]" value={regPin} onChange={(e)=>setRegPin(e.target.value.replace(/\D/g,''))}/>
              <input type="password" placeholder="Confirmar PIN" maxLength={4} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white text-center tracking-[1em]" value={regPinConfirm} onChange={(e)=>setRegPinConfirm(e.target.value.replace(/\D/g,''))}/>
              <button onClick={handleRegistration} className="w-full bg-blue-600 text-white font-black py-5 rounded-2xl uppercase mt-4">Crear Cuenta</button>
           </div>
        </div>
      );
      default: return <div className="text-center p-10 text-slate-500">Paso no encontrado</div>;
    }
  };

  if (isAppLoading) return (
    <div className="fixed inset-0 bg-slate-950 z-[100] flex flex-col items-center justify-center animate-pulse">
       <div className="bg-blue-600 p-6 rounded-[2.5rem] mb-6 shadow-2xl shadow-blue-500/20"><Zap size={48} className="text-white fill-white/20" /></div>
       <h1 className="text-3xl font-black text-white tracking-tighter">CARMAGNE</h1>
    </div>
  );

  if (isAdmin) return <AdminPanel onBack={() => setIsAdmin(false)} currentUser={currentAdminUser} />;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden max-w-lg mx-auto border-x border-slate-900 shadow-2xl">
      <ConfirmationModal 
        isOpen={confirmState.isOpen}
        title="¿Confirmar acción?"
        message={confirmState.action === LogType.ENTRADA ? "Vas a marcar el inicio de tu jornada." : "Vas a marcar el final de tu jornada."}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmState({ isOpen: false, action: null })}
        isDestructive={confirmState.action === LogType.SALIDA}
      />

      {showAdminLogin && (
        <div className="fixed inset-0 z-[110] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-[2.5rem] w-full max-w-sm shadow-2xl">
            <h3 className="text-2xl font-black text-white mb-6 text-center">Admin Access</h3>
            <div className="space-y-4">
              <input type="text" placeholder="Usuario" className="w-full bg-slate-950 border border-slate-800 p-4 rounded-2xl text-white" value={adminUsernameInput} onChange={(e)=>setAdminUsernameInput(e.target.value)}/>
              <input type="password" placeholder="Contraseña" className="w-full bg-slate-950 border border-slate-800 p-4 rounded-2xl text-white" value={adminPasswordInput} onChange={(e)=>setAdminPasswordInput(e.target.value)}/>
              {adminError && <p className="text-rose-500 text-xs font-bold text-center">{adminError}</p>}
              <button onClick={verifyAdminPassword} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black uppercase">Entrar</button>
              <button onClick={() => {setShowAdminLogin(false); setAdminError('');}} className="w-full text-slate-500 text-xs py-2">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      <header className="p-6 flex justify-between items-center border-b border-slate-900">
        <div className="flex items-center gap-3">
           <div className="bg-blue-600 p-2 rounded-xl"><Zap size={18} className="text-white" /></div>
           <h1 className="text-lg font-black tracking-tighter uppercase">Carmagne</h1>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 relative">
        {error && <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/30 text-rose-500 rounded-2xl flex items-center gap-3 animate-slideDown text-xs font-bold"><ShieldAlert size={16} />{error}</div>}
        {loading && <div className="absolute inset-0 z-50 bg-slate-950/50 flex items-center justify-center backdrop-blur-sm"><div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>}
        {renderStep()}
      </main>

      <footer className="p-6 text-center text-slate-800 text-[10px] font-black tracking-[0.4em] uppercase">
        Carmagne Instal 2024 • V3.5
      </footer>
    </div>
  );
}

export default App;
