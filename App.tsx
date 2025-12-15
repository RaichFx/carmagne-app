import React, { useState, useEffect } from 'react';
import { 
  User, MapPin, CheckCircle, 
  LogOut, Coffee, ArrowRight, ShieldAlert, Lock, Fingerprint, Delete, UserPlus, Save, ChevronLeft, Calendar, History, Clock, Smartphone, X, Mic, MicOff, FileText, Cloud, ExternalLink, Briefcase, Phone, KeyRound, BellRing, Search
} from 'lucide-react';
import { StorageService } from './services/storageService';
import { LocationService } from './services/locationService';
import { Worker, Site, WorkLog, LogType, GeoLocationData, WorkMode, AdminUser } from './types';
import { AdminPanel } from './components/AdminPanel';
import { InstallTutorial } from './components/InstallTutorial';

// App Steps
enum Step {
  LOGIN_PHONE = 0,    // Nuevo inicio
  AUTHENTICATE = 1,
  WORKER_DASHBOARD = 15,
  WORKER_HISTORY = 16,
  SELECT_SITE = 2,
  SELECT_ACTION = 3,
  // TAKE_PHOTO removed
  REPORT_EXIT = 4, 
  SUCCESS = 5,
  REGISTER = 99,
  RECOVERY = 100
}

// Geofencing
const MAX_DISTANCE_METERS = 500;

function App() {
  // Splash Screen State
  const [isAppLoading, setIsAppLoading] = useState(true);

  const [isAdmin, setIsAdmin] = useState(false);
  // Guardamos el admin actual. Si es null pero isAdmin es true, es el MASTER ADMIN.
  const [currentAdminUser, setCurrentAdminUser] = useState<AdminUser | null>(null);

  const [currentStep, setCurrentStep] = useState<Step>(Step.LOGIN_PHONE);
  
  // Install Tutorial State
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  
  // Admin Login State
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminUsernameInput, setAdminUsernameInput] = useState(''); 
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminError, setAdminError] = useState('');

  // Login State
  const [loginPhone, setLoginPhone] = useState('');

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
  const [workerLogs, setWorkerLogs] = useState<WorkLog[]>([]);
  const [historySearchTerm, setHistorySearchTerm] = useState('');

  // Data
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsAppLoading(false);
    }, 2500);

    setWorkers(StorageService.getWorkers());
    setSites(StorageService.getSites());
    setWorkerLogs(StorageService.getLogs()); 
    setAdmins(StorageService.getAdmins());

    const unsubWorkers = StorageService.subscribeToWorkers((data) => setWorkers(data));
    const unsubSites = StorageService.subscribeToSites((data) => setSites(data));
    const unsubLogs = StorageService.subscribeToLogs((data) => setWorkerLogs(data));
    const unsubAdmins = StorageService.subscribeToAdmins((data) => setAdmins(data));

    if (window.PublicKeyCredential) {
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .then(isAvailable => {
          setBiometricsAvailable(isAvailable);
        })
        .catch(err => console.error("Bio check failed", err));
    }
    
    return () => {
      clearTimeout(timer);
      unsubWorkers();
      unsubSites();
      unsubLogs();
      unsubAdmins();
    };
  }, []);

  useEffect(() => {
    if (currentStep === Step.WORKER_DASHBOARD || currentStep === Step.WORKER_HISTORY) {
      setWorkerLogs(StorageService.getLogs());
      setHistorySearchTerm(''); // Reset search when entering history via dashboard
    }
  }, [currentStep]);

  // Lógica de Notificación de Retraso (8:05 AM)
  useEffect(() => {
    if (currentStep === Step.WORKER_DASHBOARD && selectedWorker) {
      
      // Intentar pedir permiso inmediatamente al entrar al Dashboard
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }

      const checkLateEntry = () => {
        const now = new Date();
        const minutesOfDay = now.getHours() * 60 + now.getMinutes();
        const limitTime = 8 * 60 + 5; // 8:05 AM en minutos

        // Si es más tarde de las 8:05
        if (minutesOfDay > limitTime) {
          const todayStr = new Date().toLocaleDateString('es-ES'); // "dd/mm/yyyy"
          
          // Verificar si ya tiene entrada hoy
          const hasEntryToday = workerLogs.some(l => 
             l.workerId === selectedWorker.id && 
             l.type === LogType.ENTRADA && 
             l.dateStr === todayStr
          );

          if (!hasEntryToday) {
            // Verificar si ya enviamos la notificación hoy para evitar spam
            // Usamos una clave única compuesta por ID y fecha
            const alertKey = `carmagne_alert_${selectedWorker.id}_${todayStr.replace(/\//g, '-')}`;
            const alreadyNotified = localStorage.getItem(alertKey);

            if (!alreadyNotified) {
              const sendNotification = () => {
                 try {
                    new Notification("⚠️ Fichaje Pendiente", {
                      body: `Hola ${selectedWorker.name.split(' ')[0]}, son más de las 8:05. Por favor registra tu entrada.`,
                      icon: "/logo.svg",
                      badge: "/logo.svg",
                      tag: "late-entry-alert",
                      vibrate: [200, 100, 200]
                    } as any);
                    // MARCAR COMO ENVIADO
                    localStorage.setItem(alertKey, 'true');
                 } catch (e) {
                   console.error("Error sending notification", e);
                 }
              };

              if (!("Notification" in window)) {
                 // No soportado
              } else if (Notification.permission === "granted") {
                sendNotification();
              } else if (Notification.permission !== "denied") {
                Notification.requestPermission().then(permission => {
                  if (permission === "granted") {
                    sendNotification();
                  }
                });
              }
            }
          }
        }
      };

      checkLateEntry(); // Ejecutar al entrar al dashboard
      const interval = setInterval(checkLateEntry, 60000); // Chequear cada minuto si la app sigue abierta
      return () => clearInterval(interval);
    }
  }, [currentStep, selectedWorker, workerLogs]);

  // Dynamic Greeting Logic
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 13) return "Buenos días";
    if (hour >= 13 && hour < 21) return "Buenas tardes";
    return "Buenas noches";
  };

  // Admin Login Handler
  const handleAdminAccessRequest = () => {
    setShowAdminLogin(true);
    setAdminUsernameInput('');
    setAdminPasswordInput('');
    setAdminError('');
  };

  const verifyAdminPassword = () => {
    const config = StorageService.getConfig();
    const masterPass = config.adminPassword || 'admin';
    
    // Check 1: Legacy Master Password (User can be anything or empty, as long as password matches master)
    // OR user types "admin" explicitly.
    const isMaster = adminPasswordInput === masterPass;

    // Check 2: New Admin Accounts (User AND Password must match)
    const foundAdmin = admins.find(a => 
      a.active &&
      a.username.trim().toLowerCase() === adminUsernameInput.trim().toLowerCase() && 
      a.password === adminPasswordInput
    );

    if (isMaster) {
      setIsAdmin(true);
      setCurrentAdminUser(null); // Null indicates Master Admin
      setShowAdminLogin(false);
    } else if (foundAdmin) {
      setIsAdmin(true);
      setCurrentAdminUser(foundAdmin); // Specific Admin User
      setShowAdminLogin(false);
    } else {
      setAdminError('Credenciales incorrectas');
      setAdminPasswordInput('');
    }
  };

  const handleAdminLogout = () => {
    setIsAdmin(false);
    setCurrentAdminUser(null);
  };

  // --- LÓGICA LOGIN POR TELÉFONO ---
  const handlePhoneLogin = () => {
    if(!loginPhone || loginPhone.length < 6) {
      setError("Ingresa un teléfono válido");
      return;
    }
    
    const worker = workers.find(w => w.phone && w.phone.replace(/\s/g, '') === loginPhone.replace(/\s/g, ''));
    
    if (worker) {
      if (!worker.active) {
        setError("Esta cuenta está desactivada. Contacta al administrador.");
        return;
      }
      setSelectedWorker(worker);
      setPinInput('');
      setError('');
      setCurrentStep(Step.AUTHENTICATE);
    } else {
      if(confirm("Este número no está registrado. ¿Quieres crear una cuenta nueva?")) {
        setRegPhone(loginPhone);
        setError('');
        setCurrentStep(Step.REGISTER);
      }
    }
  };

  const handleRegistration = async () => {
    if (!regName || !regDni || !regPin || !regPhone) {
      setError('Todos los campos son obligatorios.');
      return;
    }
    const exists = workers.find(w => w.phone === regPhone);
    if (exists) {
      setError('Este teléfono ya está registrado.');
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
    setError('');

    const newId = `W${Math.floor(1000 + Math.random() * 9000)}`;
    const newWorker: Worker = {
      id: newId,
      name: regName,
      dni: regDni,
      phone: regPhone.trim(),
      role: regRole || 'Trabajador',
      pin: regPin,
      qrCode: `QR_${newId}`,
      active: true,
      defaultMode: 'HORAS'
    };

    try {
      await StorageService.registerNewWorker(newWorker);
      setLoading(false);
      setSelectedWorker(newWorker);
      setPinInput('');
      setCurrentStep(Step.AUTHENTICATE);
      setRegName(''); setRegDni(''); setRegPhone(''); setRegRole(''); setRegPin(''); setRegPinConfirm('');
    } catch (err: any) {
      setLoading(false);
      setError('Error de conexión. No se pudo crear la cuenta.');
      alert("Error: No se pudo guardar en la base de datos.");
    }
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
    
    // Pre-cargar localización
    try {
      if (!location) {
        const loc = await LocationService.getCurrentPosition();
        setLocation(loc);
      }
    } catch (err) { }

    setLoading(false);

    // Lógica SIN CÁMARA
    if (type === LogType.SALIDA) {
      // Si es Salida, vamos al reporte
      setExitWorkMode(selectedWorker?.defaultMode || 'HORAS');
      setExitReportText('');
      setCurrentStep(Step.REPORT_EXIT);
    } else {
      // Para Entrada o Descansos, registramos directamente
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
      alert("Navegador no compatible con voz.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.continuous = false;
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setExitReportText(prev => (prev ? prev + '. ' + transcript : transcript));
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    setIsListening(true);
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
          loc!.latitude, loc!.longitude,
          selectedSite.coordinates.latitude, selectedSite.coordinates.longitude
        );
        if (distance > MAX_DISTANCE_METERS) warning = true;
      }
      
      await submitLog(loc!, type, distance, warning, undefined, report, mode);
    } catch (err: any) {
      setLoading(false);
      setError('Error GPS. Verifica permisos.');
    }
  };

  const submitLog = async (loc: GeoLocationData, type: LogType, distance: number, warning: boolean, photoUrl?: string, report?: string, mode?: WorkMode) => {
    if (!selectedWorker || !selectedSite) return;
    setLoading(true);
    const newLog: WorkLog = {
      id: `LOG-${Date.now()}`,
      workerId: selectedWorker.id,
      workerName: selectedWorker.name,
      siteId: selectedSite.id,
      siteName: selectedSite.name,
      type: type,
      timestamp: Date.now(),
      dateStr: new Date().toLocaleDateString('es-ES'),
      timeStr: new Date().toLocaleTimeString('es-ES'),
      location: loc,
      photoUrl: photoUrl, // Will be undefined
      sentToWhatsapp: false,
      syncedToSheets: false,
      distanceMeters: distance,
      locationWarning: warning,
      workReport: report,
      workMode: mode
    };

    try {
      await StorageService.addLog(newLog);
      StorageService.syncLog(newLog).then(success => {
        if (success) {
          newLog.syncedToSheets = true;
          StorageService.updateLog(newLog);
        }
      });
      setCurrentStep(Step.SUCCESS);
    } catch (err: any) {
      console.error(err);
      alert("Error al guardar: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetApp = () => {
    setCurrentStep(Step.LOGIN_PHONE);
    setSelectedWorker(null);
    setSelectedSite(null);
    setSelectedAction(null);
    setLocation(null);
    setPinInput('');
    setLoginPhone('');
    setError('');
  };

  const getCurrentStatus = () => {
    if (!selectedWorker) return null;
    const myLogs = workerLogs
      .filter(l => l.workerId === selectedWorker.id)
      .sort((a, b) => b.timestamp - a.timestamp);
    
    if (myLogs.length === 0) return { status: 'SIN ACTIVIDAD', site: '-', since: 0 };
    
    const last = myLogs[0];
    if (last.type === LogType.ENTRADA || last.type === LogType.FIN_DESCANSO) {
      return { status: 'TRABAJANDO', site: last.siteName, since: last.timestamp };
    } else if (last.type === LogType.INICIO_DESCANSO) {
      return { status: 'EN DESCANSO', site: last.siteName, since: last.timestamp };
    } else {
      return { status: 'FUERA', site: '-', since: last.timestamp };
    }
  };

  // --- RENDERERS ---

  const renderWorkerDashboard = () => {
    const status = getCurrentStatus();
    
    // Check for late entry visual alert
    const now = new Date();
    const minutesOfDay = now.getHours() * 60 + now.getMinutes();
    const limitTime = 8 * 60 + 5; 
    const isLate = minutesOfDay > limitTime;
    const hasEntryToday = workerLogs.some(l => 
        l.workerId === selectedWorker?.id && 
        l.type === LogType.ENTRADA && 
        l.dateStr === new Date().toLocaleDateString('es-ES')
    );
    const showLateAlert = isLate && !hasEntryToday;

    return (
      <div className="flex flex-col gap-6 animate-fadeIn h-full">
        <div className="flex justify-between items-center px-2">
          <span className="text-xl font-bold text-white tracking-tight">{selectedWorker?.name}</span>
          <button onClick={resetApp} className="text-slate-400 hover:text-white transition p-2 bg-slate-800 rounded-full border border-slate-700">
            <LogOut size={18} />
          </button>
        </div>

        {/* ALERTA DE RETRASO */}
        {showLateAlert && (
          <div className="bg-rose-950/80 border border-rose-600 rounded-2xl p-4 shadow-[0_0_20px_rgba(225,29,72,0.3)] animate-pulse flex items-center gap-4">
             <div className="bg-rose-600 p-3 rounded-full text-white">
                <BellRing size={24} />
             </div>
             <div>
                <h3 className="text-rose-100 font-black uppercase tracking-wider text-sm">Atención Requerida</h3>
                <p className="text-rose-200 text-xs mt-1 font-bold">Son más de las 8:05. Debes fichar la entrada inmediatamente.</p>
             </div>
          </div>
        )}

        <div className={`relative overflow-hidden rounded-2xl p-6 shadow-xl border border-slate-700/50 ${
          status?.status === 'TRABAJANDO' ? 'bg-gradient-to-br from-slate-900 to-emerald-950/30' :
          status?.status === 'EN DESCANSO' ? 'bg-gradient-to-br from-slate-900 to-amber-950/30' :
          'bg-gradient-to-br from-slate-900 to-slate-800'
        }`}>
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className={`text-[10px] font-bold tracking-[0.2em] uppercase mb-2 ${
               status?.status === 'TRABAJANDO' ? 'text-emerald-400' :
               status?.status === 'EN DESCANSO' ? 'text-amber-400' :
               'text-slate-500'
            }`}>Estado Actual</div>
            
            <h2 className="text-3xl font-black text-white mb-2 tracking-tight">{status?.status || 'SIN ACTIVIDAD'}</h2>
            
            {status?.status !== 'FUERA' && (
              <div className="mt-2 space-y-1">
                <p className="text-slate-300 font-medium">{status?.site}</p>
                <div className="flex items-center justify-center gap-2 text-xs text-slate-400 bg-slate-950/50 px-3 py-1 rounded-full border border-slate-700">
                  <Clock size={12}/> 
                  <span>Desde: {new Date(status?.since || 0).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <h3 className="text-slate-400 text-sm font-bold uppercase tracking-wider px-2 mt-2">Acciones Rápidas</h3>
        
        <div className="grid grid-cols-1 gap-4 flex-1">
           <button onClick={() => setCurrentStep(Step.SELECT_SITE)} className="group bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-blue-500/50 transition-all p-6 rounded-2xl shadow-lg flex items-center justify-between">
             <div className="text-left"><span className="block text-xl font-bold text-white group-hover:text-blue-400 transition-colors">Nuevo Fichaje</span><span className="text-slate-400 text-sm">Entrada, Salida o Pausa</span></div>
             <div className="bg-slate-900 p-3 rounded-full text-blue-500 group-hover:scale-110 transition-transform duration-300 shadow-inner"><Clock size={24} /></div>
           </button>

           <button onClick={() => setCurrentStep(Step.WORKER_HISTORY)} className="group bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-purple-500/50 transition-all p-6 rounded-2xl shadow-lg flex items-center justify-between">
             <div className="text-left"><span className="block text-xl font-bold text-white group-hover:text-purple-400 transition-colors">Mi Historial</span><span className="text-slate-400 text-sm">Ver mis horas y actividad</span></div>
             <div className="bg-slate-900 p-3 rounded-full text-purple-500 group-hover:scale-110 transition-transform duration-300 shadow-inner"><History size={24} /></div>
           </button>
        </div>
      </div>
    );
  };

  const renderWorkerHistory = () => {
    if (!selectedWorker) return null;

    // Filtramos los logs
    const myLogs = workerLogs
      .filter(l => l.workerId === selectedWorker.id)
      .sort((a, b) => b.timestamp - a.timestamp)
      .filter(l => {
         const lowerTerm = historySearchTerm.toLowerCase();
         // Buscar por Nombre de Obra, Fecha, Tipo de acción o Reporte
         return (
           l.siteName.toLowerCase().includes(lowerTerm) ||
           l.dateStr.toLowerCase().includes(lowerTerm) ||
           l.type.toLowerCase().includes(lowerTerm) ||
           (l.workReport || '').toLowerCase().includes(lowerTerm)
         );
      });

    const getIcon = (type: LogType) => {
       if(type === LogType.ENTRADA) return <ArrowRight size={20} className="text-emerald-500" />;
       if(type === LogType.SALIDA) return <LogOut size={20} className="text-rose-500" />;
       if(type === LogType.INICIO_DESCANSO) return <Coffee size={20} className="text-amber-500" />;
       if(type === LogType.FIN_DESCANSO) return <Briefcase size={20} className="text-blue-500" />;
       return <FileText size={20} className="text-slate-500" />;
    };

    const getTypeLabel = (type: LogType) => {
       if(type === LogType.ENTRADA) return "Entrada";
       if(type === LogType.SALIDA) return "Salida";
       if(type === LogType.INICIO_DESCANSO) return "Pausa";
       if(type === LogType.FIN_DESCANSO) return "Vuelta";
       return "Registro";
    };

    return (
       <div className="flex flex-col h-full animate-fadeIn overflow-hidden">
          {/* Header simple */}
          <div className="flex items-center gap-4 mb-4 shrink-0">
            <button 
               onClick={() => setCurrentStep(Step.WORKER_DASHBOARD)} 
               className="bg-slate-900 p-3 rounded-xl text-slate-400 hover:text-white border border-slate-800 transition"
            >
               <ChevronLeft size={20}/>
            </button>
            <div>
               <h2 className="text-xl font-bold text-white">Mi Historial</h2>
               <p className="text-xs text-slate-500">{myLogs.length} movimientos</p>
            </div>
          </div>
          
          {/* Search Bar */}
          <div className="mb-4 relative shrink-0">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
               <Search size={18} />
             </div>
             <input 
               type="text" 
               placeholder="Buscar por obra, fecha..." 
               className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl pl-10 pr-4 py-3 text-sm focus:border-blue-500 outline-none placeholder:text-slate-600 transition"
               value={historySearchTerm}
               onChange={(e) => setHistorySearchTerm(e.target.value)}
             />
             {historySearchTerm && (
               <button 
                 onClick={() => setHistorySearchTerm('')}
                 className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-white"
               >
                 <X size={16} />
               </button>
             )}
          </div>

          {/* Lista Scrollable */}
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pb-20 pr-1">
             {myLogs.length === 0 ? (
               <div className="flex flex-col items-center justify-center h-64 text-slate-600">
                  <History size={48} className="mb-4 opacity-30" />
                  <p className="text-sm font-medium">{historySearchTerm ? 'No hay resultados.' : 'No tienes actividad reciente.'}</p>
               </div>
             ) : (
               myLogs.map(log => (
                 <div key={log.id} className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex justify-between items-center group hover:border-slate-700 transition">
                    <div className="flex items-center gap-4">
                       <div className={`p-3 rounded-xl border border-slate-800 bg-slate-950 ${
                          log.type === LogType.ENTRADA ? 'bg-emerald-950/30 border-emerald-900/50' :
                          log.type === LogType.SALIDA ? 'bg-rose-950/30 border-rose-900/50' :
                          'bg-slate-950'
                       }`}>
                          {getIcon(log.type)}
                       </div>
                       <div>
                          <div className="flex items-center gap-2">
                             <h4 className="font-bold text-white text-sm">{getTypeLabel(log.type)}</h4>
                             {log.locationWarning && <ShieldAlert size={12} className="text-rose-500" />}
                          </div>
                          <p className="text-xs text-slate-400 font-medium">{log.siteName}</p>
                          {log.workReport && <p className="text-[10px] text-slate-500 italic mt-0.5 truncate max-w-[140px]">{log.workReport}</p>}
                       </div>
                    </div>
                    
                    <div className="text-right">
                       <p className="text-lg font-black text-white leading-tight">{log.timeStr}</p>
                       <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{log.dateStr}</p>
                    </div>
                 </div>
               ))
             )}
          </div>
       </div>
    );
  };

  // --- SPLASH SCREEN ---
  if (isAppLoading) {
    return (
      <div className="fixed inset-0 bg-slate-950 z-[100] flex flex-col items-center justify-center animate-fadeIn">
         <div className="flex flex-col items-center">
            <div className="flex items-center gap-3 mb-2">
               <h1 className="text-4xl font-black text-white tracking-tighter">CARMAGNE</h1>
               <img src="/logo.svg" alt="Logo" className="h-10 w-auto object-contain" />
            </div>
            <div className="h-1 w-24 bg-blue-600 rounded-full mb-3"></div>
            <p className="text-blue-500 font-bold tracking-[0.4em] text-sm">INSTAL 2024</p>
         </div>
      </div>
    );
  }

  // Render Admin
  if (isAdmin) {
    return <AdminPanel onBack={handleAdminLogout} currentUser={currentAdminUser} />;
  }

  // Main Render
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans selection:bg-blue-500/30">
      {/* Header */}
      <header className="glass-panel p-4 flex justify-between items-center sticky top-0 z-20 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-black tracking-tight leading-none text-white">CARMAGNE</h1>
            <p className="text-[10px] font-bold text-blue-500 tracking-[0.2em] uppercase mt-0.5">INSTAL 2024</p>
          </div>
          <img src="/logo.svg" alt="Logo" className="h-8 w-auto object-contain" />
        </div>
        <button onClick={handleAdminAccessRequest} className="p-2.5 bg-slate-800 text-slate-400 rounded-full border border-slate-700/50"><Lock size={16} /></button>
      </header>

      {/* Modals */}
      {showInstallGuide && <InstallTutorial onClose={() => setShowInstallGuide(false)} />}
      {showAdminLogin && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-4">
           <div className="bg-slate-900 w-full max-w-sm rounded-2xl border border-slate-800 p-8 relative">
              <button onClick={() => setShowAdminLogin(false)} className="absolute top-4 right-4 text-slate-500"><X size={20} /></button>
              <h2 className="text-xl font-bold text-white text-center mb-6">Acceso Admin</h2>
              
              <input 
                type="text" 
                value={adminUsernameInput} 
                onChange={(e) => setAdminUsernameInput(e.target.value)} 
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-white text-center text-xl mb-4 focus:border-blue-500 outline-none" 
                placeholder="Usuario" 
                autoFocus
              />

              <input 
                type="password" 
                value={adminPasswordInput} 
                onChange={(e) => setAdminPasswordInput(e.target.value)} 
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-white text-center text-xl mb-6 focus:border-blue-500 outline-none" 
                placeholder="••••••" 
              />
              
              {adminError && <div className="text-rose-500 text-xs text-center mb-4">{adminError}</div>}
              <button onClick={verifyAdminPassword} className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl">ENTRAR</button>
           </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col p-4 max-w-md mx-auto w-full relative h-[calc(100vh-80px)]">
        {error && <div className="mb-6 p-4 bg-rose-950/80 border border-rose-900 text-rose-200 rounded-xl flex items-center gap-3"><ShieldAlert size={20} /><span className="text-xs font-bold">{error}</span></div>}

        {currentStep === Step.LOGIN_PHONE && (
          <div className="flex flex-col gap-6 animate-fadeIn pt-8">
            <div className="text-center">
              <div className="bg-slate-900/50 p-5 rounded-full inline-flex mb-4 border border-slate-800"><Smartphone size={32} className="text-blue-500" /></div>
              <h2 className="text-2xl font-bold text-white mb-2">{getGreeting()}</h2>
              <p className="text-slate-400 text-sm">Bienvenido a Carmagne. Inicia sesión para continuar.</p>
            </div>
            <div className="bg-slate-900/80 p-6 rounded-3xl border border-slate-800 shadow-xl">
               <label className="block text-[10px] uppercase text-slate-500 font-bold mb-2 tracking-wider">Número de Teléfono</label>
               <div className="flex gap-3">
                 <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-white flex items-center justify-center"><Phone size={20} className="text-slate-500"/></div>
                 <input type="tel" value={loginPhone} onChange={(e) => setLoginPhone(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl p-4 text-lg focus:border-blue-500 outline-none tracking-widest" placeholder="600 000 000"/>
               </div>
               <button onClick={handlePhoneLogin} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl shadow-lg transition uppercase tracking-widest text-sm mt-6 flex items-center justify-center gap-2">Continuar <ArrowRight size={16} /></button>
            </div>
            <button onClick={() => setCurrentStep(Step.RECOVERY)} className="text-slate-500 text-xs font-bold text-center mt-4">¿Problemas para entrar?</button>
            <button onClick={() => setShowInstallGuide(true)} className="mx-auto mt-8 text-[10px] bg-slate-900 text-blue-500 px-4 py-2 rounded-full border border-blue-900/30 flex items-center gap-2">Instalar App</button>
          </div>
        )}

        {currentStep === Step.RECOVERY && (
           <div className="flex flex-col gap-6 animate-fadeIn pt-8 text-center">
              <button onClick={() => {setCurrentStep(Step.LOGIN_PHONE); setError('');}} className="text-slate-400 text-sm flex gap-1 mb-4"><ChevronLeft size={16} /> Volver</button>
              <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800">
                 <KeyRound size={48} className="text-blue-500 mx-auto mb-6" />
                 <h3 className="text-xl font-bold text-white mb-2">Recuperación</h3>
                 <p className="text-slate-400 text-sm mb-6">Contacta con la central para resetear tu PIN.</p>
                 <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 mb-6"><p className="text-white text-lg font-bold">631 40 00 10</p></div>
                 <a href="tel:631400010" className="block w-full bg-slate-800 text-white font-bold py-3 rounded-xl">Llamar</a>
              </div>
           </div>
        )}

        {currentStep === Step.REGISTER && (
          <div className="flex flex-col gap-6 animate-fadeIn">
            <button onClick={() => {setCurrentStep(Step.LOGIN_PHONE); setError('');}} className="text-slate-400 text-sm flex gap-1"><ChevronLeft size={16} /> Cancelar</button>
            <div className="text-center"><h2 className="text-xl font-bold text-white">Nueva Ficha</h2><p className="text-slate-400 text-xs">Registro para {regPhone}</p></div>
            <div className="flex flex-col gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800">
               <input type="text" value={regName} onChange={(e) => setRegName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg p-3.5 outline-none focus:border-blue-500" placeholder="Nombre Completo"/>
               <input type="text" value={regDni} onChange={(e) => setRegDni(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg p-3.5 outline-none focus:border-blue-500" placeholder="DNI"/>
               <input type="tel" value={regPhone} readOnly className="w-full bg-slate-800 border border-slate-700 text-slate-400 rounded-lg p-3.5 outline-none"/>
               <input type="text" value={regRole} onChange={(e) => setRegRole(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg p-3.5 outline-none focus:border-blue-500" placeholder="Cargo"/>
               <div className="grid grid-cols-2 gap-4">
                 <input type="password" value={regPin} onChange={(e) => setRegPin(e.target.value.slice(0,4))} className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg p-3.5 text-center tracking-widest text-lg outline-none focus:border-blue-500" placeholder="PIN"/>
                 <input type="password" value={regPinConfirm} onChange={(e) => setRegPinConfirm(e.target.value.slice(0,4))} className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg p-3.5 text-center tracking-widest text-lg outline-none focus:border-blue-500" placeholder="Repetir"/>
               </div>
            </div>
            <button onClick={handleRegistration} className="bg-emerald-600 hover:bg-emerald-500 text-white p-4 rounded-xl font-bold text-sm uppercase tracking-wide">{loading ? 'Guardando...' : 'Confirmar Registro'}</button>
          </div>
        )}

        {currentStep === Step.AUTHENTICATE && (
          <div className="flex flex-col gap-6 animate-fadeIn items-center justify-center flex-1">
             <button onClick={resetApp} className="text-slate-400 text-sm absolute top-0">← Salir</button>
            <div className="text-center mb-6 mt-4"><div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-6 border border-slate-800"><Lock size={32} className="text-blue-500" /></div><h2 className="text-2xl font-bold text-white mb-1">Hola, {selectedWorker?.name.split(' ')[0]}</h2><p className="text-slate-400 text-sm">Introduce tu PIN</p></div>
            <div className="flex gap-4 mb-8">{[0, 1, 2, 3].map(i => (<div key={i} className={`w-3 h-3 rounded-full transition-all ${i < pinInput.length ? 'bg-blue-500 scale-125' : 'bg-slate-800'}`}/>))}</div>
            <div className="grid grid-cols-3 gap-4 w-full max-w-[280px]">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (<button key={num} onClick={() => handlePinInput(num.toString())} className="h-16 rounded-2xl bg-slate-900 text-white text-xl font-bold hover:bg-slate-800 active:bg-blue-600 border border-slate-800">{num}</button>))}
              <div className="flex items-center justify-center">{biometricsAvailable && (<button onClick={handleBiometricAuth} className="h-14 w-14 rounded-full bg-slate-800 text-blue-400 flex items-center justify-center border border-slate-700"><Fingerprint size={24} /></button>)}</div>
              <button onClick={() => handlePinInput('0')} className="h-16 rounded-2xl bg-slate-900 text-white text-xl font-bold hover:bg-slate-800 active:bg-blue-600 border border-slate-800">0</button>
              <button onClick={handlePinClear} className="h-16 flex items-center justify-center text-rose-500 hover:text-rose-400"><Delete size={24} /></button>
            </div>
          </div>
        )}

        {currentStep === Step.WORKER_DASHBOARD && renderWorkerDashboard()}
        {currentStep === Step.WORKER_HISTORY && renderWorkerHistory()}
        
        {currentStep === Step.SELECT_SITE && (
            <div className="flex flex-col gap-4">
                <button onClick={() => setCurrentStep(Step.WORKER_DASHBOARD)} className="text-slate-400 text-sm flex gap-1"><ChevronLeft size={16}/> Volver</button>
                <h2 className="text-2xl font-bold text-white text-center">Selecciona Obra</h2>
                <div className="grid gap-3">
                  {sites.filter(s => s.active).map(site => (
                    <button key={site.id} onClick={() => handleSiteSelect(site.id)} className="bg-slate-900 p-5 rounded-xl text-left border border-slate-800 hover:border-blue-500/50 transition">
                      <h3 className="text-lg font-bold text-white">{site.name}</h3>
                      <p className="text-slate-400 text-xs">{site.address}</p>
                    </button>
                  ))}
                </div>
            </div>
        )}
        
        {currentStep === Step.SELECT_ACTION && (
            <div className="flex flex-col gap-4">
                <button onClick={() => setCurrentStep(Step.SELECT_SITE)} className="text-slate-400 text-sm">← Cambiar Obra</button>
                <div className="grid gap-4">
                    <button onClick={() => handleActionSelect(LogType.ENTRADA)} className="bg-emerald-600 p-6 rounded-2xl text-white font-bold flex justify-between items-center">ENTRADA <LogOut className="rotate-180"/></button>
                    <div className="grid grid-cols-2 gap-4">
                        <button onClick={() => handleActionSelect(LogType.INICIO_DESCANSO)} className="bg-amber-600 p-4 rounded-2xl text-white font-bold text-sm">INICIO<br/>DESCANSO</button>
                        <button onClick={() => handleActionSelect(LogType.FIN_DESCANSO)} className="bg-blue-600 p-4 rounded-2xl text-white font-bold text-sm">FIN<br/>DESCANSO</button>
                    </div>
                    <button onClick={() => handleActionSelect(LogType.SALIDA)} className="bg-rose-600 p-6 rounded-2xl text-white font-bold flex justify-between items-center">SALIDA <LogOut/></button>
                </div>
            </div>
        )}

        {currentStep === Step.REPORT_EXIT && (
            <div className="flex flex-col gap-4">
                <h2 className="text-white text-xl font-bold text-center">Reporte Salida</h2>
                <textarea value={exitReportText} onChange={(e) => setExitReportText(e.target.value)} className="bg-slate-900 text-white p-4 rounded-xl border border-slate-800 min-h-[150px]" placeholder="Detalles..."></textarea>
                <button onClick={() => executeLogSubmission(LogType.SALIDA, exitReportText, exitWorkMode)} className="bg-emerald-600 p-4 rounded-xl text-white font-bold">Confirmar Salida</button>
            </div>
        )}
        
        {currentStep === Step.SUCCESS && (
            <div className="text-center py-10">
                <CheckCircle size={64} className="text-emerald-500 mx-auto mb-4"/>
                <h2 className="text-2xl text-white font-bold">Registrado</h2>
                <button onClick={resetApp} className="mt-8 bg-blue-600 text-white px-8 py-3 rounded-xl font-bold">Inicio</button>
            </div>
        )}

      </main>
      
      <footer className="p-4 text-center text-slate-600 text-[10px] font-medium tracking-wider uppercase">
        &copy; 2024 CARMAGNE INSTAL. V2.0
      </footer>
    </div>
  );
}

export default App;