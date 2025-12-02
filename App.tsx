import React, { useState, useEffect } from 'react';
import { 
  User, MapPin, CheckCircle, 
  LogOut, Coffee, ArrowRight, ShieldAlert, Lock, Fingerprint, Delete, UserPlus, Save, ChevronLeft, Calendar, History, Clock, Smartphone, X, Mic, MicOff, FileText, Cloud, ExternalLink
} from 'lucide-react';
import { StorageService } from './services/storageService';
import { LocationService } from './services/locationService';
import { Worker, Site, WorkLog, LogType, GeoLocationData, WorkMode } from './types';
import { AdminPanel } from './components/AdminPanel';
import { InstallTutorial } from './components/InstallTutorial';
import { Logo } from './components/Logo';

// App Steps
enum Step {
  IDENTIFY = 0,
  AUTHENTICATE = 1,
  WORKER_DASHBOARD = 15,
  WORKER_HISTORY = 16,
  SELECT_SITE = 2,
  SELECT_ACTION = 3,
  REPORT_EXIT = 4, 
  SUCCESS = 5,
  REGISTER = 99
}

// Configuración de Geofencing
const MAX_DISTANCE_METERS = 500;

function App() {
  // Splash Screen State
  const [isAppLoading, setIsAppLoading] = useState(true);

  const [isAdmin, setIsAdmin] = useState(false);
  const [currentStep, setCurrentStep] = useState<Step>(Step.IDENTIFY);
  
  // Install Tutorial State
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  
  // Admin Login State
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminError, setAdminError] = useState('');

  // Selection State
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [selectedAction, setSelectedAction] = useState<LogType | null>(null);
  const [location, setLocation] = useState<GeoLocationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Exit Report State
  const [exitReportText, setExitReportText] = useState('');
  const [exitWorkMode, setExitWorkMode] = useState<WorkMode>('HORAS');
  const [isListening, setIsListening] = useState(false);

  // Authentication State
  const [pinInput, setPinInput] = useState('');
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);

  // Registration State
  const [regName, setRegName] = useState('');
  const [regDni, setRegDni] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regRole, setRegRole] = useState('');
  const [regPin, setRegPin] = useState('');
  const [regPinConfirm, setRegPinConfirm] = useState('');

  // History State
  const [historyDate, setHistoryDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [workerLogs, setWorkerLogs] = useState<WorkLog[]>([]);

  // Data
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  
  useEffect(() => {
    // Simulate App Loading / Splash Screen
    const timer = setTimeout(() => {
      setIsAppLoading(false);
    }, 2000); // 2 seconds splash

    // Load initial data
    setWorkers(StorageService.getWorkers());
    setSites(StorageService.getSites());
    setWorkerLogs(StorageService.getLogs()); // Load logs for history

    // Check for Biometrics Support
    if (window.PublicKeyCredential) {
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .then(isAvailable => {
          setBiometricsAvailable(isAvailable);
        })
        .catch(err => console.error("Bio check failed", err));
    }
    
    return () => clearTimeout(timer);
  }, []);

  // Refresh logs when entering dashboard
  useEffect(() => {
    if (currentStep === Step.WORKER_DASHBOARD || currentStep === Step.WORKER_HISTORY) {
      setWorkerLogs(StorageService.getLogs());
    }
  }, [currentStep]);

  // Admin Login Handler
  const handleAdminAccessRequest = () => {
    setShowAdminLogin(true);
    setAdminPasswordInput('');
    setAdminError('');
  };

  const verifyAdminPassword = () => {
    const config = StorageService.getConfig();
    const storedPass = config.adminPassword || 'admin';
    if (adminPasswordInput === storedPass) {
      setIsAdmin(true);
      setShowAdminLogin(false);
    } else {
      setAdminError('Contraseña incorrecta');
      setAdminPasswordInput('');
    }
  };

  const handleManualSelect = (workerId: string) => {
    const worker = workers.find(w => w.id === workerId);
    if (worker) {
      setSelectedWorker(worker);
      setPinInput('');
      setCurrentStep(Step.AUTHENTICATE);
    }
  };

  const handleRegistration = async () => {
    if (!regName || !regDni || !regPin) {
      setError('Nombre, DNI y PIN son obligatorios.');
      return;
    }
    if (regPin.length !== 4) {
      setError('El PIN debe tener 4 dígitos.');
      return;
    }
    if (regPin !== regPinConfirm) {
      setError('Los PINs no coinciden.');
      return;
    }

    setLoading(true);

    const newId = `W${Math.floor(1000 + Math.random() * 9000)}`;
    const newWorker: Worker = {
      id: newId,
      name: regName,
      dni: regDni,
      phone: regPhone,
      role: regRole || 'Trabajador',
      pin: regPin,
      qrCode: `QR_${newId}`,
      active: true,
      defaultMode: 'HORAS'
    };

    // Save Locally
    const updatedWorkers = [...workers, newWorker];
    StorageService.saveWorkers(updatedWorkers);
    setWorkers(updatedWorkers);

    // Sync to Cloud (Fire and forget)
    await StorageService.syncWorker(newWorker);

    setLoading(false);

    setSelectedWorker(newWorker);
    setPinInput('');
    setCurrentStep(Step.AUTHENTICATE);
    
    setRegName(''); setRegDni(''); setRegPhone(''); setRegRole(''); setRegPin(''); setRegPinConfirm('');
    setError('');
  };

  const handlePinInput = (digit: string) => {
    if (pinInput.length < 4) {
      const newPin = pinInput + digit;
      setPinInput(newPin);
      if (newPin.length === 4) {
        verifyAuth(newPin);
      }
    }
  };

  const handlePinClear = () => {
    setPinInput('');
    setError('');
  };

  const verifyAuth = (pinToVerify: string) => {
    if (selectedWorker && selectedWorker.pin === pinToVerify) {
      setCurrentStep(Step.WORKER_DASHBOARD);
      setError('');
    } else {
      setError('PIN Incorrecto');
      setTimeout(() => setPinInput(''), 500);
    }
  };

  const handleBiometricAuth = async () => {
    try {
      setError('');
      const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
        challenge: Uint8Array.from("RANDOM_CHALLENGE_STRING", c => c.charCodeAt(0)),
        rp: { name: "CARMAGNE SOLU", id: window.location.hostname },
        user: {
            id: Uint8Array.from("USER_ID", c => c.charCodeAt(0)),
            name: selectedWorker?.name || "worker",
            displayName: selectedWorker?.name || "Worker",
        },
        pubKeyCredParams: [{alg: -7, type: "public-key"}],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
        timeout: 60000,
        attestation: "direct"
      };

      await navigator.credentials.create({ publicKey: publicKeyCredentialCreationOptions });
      setCurrentStep(Step.WORKER_DASHBOARD); 

    } catch (err) {
      console.error(err);
      setError('Autenticación biométrica fallida o cancelada.');
    }
  };

  const handleSiteSelect = (siteId: string) => {
    const site = sites.find(s => s.id === siteId);
    if (site) {
      setSelectedSite(site);
      setCurrentStep(Step.SELECT_ACTION);
      LocationService.getCurrentPosition()
        .then(loc => setLocation(loc))
        .catch(err => console.warn("Background loc failed", err));
    }
  };

  const handleActionSelect = async (type: LogType) => {
    setSelectedAction(type);
    setLoading(true);
    setError('');

    let loc = location;
    try {
      if (!loc) {
        loc = await LocationService.getCurrentPosition();
        setLocation(loc);
      }
    } catch (err) {
      // Continue without location
    }
    setLoading(false);

    if (type === LogType.SALIDA) {
      setExitWorkMode(selectedWorker?.defaultMode || 'HORAS');
      setExitReportText('');
      setCurrentStep(Step.REPORT_EXIT);
    } else {
      executeLogSubmission(type, undefined, 'HORAS');
    }
  };

  const toggleVoiceRecognition = () => {
    if (isListening) {
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Tu navegador no soporta reconocimiento de voz. Usa Chrome o Safari.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.continuous = false;
    recognition.interimResults = false;

    setIsListening(true);

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setExitReportText(prev => (prev ? prev + '. ' + transcript : transcript));
      setIsListening(false);
    };

    recognition.onerror = (event: any) => {
      console.error(event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const executeLogSubmission = async (type: LogType, report?: string, mode?: WorkMode) => {
    setLoading(true);
    try {
      let loc = location;
      if (!loc) {
        loc = await LocationService.getCurrentPosition();
        setLocation(loc);
      }

      let distance = 0;
      let warning = false;

      if (selectedSite && selectedSite.coordinates) {
        distance = LocationService.calculateDistance(
          loc!.latitude,
          loc!.longitude,
          selectedSite.coordinates.latitude,
          selectedSite.coordinates.longitude
        );

        if (distance > MAX_DISTANCE_METERS) {
          warning = true;
        }
      }

      await submitLog(loc!, type, distance, warning, undefined, report, mode);
      
    } catch (err: any) {
      setLoading(false);
      setError('Error obteniendo ubicación GPS. Active el GPS y reintente.');
    }
  };

  const submitLog = async (
    loc: GeoLocationData, 
    type: LogType, 
    distance: number, 
    warning: boolean, 
    photoUrl?: string,
    report?: string,
    mode?: WorkMode
  ) => {
    if (!selectedWorker || !selectedSite) return;

    setLoading(true);
    const now = new Date();
    const config = StorageService.getConfig();

    const newLog: WorkLog = {
      id: `LOG-${Date.now()}`,
      workerId: selectedWorker.id,
      workerName: selectedWorker.name,
      siteId: selectedSite.id,
      siteName: selectedSite.name,
      type: type,
      timestamp: now.getTime(),
      dateStr: now.toLocaleDateString('es-ES'),
      timeStr: now.toLocaleTimeString('es-ES'),
      location: loc,
      photoUrl: photoUrl,
      sentToWhatsapp: false,
      syncedToSheets: false,
      distanceMeters: distance,
      locationWarning: warning,
      workReport: report,
      workMode: mode
    };

    // 1. Save Locally
    StorageService.addLog(newLog);

    // 2. Sync to Cloud
    // Try to use loaded config, otherwise fallback to whatever is available
    StorageService.syncLog(newLog).then(success => {
      if (success) {
        newLog.syncedToSheets = true;
        StorageService.updateLog(newLog);
      }
    });

    setCurrentStep(Step.SUCCESS);
    setLoading(false);
  };

  const resetApp = () => {
    setCurrentStep(Step.IDENTIFY);
    setSelectedWorker(null);
    setSelectedSite(null);
    setSelectedAction(null);
    setLocation(null);
    setPinInput('');
  };

  // --- WORKER HELPERS ---
  const getDailyStats = (dateStr: string) => {
    if (!selectedWorker) return { totalMs: 0, logs: [] };
    const targetDate = new Date(dateStr);
    const dayLogs = workerLogs.filter(l => {
      if (l.workerId !== selectedWorker.id) return false;
      const logDate = new Date(l.timestamp);
      return logDate.toDateString() === targetDate.toDateString();
    }).sort((a,b) => a.timestamp - b.timestamp);

    let totalPresence = 0;
    let totalBreaks = 0;
    let lastEntry = null;
    let lastBreak = null;

    dayLogs.forEach(log => {
      if (log.type === LogType.ENTRADA) lastEntry = log.timestamp;
      if (log.type === LogType.SALIDA && lastEntry) {
        totalPresence += (log.timestamp - lastEntry);
        lastEntry = null;
      }
      if (log.type === LogType.INICIO_DESCANSO) lastBreak = log.timestamp;
      if (log.type === LogType.FIN_DESCANSO && lastBreak) {
        totalBreaks += (log.timestamp - lastBreak);
        lastBreak = null;
      }
    });

    return {
      totalMs: Math.max(0, totalPresence - totalBreaks),
      logs: dayLogs
    };
  };

  const getCurrentStatus = () => {
    if (!selectedWorker) return null;
    const myLogs = workerLogs.filter(l => l.workerId === selectedWorker.id).sort((a,b) => b.timestamp - a.timestamp);
    if (myLogs.length === 0) return { status: 'FUERA', site: '-', since: null };
    
    const lastLog = myLogs[0];
    const isToday = new Date(lastLog.timestamp).toDateString() === new Date().toDateString();

    if (lastLog.type === LogType.ENTRADA || lastLog.type === LogType.FIN_DESCANSO) {
      return { status: 'TRABAJANDO', site: lastLog.siteName, since: lastLog.timestamp, isToday };
    } else if (lastLog.type === LogType.INICIO_DESCANSO) {
      return { status: 'EN DESCANSO', site: lastLog.siteName, since: lastLog.timestamp, isToday };
    } else {
      return { status: 'FUERA', site: '-', since: lastLog.timestamp, isToday };
    }
  };

  const msToTime = (ms: number) => {
    const hrs = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    return `${hrs}h ${mins}m`;
  };

  // Render Functions
  const renderWorkerDashboard = () => {
    const status = getCurrentStatus();
    return (
      <div className="flex flex-col gap-6 animate-fadeIn h-full">
        <div className="flex justify-between items-center">
          <button onClick={resetApp} className="text-slate-400 text-sm hover:text-white flex items-center gap-1">
            <LogOut size={16} /> Cerrar Sesión
          </button>
          <span className="text-yellow-400 font-bold">{selectedWorker?.name.split(' ')[0]}</span>
        </div>

        {/* STATUS CARD */}
        <div className={`p-6 rounded-2xl shadow-lg border-l-8 flex flex-col items-center justify-center text-center ${
          status?.status === 'TRABAJANDO' ? 'bg-slate-800 border-green-500' :
          status?.status === 'EN DESCANSO' ? 'bg-slate-800 border-yellow-500' :
          'bg-slate-800 border-slate-600'
        }`}>
          <p className="text-slate-400 text-xs uppercase tracking-widest font-bold mb-2">Estado Actual</p>
          <h2 className={`text-3xl font-black mb-1 ${
            status?.status === 'TRABAJANDO' ? 'text-green-400' :
            status?.status === 'EN DESCANSO' ? 'text-yellow-400' :
            'text-slate-500'
          }`}>
            {status?.status || 'SIN ACTIVIDAD'}
          </h2>
          {status?.status !== 'FUERA' && (
            <div className="mt-2 text-white">
              <p className="font-medium text-lg">{status?.site}</p>
              <p className="text-xs text-slate-400 flex items-center justify-center gap-1 mt-1">
                <Clock size={12}/> Desde: {new Date(status?.since || 0).toLocaleTimeString()}
              </p>
            </div>
          )}
        </div>

        <h3 className="text-white font-bold text-lg mt-2">¿Qué deseas hacer?</h3>
        
        <div className="grid gap-4 flex-1">
           <button 
             onClick={() => setCurrentStep(Step.SELECT_SITE)}
             className="bg-blue-600 hover:bg-blue-500 text-white p-6 rounded-2xl shadow-lg flex items-center justify-between group transition"
           >
             <div className="text-left">
               <span className="block text-xl font-bold">Nuevo Fichaje</span>
               <span className="text-blue-200 text-sm">Entrada, Salida o Pausa</span>
             </div>
             <div className="bg-blue-700 p-3 rounded-full">
               <Clock size={24} />
             </div>
           </button>

           <button 
             onClick={() => setCurrentStep(Step.WORKER_HISTORY)}
             className="bg-slate-700 hover:bg-slate-600 text-white p-6 rounded-2xl shadow-lg flex items-center justify-between group transition"
           >
             <div className="text-left">
               <span className="block text-xl font-bold">Mi Historial</span>
               <span className="text-slate-300 text-sm">Ver mis horas y actividad</span>
             </div>
             <div className="bg-slate-800 p-3 rounded-full">
               <History size={24} />
             </div>
           </button>
        </div>
      </div>
    );
  };

  const renderWorkerHistory = () => {
    const { totalMs, logs: dayLogs } = getDailyStats(historyDate);
    
    return (
      <div className="flex flex-col gap-4 animate-fadeIn h-full">
        <button onClick={() => setCurrentStep(Step.WORKER_DASHBOARD)} className="text-slate-400 text-sm hover:text-white flex items-center gap-1">
          <ChevronLeft size={16} /> Volver al Menú
        </button>

        <h2 className="text-2xl font-bold text-white text-center">Mi Actividad</h2>

        <div className="bg-slate-800 p-4 rounded-xl flex items-center gap-3 border border-slate-700">
          <Calendar className="text-yellow-400" size={24} />
          <div className="flex-1">
            <label className="text-xs text-slate-400 font-bold uppercase block">Seleccionar Fecha</label>
            <input 
              type="date" 
              value={historyDate}
              onChange={(e) => setHistoryDate(e.target.value)}
              className="bg-transparent text-white font-bold text-lg w-full outline-none"
            />
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-900 to-slate-900 p-6 rounded-xl border border-blue-800 text-center shadow-lg">
           <p className="text-blue-200 text-sm font-bold uppercase">Total Trabajado</p>
           <div className="flex items-end justify-center gap-2 mt-2">
             <Clock size={32} className="text-blue-400 mb-1"/>
             <span className="text-4xl font-black text-white">{msToTime(totalMs)}</span>
           </div>
           {totalMs > 0 && <p className="text-xs text-slate-400 mt-2">Neto (sin descansos)</p>}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar mt-2">
          <h3 className="text-sm text-slate-500 font-bold uppercase mb-3">Cronología del día</h3>
          {dayLogs.length === 0 ? (
            <div className="text-center text-slate-600 py-8 italic">No hay registros.</div>
          ) : (
            <div className="relative border-l-2 border-slate-700 ml-4 space-y-6 pb-4">
              {dayLogs.map((log) => (
                <div key={log.id} className="relative pl-6">
                  <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 ${
                    log.type === LogType.ENTRADA ? 'bg-green-500 border-green-500' :
                    log.type === LogType.SALIDA ? 'bg-red-500 border-red-500' :
                    'bg-yellow-500 border-yellow-500'
                  }`}></div>
                  
                  <div className="bg-slate-800 p-3 rounded-lg border border-slate-700">
                    <div className="flex justify-between items-start">
                       <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                          log.type === LogType.ENTRADA ? 'bg-green-900/50 text-green-400' :
                          log.type === LogType.SALIDA ? 'bg-red-900/50 text-red-400' :
                          'bg-yellow-900/50 text-yellow-400'
                       }`}>{log.type}</span>
                       <span className="text-white font-mono font-bold">{log.timeStr}</span>
                    </div>
                    
                    <p className="text-white font-bold text-sm mt-2">{log.siteName}</p>
                    
                    {log.workReport && (
                      <div className="mt-2 bg-slate-900 p-2 rounded text-xs text-slate-300 italic border border-slate-700">
                        "{log.workReport}"
                      </div>
                    )}
                    
                    {log.type === LogType.SALIDA && log.workMode && (
                      <span className="inline-block mt-2 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-900 text-blue-200 border border-blue-700">
                         {log.workMode}
                      </span>
                    )}

                    {/* Ubicación y Enlace a Mapa */}
                    <div className="mt-2 pt-2 border-t border-slate-700/50 flex justify-between items-center">
                       <a 
                          href={`https://www.google.com/maps?q=${log.location.latitude},${log.location.longitude}`} 
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 flex items-center gap-1 hover:text-blue-300 transition"
                       >
                          <MapPin size={12} /> 
                          {log.location.address ? (
                            <span className="truncate max-w-[150px]">{log.location.address}</span>
                          ) : 'Ver en mapa'}
                          <ExternalLink size={10} />
                       </a>
                       {log.locationWarning && (
                         <span className="text-[10px] text-red-400 flex items-center gap-1 font-bold">
                           <ShieldAlert size={10}/> Lejos
                         </span>
                       )}
                    </div>

                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // --- SPLASH SCREEN RENDER ---
  if (isAppLoading) {
    return (
      <div className="fixed inset-0 bg-slate-900 z-[100] flex flex-col items-center justify-center animate-fadeIn">
         <div className="w-32 h-32 mb-8 relative">
            {/* Pulsing effect behind logo */}
            <div className="absolute inset-0 bg-yellow-400/20 rounded-full animate-ping"></div>
            <Logo className="relative w-full h-full object-contain" />
         </div>
         <h1 className="text-3xl font-black text-white tracking-tighter mb-1">CARMAGNE</h1>
         <p className="text-yellow-400 font-bold tracking-widest text-sm">INSTAL 2024</p>
         
         <div className="mt-12 w-48 h-1 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-yellow-400 animate-[loading_1.5s_ease-in-out_infinite]"></div>
         </div>
      </div>
    );
  }

  // Render Logic
  if (isAdmin) {
    return <AdminPanel onBack={() => setIsAdmin(false)} />;
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col font-sans">
      {/* Install Tutorial Modal */}
      {showInstallGuide && <InstallTutorial onClose={() => setShowInstallGuide(false)} />}
      
      {/* Admin Login Modal */}
      {showAdminLogin && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
           <div className="bg-slate-800 w-full max-w-sm rounded-2xl border-2 border-slate-600 shadow-2xl p-6 relative">
              <button onClick={() => setShowAdminLogin(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white">
                 <X size={24} />
              </button>
              
              <div className="flex flex-col items-center mb-6">
                 {/* Logo in Login */}
                 <div className="mb-4 bg-slate-700 p-4 rounded-full border-2 border-yellow-400">
                   <Logo className="w-12 h-12 object-contain" />
                 </div>
                 <h2 className="text-xl font-bold text-white">Acceso Administrador</h2>
                 <p className="text-slate-400 text-sm text-center mt-1">Introduce la contraseña maestra</p>
              </div>

              <input 
                 type="password"
                 value={adminPasswordInput}
                 onChange={(e) => setAdminPasswordInput(e.target.value)}
                 className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white text-center font-bold tracking-widest text-lg mb-4 focus:border-yellow-400 focus:outline-none"
                 placeholder="••••••"
                 autoFocus
              />

              {adminError && (
                 <p className="text-red-500 text-sm font-bold text-center mb-4 bg-red-900/20 p-2 rounded">{adminError}</p>
              )}

              <button 
                 onClick={verifyAdminPassword}
                 className="w-full bg-yellow-400 hover:bg-yellow-300 text-slate-900 font-bold py-3 rounded-lg transition"
              >
                 Entrar
              </button>
           </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-yellow-400 text-slate-900 p-4 shadow-lg flex justify-between items-center z-20">
        <div className="flex items-center gap-3">
          <Logo className="h-10 w-10 object-contain drop-shadow-sm" />
          <div>
            <h1 className="text-xl font-black tracking-tighter leading-none">CARMAGNE</h1>
            <p className="text-xs font-bold opacity-80">INSTAL 2024</p>
          </div>
        </div>
        <button 
          onClick={handleAdminAccessRequest} 
          className="p-2 bg-slate-800 text-yellow-400 rounded-full hover:bg-slate-700 transition transform hover:scale-105"
        >
          <Lock size={18} />
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col p-4 max-w-md mx-auto w-full relative">
        
        {error && (
          <div className="mb-4 p-3 bg-red-600/90 text-white rounded-lg flex items-center gap-2 animate-bounce z-50">
            <ShieldAlert size={20} />
            <span className="text-sm font-bold">{error}</span>
          </div>
        )}

        {/* STEP 1: IDENTIFICATION */}
        {currentStep === Step.IDENTIFY && (
          <div className="flex flex-col gap-6 animate-fadeIn">
            
            {/* Install Button */}
            <button 
              onClick={() => setShowInstallGuide(true)}
              className="mx-auto text-xs bg-slate-800 text-yellow-400 px-3 py-1 rounded-full border border-yellow-400/30 flex items-center gap-1 animate-pulse"
            >
              <Smartphone size={12} /> 📲 Cómo Instalar App
            </button>

            <div className="text-center py-2">
              <h2 className="text-2xl font-bold text-white mb-2">Identifícate</h2>
              <p className="text-slate-400">Selecciona tu nombre de la lista</p>
            </div>

            <button 
              onClick={() => setCurrentStep(Step.REGISTER)}
              className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white p-4 rounded-xl flex items-center justify-center gap-3 shadow-lg transform active:scale-95 transition"
            >
              <UserPlus size={24} />
              <span className="font-bold text-lg">Soy Nuevo / Registrarse</span>
            </button>

            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-700"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="px-2 bg-slate-900 text-slate-500">O fichar con cuenta existente</span>
              </div>
            </div>

            <div className="grid gap-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {workers.filter(w => w.active).map(worker => (
                <button
                  key={worker.id}
                  onClick={() => handleManualSelect(worker.id)}
                  className="bg-slate-800 hover:bg-slate-700 p-4 rounded-xl flex items-center justify-between border border-slate-700 transition group"
                >
                  <div className="flex items-center gap-4">
                    <div className="bg-slate-600 p-2 rounded-full text-white">
                      <User size={20} />
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-white group-hover:text-yellow-400 transition">{worker.name}</p>
                      <p className="text-xs text-slate-400">ID: {worker.id}</p>
                    </div>
                  </div>
                  <ArrowRight className="text-slate-600 group-hover:text-yellow-400" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP: REGISTRATION */}
        {currentStep === Step.REGISTER && (
          <div className="flex flex-col gap-6 animate-fadeIn">
            <button onClick={() => {setCurrentStep(Step.IDENTIFY); setError('');}} className="text-slate-400 text-sm hover:text-white self-start flex items-center gap-1">
              <ChevronLeft size={16} /> Cancelar
            </button>
            
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white mb-1">Registro de Nuevo Personal</h2>
              <p className="text-slate-400 text-sm">Rellena tus datos para crear tu ficha</p>
            </div>

            <div className="flex flex-col gap-4 bg-slate-800 p-6 rounded-xl border border-slate-700">
               <div>
                 <label className="block text-xs uppercase text-slate-500 font-bold mb-1">Nombre Completo *</label>
                 <input 
                   type="text" 
                   value={regName}
                   onChange={(e) => setRegName(e.target.value)}
                   className="w-full bg-slate-900 border border-slate-600 text-white rounded p-3 focus:border-yellow-400 focus:outline-none"
                   placeholder="Ej: Juan Pérez"
                 />
               </div>
               
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-xs uppercase text-slate-500 font-bold mb-1">DNI/NIE *</label>
                   <input 
                     type="text" 
                     value={regDni}
                     onChange={(e) => setRegDni(e.target.value)}
                     className="w-full bg-slate-900 border border-slate-600 text-white rounded p-3 focus:border-yellow-400 focus:outline-none"
                     placeholder="12345678X"
                   />
                 </div>
                 <div>
                   <label className="block text-xs uppercase text-slate-500 font-bold mb-1">Teléfono</label>
                   <input 
                     type="tel" 
                     value={regPhone}
                     onChange={(e) => setRegPhone(e.target.value)}
                     className="w-full bg-slate-900 border border-slate-600 text-white rounded p-3 focus:border-yellow-400 focus:outline-none"
                     placeholder="600..."
                   />
                 </div>
               </div>

               <div>
                 <label className="block text-xs uppercase text-slate-500 font-bold mb-1">Cargo / Puesto</label>
                 <input 
                   type="text" 
                   value={regRole}
                   onChange={(e) => setRegRole(e.target.value)}
                   className="w-full bg-slate-900 border border-slate-600 text-white rounded p-3 focus:border-yellow-400 focus:outline-none"
                   placeholder="Ej: Albañil, Electricista..."
                 />
               </div>

               <div className="border-t border-slate-700 my-2 pt-4">
                  <div className="flex items-center gap-2 mb-4 text-yellow-400">
                     <Lock size={16} />
                     <span className="font-bold text-sm">Crea tu PIN de Acceso (4 dígitos)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <input 
                       type="password" 
                       value={regPin}
                       onChange={(e) => setRegPin(e.target.value.replace(/\D/g,'').slice(0,4))}
                       className="w-full bg-slate-900 border border-slate-600 text-white rounded p-3 text-center tracking-widest text-lg focus:border-yellow-400 focus:outline-none"
                       placeholder="PIN"
                     />
                     <input 
                       type="password" 
                       value={regPinConfirm}
                       onChange={(e) => setRegPinConfirm(e.target.value.replace(/\D/g,'').slice(0,4))}
                       className="w-full bg-slate-900 border border-slate-600 text-white rounded p-3 text-center tracking-widest text-lg focus:border-yellow-400 focus:outline-none"
                       placeholder="Repetir"
                     />
                  </div>
               </div>
            </div>

            <button 
              onClick={handleRegistration}
              className="bg-green-600 hover:bg-green-500 text-white p-4 rounded-xl flex items-center justify-center gap-2 shadow-lg font-bold text-lg mt-2"
            >
              {loading ? 'Guardando...' : <><Save size={20} /> Guardar y Acceder</>}
            </button>
          </div>
        )}

        {/* STEP 2: AUTHENTICATION */}
        {currentStep === Step.AUTHENTICATE && (
          <div className="flex flex-col gap-6 animate-fadeIn items-center justify-center flex-1">
             <button onClick={resetApp} className="text-slate-400 text-sm hover:text-white self-start absolute top-0">
              ← Cambiar Usuario
            </button>
            
            <div className="text-center mb-4 mt-8">
               <div className="w-20 h-20 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-slate-600">
                 <Lock size={32} className="text-yellow-400" />
               </div>
               <h2 className="text-2xl font-bold text-white">Hola, {selectedWorker?.name.split(' ')[0]}</h2>
               <p className="text-slate-400">Introduce tu PIN de seguridad</p>
            </div>

            {/* PIN Dots */}
            <div className="flex gap-4 mb-6">
              {[0, 1, 2, 3].map(i => (
                <div 
                  key={i} 
                  className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                    i < pinInput.length ? 'bg-yellow-400 border-yellow-400 scale-110' : 'border-slate-600 bg-slate-800'
                  }`}
                />
              ))}
            </div>

            {/* Numeric Keypad */}
            <div className="grid grid-cols-3 gap-4 w-full max-w-xs">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                <button
                  key={num}
                  onClick={() => handlePinInput(num.toString())}
                  className="h-16 rounded-full bg-slate-800 text-white text-xl font-bold hover:bg-slate-700 active:bg-yellow-400 active:text-slate-900 transition shadow-lg border border-slate-700"
                >
                  {num}
                </button>
              ))}
              <div className="flex items-center justify-center">
                {/* Biometric Button if available */}
                {biometricsAvailable && (
                   <button 
                     onClick={handleBiometricAuth}
                     className="h-14 w-14 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-500 shadow-lg"
                     title="Usar Huella/FaceID"
                   >
                     <Fingerprint size={28} />
                   </button>
                )}
              </div>
              <button
                onClick={() => handlePinInput('0')}
                className="h-16 rounded-full bg-slate-800 text-white text-xl font-bold hover:bg-slate-700 active:bg-yellow-400 active:text-slate-900 transition shadow-lg border border-slate-700"
              >
                0
              </button>
              <button
                onClick={handlePinClear}
                className="h-16 flex items-center justify-center text-red-400 hover:text-red-300 transition"
              >
                <Delete size={28} />
              </button>
            </div>
          </div>
        )}

        {/* WORKER DASHBOARD */}
        {currentStep === Step.WORKER_DASHBOARD && renderWorkerDashboard()}

        {/* WORKER HISTORY */}
        {currentStep === Step.WORKER_HISTORY && renderWorkerHistory()}

        {/* STEP 3: SITE SELECTION */}
        {currentStep === Step.SELECT_SITE && (
          <div className="flex flex-col gap-6 animate-fadeIn">
            <button onClick={() => setCurrentStep(Step.WORKER_DASHBOARD)} className="text-slate-400 text-sm hover:text-white self-start mb-2">
              <ChevronLeft size={16} /> Volver
            </button>
            
            <div className="text-center">
               <div className="inline-block bg-blue-900 text-blue-200 px-3 py-1 rounded-full text-xs font-bold mb-2">
                 Identidad Verificada <CheckCircle size={10} className="inline ml-1"/>
               </div>
               <h2 className="text-2xl font-bold text-white">Selecciona la Obra</h2>
            </div>

            <div className="grid gap-4">
              {sites.filter(s => s.active).map(site => (
                <button
                  key={site.id}
                  onClick={() => handleSiteSelect(site.id)}
                  className="bg-slate-800 hover:bg-slate-700 border-2 border-transparent hover:border-yellow-400 p-5 rounded-xl text-left transition relative overflow-hidden group"
                >
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20">
                    <MapPin size={64} />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">{site.name}</h3>
                  <p className="text-sm text-slate-400 flex items-center gap-2">
                    <MapPin size={14} /> {site.address}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP 4: ACTION SELECTION */}
        {currentStep === Step.SELECT_ACTION && (
          <div className="flex flex-col gap-4 animate-fadeIn h-full">
            <button onClick={() => setCurrentStep(Step.SELECT_SITE)} className="text-slate-400 text-sm hover:text-white self-start">
              ← Cambiar Obra
            </button>

            <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 mb-2">
              <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Resumen Actual</p>
              <div className="flex justify-between items-end mt-1">
                <div>
                  <p className="text-white font-bold">{selectedWorker?.name}</p>
                  <p className="text-yellow-400 text-sm">{selectedSite?.name}</p>
                </div>
                {location && <div className="text-green-500 text-xs flex items-center gap-1"><MapPin size={12}/> GPS Ok</div>}
              </div>
            </div>

            {loading ? (
               <div className="flex-1 flex flex-col justify-center items-center text-white">
                 <div className="w-12 h-12 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mb-4"></div>
                 <p>Obteniendo ubicación...</p>
               </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 flex-1 content-center">
                <button
                  onClick={() => handleActionSelect(LogType.ENTRADA)}
                  className="bg-green-600 hover:bg-green-500 text-white p-6 rounded-2xl shadow-lg transform active:scale-95 transition flex items-center justify-between group"
                >
                  <div className="text-left">
                    <span className="block text-2xl font-black">ENTRADA</span>
                    <span className="text-green-200 text-sm">Iniciar jornada</span>
                  </div>
                  <LogOut className="rotate-180 group-hover:translate-x-1 transition" size={40} />
                </button>

                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => handleActionSelect(LogType.INICIO_DESCANSO)}
                    className="bg-yellow-600 hover:bg-yellow-500 text-white p-6 rounded-2xl shadow-lg transform active:scale-95 transition flex flex-col justify-between h-32"
                  >
                    <Coffee size={32} />
                    <span className="font-bold text-left leading-tight">INICIO<br/>DESCANSO</span>
                  </button>
                  <button
                    onClick={() => handleActionSelect(LogType.FIN_DESCANSO)}
                    className="bg-orange-600 hover:bg-orange-500 text-white p-6 rounded-2xl shadow-lg transform active:scale-95 transition flex flex-col justify-between h-32"
                  >
                    <div className="relative">
                      <Coffee size={32} />
                      <div className="absolute -bottom-1 -right-1 bg-white text-orange-600 rounded-full p-0.5"><LogOut size={12}/></div>
                    </div>
                    <span className="font-bold text-left leading-tight">FIN<br/>DESCANSO</span>
                  </button>
                </div>

                <button
                  onClick={() => handleActionSelect(LogType.SALIDA)}
                  className="bg-red-600 hover:bg-red-500 text-white p-6 rounded-2xl shadow-lg transform active:scale-95 transition flex items-center justify-between group"
                >
                  <div className="text-left">
                    <span className="block text-2xl font-black">SALIDA</span>
                    <span className="text-red-200 text-sm">Terminar jornada</span>
                  </div>
                  <LogOut className="group-hover:translate-x-1 transition" size={40} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 4.5: EXIT REPORT (NEW) */}
        {currentStep === Step.REPORT_EXIT && (
           <div className="flex flex-col gap-6 animate-fadeIn h-full">
             <button onClick={() => setCurrentStep(Step.SELECT_ACTION)} className="text-slate-400 text-sm hover:text-white self-start flex items-center gap-1">
               <ChevronLeft size={16} /> Volver
             </button>

             <div className="text-center">
               <h2 className="text-2xl font-bold text-white mb-2">Resumen de Jornada</h2>
               <p className="text-slate-400 text-sm">Completa la información antes de salir.</p>
             </div>

             {/* Mode Selector */}
             <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
               <label className="block text-xs uppercase text-slate-500 font-bold mb-3">Modo de Trabajo</label>
               <div className="flex gap-2">
                 <button 
                   onClick={() => setExitWorkMode('HORAS')}
                   className={`flex-1 py-3 px-2 rounded-lg font-bold text-sm transition border-2 ${
                     exitWorkMode === 'HORAS' 
                       ? 'bg-blue-600 border-blue-400 text-white' 
                       : 'bg-slate-900 border-slate-700 text-slate-400'
                   }`}
                 >
                   ⏱️ Por Horas
                 </button>
                 <button 
                   onClick={() => setExitWorkMode('DESTAJO')}
                   className={`flex-1 py-3 px-2 rounded-lg font-bold text-sm transition border-2 ${
                     exitWorkMode === 'DESTAJO' 
                       ? 'bg-purple-600 border-purple-400 text-white' 
                       : 'bg-slate-900 border-slate-700 text-slate-400'
                   }`}
                 >
                   🧱 A Destajo
                 </button>
               </div>
             </div>

             {/* Report Input */}
             <div className="flex-1 bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs uppercase text-slate-500 font-bold flex items-center gap-2">
                    <FileText size={14}/> Parte de Trabajo
                  </label>
                  <button 
                    onClick={toggleVoiceRecognition}
                    className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold transition ${
                       isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {isListening ? <><MicOff size={12}/> Detener</> : <><Mic size={12}/> Dictar voz</>}
                  </button>
                </div>
                
                <textarea 
                  value={exitReportText}
                  onChange={(e) => setExitReportText(e.target.value)}
                  placeholder={isListening ? "Escuchando..." : "Escribe o dicta qué has hecho hoy..."}
                  className="w-full flex-1 bg-slate-900 text-white p-3 rounded-lg border border-slate-600 focus:border-yellow-400 focus:outline-none resize-none"
                />
             </div>

             <button 
               onClick={() => executeLogSubmission(LogType.SALIDA, exitReportText, exitWorkMode)}
               className="bg-green-600 hover:bg-green-500 text-white p-4 rounded-xl flex items-center justify-center gap-3 shadow-lg font-bold text-lg"
             >
               <Save size={20} /> Guardar y Salir
             </button>
           </div>
        )}

        {/* STEP 5: SUCCESS */}
        {currentStep === Step.SUCCESS && (
          <div className="flex-1 flex flex-col items-center justify-center text-center animate-fadeIn p-6">
            <div className="bg-green-500 rounded-full p-6 text-slate-900 mb-6 shadow-xl shadow-green-500/20">
              <CheckCircle size={64} />
            </div>
            <h2 className="text-3xl font-black text-white mb-2">¡Fichaje Registrado!</h2>
            <p className="text-slate-400 mb-8 max-w-xs mx-auto">
              Se ha guardado el registro correctamente.
            </p>
            
            <div className="w-full bg-slate-800 rounded-lg p-4 mb-8 text-left border border-slate-700">
               <div className="flex justify-between mb-2">
                 <span className="text-slate-500">Trabajador:</span>
                 <span className="text-white font-bold">{selectedWorker?.name}</span>
               </div>
               <div className="flex justify-between mb-2">
                 <span className="text-slate-500">Acción:</span>
                 <span className={`font-bold ${
                    selectedAction === LogType.ENTRADA ? 'text-green-400' : 
                    selectedAction === LogType.SALIDA ? 'text-red-400' : 'text-yellow-400'
                 }`}>{selectedAction}</span>
               </div>
               <div className="flex justify-between items-center">
                 <span className="text-slate-500">Estado:</span>
                 <span className="text-blue-400 font-bold flex items-center gap-1 text-sm">
                   <Cloud size={14} /> Guardado en Nube
                 </span>
               </div>
            </div>

            <button 
              onClick={resetApp}
              className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-blue-500 transition"
            >
              Nuevo Fichaje / Salir
            </button>
          </div>
        )}
      </main>
      
      <footer className="p-4 text-center text-slate-600 text-xs">
        &copy; 2024 CARMAGNE SOLU. Versión 1.4.0 (Silent Sync)
      </footer>
    </div>
  );
}

export default App;