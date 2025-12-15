import React, { useState, useEffect } from 'react';
import { StorageService } from '../services/storageService';
import { Worker, Site, WorkLog, AppConfig, WorkMode, LogType, AdminUser } from '../types';
import { 
  Users, MapPin, Download, Settings, FileText, 
  Trash2, Plus, Save, Lock, Database, ClipboardList, Calendar, X, UserPlus, Phone, Filter, Search, Clock, Shield, Pencil
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ConfirmationModal } from './ConfirmationModal';

interface AdminPanelProps {
  onBack: () => void;
  currentUser: AdminUser | null; // Null means "Super Admin" (Master Password)
}

interface WorkerMonthlyReport {
  workerId: string;
  workerName: string;
  totalPresenceMs: number;
  totalBreakMs: number;
  netWorkMs: number;
  daysWorked: number;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onBack, currentUser }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'logs' | 'reports' | 'workers' | 'sites' | 'admins' | 'config'>('dashboard');
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [config, setConfig] = useState<AppConfig>(StorageService.getConfig());

  const [reportMonth, setReportMonth] = useState<string>(new Date().toISOString().slice(0, 7));

  const [newWorkerName, setNewWorkerName] = useState('');
  const [newWorkerPin, setNewWorkerPin] = useState('');
  const [newWorkerMode, setNewWorkerMode] = useState<WorkMode>('HORAS');
  
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteAddress, setNewSiteAddress] = useState('');
  
  // Editing State for Sites
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);

  const [newAdminUser, setNewAdminUser] = useState('');
  const [newAdminPass, setNewAdminPass] = useState('');
  
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'worker' | 'site' | 'admin', id: string, name: string } | null>(null);
  
  // Estado para confirmación de contraseña maestra
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

  // ESTADOS DE FILTRO
  const [filterWorker, setFilterWorker] = useState<string>('ALL');
  const [filterDate, setFilterDate] = useState<string>(''); // Fecha específica YYYY-MM-DD
  const [filterType, setFilterType] = useState<string>('ALL');
  
  // ESTADO BÚSQUEDA TRABAJADORES
  const [workerSearch, setWorkerSearch] = useState('');
  
  // Logic for Admin Permissions
  const isSuperAdmin = currentUser === null;

  useEffect(() => {
    // Carga inicial
    setLogs(StorageService.getLogs());
    setWorkers(StorageService.getWorkers());
    setSites(StorageService.getSites());
    setAdmins(StorageService.getAdmins());
    
    // Suscripciones
    const unsubscribeLogs = StorageService.subscribeToLogs((updatedLogs) => setLogs(updatedLogs));
    const unsubscribeWorkers = StorageService.subscribeToWorkers((updatedWorkers) => setWorkers(updatedWorkers));
    const unsubscribeSites = StorageService.subscribeToSites((updatedSites) => setSites(updatedSites));
    const unsubscribeAdmins = StorageService.subscribeToAdmins((updatedAdmins) => setAdmins(updatedAdmins));

    return () => {
      unsubscribeLogs();
      unsubscribeWorkers();
      unsubscribeSites();
      unsubscribeAdmins();
    };
  }, []);

  const handleExport = () => {
    if (!confirm('¿Está seguro que desea exportar todos los registros a CSV?')) return;
    const csv = StorageService.exportToCSV(logs);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Fichajes_CARMAGNE_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  // Helper Greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 13) return "Buenos días";
    if (hour >= 13 && hour < 21) return "Buenas tardes";
    return "Buenas noches";
  };

  // LÓGICA DE FILTRADO REAL
  const getFilteredLogs = () => {
    return logs.filter(log => {
      // 1. Filtro por Trabajador
      const matchWorker = filterWorker === 'ALL' || log.workerId === filterWorker;
      
      // 2. Filtro por Fecha
      let matchDate = true;
      if (filterDate) {
         // Convertir fecha del log (DD/MM/YYYY) a comparable
         const [day, month, year] = log.dateStr.split('/');
         // Convertir input (YYYY-MM-DD) a comparable
         const [iYear, iMonth, iDay] = filterDate.split('-');
         
         matchDate = (day === iDay && month === iMonth && year === iYear);
      }

      // 3. Filtro por Tipo
      const matchType = filterType === 'ALL' || 
                        (filterType === 'DESCANSO' ? (log.type === LogType.INICIO_DESCANSO || log.type === LogType.FIN_DESCANSO) : log.type === filterType);
      
      return matchWorker && matchDate && matchType;
    });
  };

  const getWeeklyHours = () => {
    const curr = new Date();
    const day = curr.getDay();
    const diff = curr.getDate() - day + (day === 0 ? -6 : 1); // Monday
    const monday = new Date(curr.setDate(diff));
    monday.setHours(0, 0, 0, 0);

    const weekLogs = logs.filter(l => l.timestamp >= monday.getTime());
    let totalMs = 0;

    workers.forEach(w => {
        const wLogs = weekLogs.filter(l => l.workerId === w.id).sort((a,b) => a.timestamp - b.timestamp);
        let entryTime = 0;
        let breakStartTime = 0;

        wLogs.forEach(log => {
            if (log.type === LogType.ENTRADA) entryTime = log.timestamp;
            else if (log.type === LogType.SALIDA && entryTime !== 0) {
                totalMs += (log.timestamp - entryTime);
                entryTime = 0;
            }
            // Subtract breaks
            if (log.type === LogType.INICIO_DESCANSO) breakStartTime = log.timestamp;
            else if (log.type === LogType.FIN_DESCANSO && breakStartTime !== 0) {
                totalMs -= (log.timestamp - breakStartTime);
                breakStartTime = 0;
            }
        });
    });

    return (totalMs / 3600000).toFixed(1);
  };

  const handleAddWorker = () => {
      if (!newWorkerName || !newWorkerPin) { alert("Nombre y PIN obligatorios"); return; }
      const newWorker: Worker = { id: `W${Math.floor(Math.random()*10000)}`, name: newWorkerName, qrCode: `QR_${Date.now()}`, active: true, pin: newWorkerPin, role: 'Trabajador', defaultMode: newWorkerMode };
      StorageService.registerNewWorker(newWorker); setNewWorkerName(''); setNewWorkerPin('');
  };
  
  const handleAddAdmin = () => {
      if (!newAdminUser || !newAdminPass) { alert("Usuario y contraseña obligatorios"); return; }
      const newAdmin: AdminUser = { id: `ADM${Math.floor(Math.random()*10000)}`, username: newAdminUser, password: newAdminPass, active: true, createdAt: Date.now() };
      StorageService.addAdmin(newAdmin); setNewAdminUser(''); setNewAdminPass('');
  };

  const initiateDeleteWorker = (w: Worker) => setDeleteTarget({ type: 'worker', id: w.id, name: w.name });
  const initiateDeleteSite = (s: Site) => setDeleteTarget({ type: 'site', id: s.id, name: s.name });
  const initiateDeleteAdmin = (a: AdminUser) => setDeleteTarget({ type: 'admin', id: a.id, name: a.username });

  const confirmDelete = () => { 
      if (!deleteTarget) return; 
      if (deleteTarget.type === 'worker') StorageService.deleteWorker(deleteTarget.id); 
      else if (deleteTarget.type === 'site') StorageService.deleteSite(deleteTarget.id); 
      else if (deleteTarget.type === 'admin') StorageService.deleteAdmin(deleteTarget.id);
      setDeleteTarget(null); 
  };

  const handleSaveSite = () => { 
      if (!newSiteName) return;
      
      if (editingSiteId) {
        // Edit Mode
        const siteToUpdate = sites.find(s => s.id === editingSiteId);
        if (siteToUpdate) {
            const updatedSite: Site = {
                ...siteToUpdate,
                name: newSiteName,
                address: newSiteAddress
            };
            StorageService.updateSite(updatedSite);
        }
        setEditingSiteId(null);
      } else {
        // Add Mode
        const newSite: Site = { id: `S${Math.floor(Math.random()*10000)}`, name: newSiteName, address: newSiteAddress, active: true }; 
        StorageService.saveSites([...sites, newSite]);
      }
      
      setNewSiteName(''); 
      setNewSiteAddress(''); 
  };

  const startEditSite = (site: Site) => {
      setEditingSiteId(site.id);
      setNewSiteName(site.name);
      setNewSiteAddress(site.address);
  };

  const cancelEditSite = () => {
      setEditingSiteId(null);
      setNewSiteName('');
      setNewSiteAddress('');
  };

  // Config Saving Logic
  const attemptSaveConfig = () => {
    if (newAdminPassword) {
      setShowPasswordConfirm(true);
    } else {
      executeSaveConfig();
    }
  };

  const executeSaveConfig = () => {
    const updatedConfig = { ...config };
    if (newAdminPassword) updatedConfig.adminPassword = newAdminPassword;
    StorageService.saveConfig(updatedConfig);
    setConfig(updatedConfig);
    setNewAdminPassword('');
    setShowPasswordConfirm(false);
    alert('Guardado correctamente');
  };
  
  const generateMonthlyReport = (): WorkerMonthlyReport[] => {
      const [year, month] = reportMonth.split('-').map(Number);
      const monthlyLogs = logs.filter(log => { const d = new Date(log.timestamp); return d.getFullYear() === year && (d.getMonth() + 1) === month; });
      monthlyLogs.sort((a, b) => a.timestamp - b.timestamp);
      const reports: WorkerMonthlyReport[] = [];
      workers.forEach(worker => {
        const workerLogs = monthlyLogs.filter(l => l.workerId === worker.id);
        let totalPresence = 0; let totalBreaks = 0; let lastEntryTime: number | null = null; let lastBreakStartTime: number | null = null; let daysSet = new Set<string>();
        for (const log of workerLogs) {
          if (log.type === LogType.REGISTRO) continue;
          daysSet.add(log.dateStr);
          if (log.type === LogType.ENTRADA) if (lastEntryTime === null) lastEntryTime = log.timestamp;
          if (log.type === LogType.SALIDA) if (lastEntryTime !== null) { totalPresence += (log.timestamp - lastEntryTime); lastEntryTime = null; if (lastBreakStartTime !== null) { totalBreaks += (log.timestamp - lastBreakStartTime); lastBreakStartTime = null; } }
          if (log.type === LogType.INICIO_DESCANSO) if (lastBreakStartTime === null) lastBreakStartTime = log.timestamp;
          if (log.type === LogType.FIN_DESCANSO) if (lastBreakStartTime !== null) { totalBreaks += (log.timestamp - lastBreakStartTime); lastBreakStartTime = null; }
        }
        if (workerLogs.length > 0) reports.push({ workerId: worker.id, workerName: worker.name, totalPresenceMs: totalPresence, totalBreakMs: totalBreaks, netWorkMs: Math.max(0, totalPresence - totalBreaks), daysWorked: daysSet.size });
      });
      return reports;
  };

  const handleDownloadPDF = (summary: WorkerMonthlyReport) => {
      const doc = new jsPDF(); const [year, month] = reportMonth.split('-').map(Number);
      const workerLogs = logs.filter(log => { const d = new Date(log.timestamp); return log.workerId === summary.workerId && d.getFullYear() === year && (d.getMonth() + 1) === month; }).sort((a, b) => a.timestamp - b.timestamp);
      doc.text("INFORME MENSUAL", 105, 20, { align: 'center' });
      const tableData = workerLogs.map(log => [log.dateStr, log.timeStr, log.type, log.siteName, log.workMode || '', log.workReport || '']);
      autoTable(doc, { startY: 40, head: [['Fecha', 'Hora', 'Acción', 'Obra', 'Modo', 'Reporte']], body: tableData });
      doc.save(`Reporte_${summary.workerName}.pdf`);
  };
  const msToTime = (d: number) => `${Math.floor(d/3600000)}h ${Math.floor((d%3600000)/60000)}m`;
  const logsByType = [{ name: 'Entrada', value: logs.filter(l => l.type === LogType.ENTRADA).length }, { name: 'Salida', value: logs.filter(l => l.type === LogType.SALIDA).length }, { name: 'Registros', value: logs.filter(l => l.type === LogType.REGISTRO).length }];
  const COLORS = ['#3b82f6', '#10b981', '#94a3b8'];

  // Tabs Configuration based on permissions
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: FileText }, 
    { id: 'logs', label: 'Registros', icon: Database }, 
    { id: 'reports', label: 'Informes', icon: ClipboardList }, 
    { id: 'workers', label: 'Personal', icon: Users }, 
    { id: 'sites', label: 'Obras', icon: MapPin },
    // Only Show Admin Tab if Super Admin (currentUser is null)
    ...(isSuperAdmin ? [{ id: 'admins', label: 'Admins', icon: Shield }] : []),
    { id: 'config', label: 'Config', icon: Settings }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20 font-sans">
      
      {/* Modal de eliminación */}
      <ConfirmationModal isOpen={deleteTarget !== null} title="Eliminar" message="¿Seguro?" isDestructive={true} onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete} />
      
      {/* Modal de confirmación de contraseña maestra */}
      <ConfirmationModal 
        isOpen={showPasswordConfirm} 
        title="Cambiar Contraseña Maestra" 
        message="Estás a punto de cambiar la contraseña de acceso global (Legacy). Asegúrate de recordarla para evitar perder el acceso en emergencias." 
        confirmText="Cambiar Contraseña"
        isDestructive={true} 
        onCancel={() => setShowPasswordConfirm(false)} 
        onConfirm={executeSaveConfig} 
      />

      <header className="bg-slate-900 p-4 sticky top-0 z-10 shadow-md flex justify-between items-center border-b border-slate-800">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-black text-white tracking-tight">CARMAGNE ADMIN</h1>
          <img src="/logo.svg" alt="Logo" className="h-8 w-auto object-contain" />
        </div>
        <div className="flex items-center gap-4">
           {/* Admin Avatar & Name */}
           <div className="hidden md:flex items-center gap-3 bg-slate-950 pr-4 pl-1 py-1 rounded-full border border-slate-800">
              <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg">
                 {currentUser ? currentUser.username.substring(0,2).toUpperCase() : 'S'}
              </div>
              <span className="text-sm font-medium text-slate-300">
                 {currentUser ? currentUser.username : 'Super Admin'}
              </span>
           </div>
           <button onClick={onBack} className="text-xs bg-slate-800 text-slate-300 border border-slate-700 px-4 py-2 rounded hover:bg-slate-700 transition">Salir</button>
        </div>
      </header>

      <div className="flex overflow-x-auto bg-slate-900 border-b border-slate-800">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex-1 min-w-[100px] py-4 flex flex-col items-center gap-1 text-sm font-medium transition-colors ${activeTab === tab.id ? 'text-blue-500 border-b-2 border-blue-500 bg-slate-800' : 'text-slate-500 hover:text-slate-300'}`}>
            <tab.icon size={20} />{tab.label}
          </button>
        ))}
      </div>

      <div className="p-6 max-w-7xl mx-auto">
        
        {/* DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-fadeIn">
             {/* Header Bienvenida Personalizado */}
             <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-800 pb-6">
                <div>
                   <h2 className="text-3xl font-black text-white tracking-tight flex items-center gap-2">
                     {getGreeting()}, <span className="text-blue-500">{currentUser ? currentUser.username : 'Super Admin'}</span>
                   </h2>
                   <p className="text-slate-400 mt-1 capitalize">{new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                </div>
                <div className="hidden md:block text-right">
                    <div className="inline-flex items-center gap-2 bg-slate-900 px-4 py-2 rounded-xl border border-slate-800">
                      <Clock size={16} className="text-blue-500"/>
                      <span className="font-mono font-bold text-slate-300">
                        {new Date().toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit'})}
                      </span>
                    </div>
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition"><FileText size={64}/></div>
                    <h3 className="text-slate-500 text-xs uppercase font-bold tracking-wider relative z-10">Total Registros</h3>
                    <p className="text-4xl font-black text-white mt-2 relative z-10">{logs.length}</p>
                 </div>
                 <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition"><MapPin size={64}/></div>
                    <h3 className="text-slate-500 text-xs uppercase font-bold tracking-wider relative z-10">Obras Activas</h3>
                    <p className="text-4xl font-black text-blue-500 mt-2 relative z-10">{sites.filter(s => s.active).length}</p>
                 </div>
                 <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition"><Users size={64}/></div>
                    <h3 className="text-slate-500 text-xs uppercase font-bold tracking-wider relative z-10">Trabajadores</h3>
                    <p className="text-4xl font-black text-emerald-500 mt-2 relative z-10">{workers.filter(w => w.active).length}</p>
                 </div>

                 {/* New Weekly Hours Card */}
                 <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition"><Clock size={64}/></div>
                    <h3 className="text-slate-500 text-xs uppercase font-bold tracking-wider relative z-10">Horas Semanales</h3>
                    <p className="text-4xl font-black text-amber-500 mt-2 relative z-10">{getWeeklyHours()}h</p>
                    <p className="text-xs text-slate-500 mt-1 relative z-10">Total acumulado esta semana</p>
                 </div>

                 <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 col-span-1 md:col-span-2 h-80">
                    <h3 className="font-bold mb-6 text-slate-300">Actividad</h3>
                    <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={logsByType} cx="50%" cy="50%" outerRadius={80} fill="#8884d8" dataKey="value" label>{logsByType.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}</Pie><RechartsTooltip /></PieChart></ResponsiveContainer>
                 </div>
                 <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
                   <h3 className="font-bold mb-4 text-slate-300">Acciones</h3>
                   <button onClick={handleExport} className="w-full bg-emerald-600 text-white p-4 rounded-xl font-bold mb-4 flex items-center justify-center gap-2 hover:bg-emerald-500 transition shadow-lg"><Download/> Exportar CSV</button>
                   <p className="text-xs text-slate-500 text-center">Descarga el historial completo en formato compatible con Excel.</p>
                 </div>
             </div>
          </div>
        )}

        {/* LOGS TAB - AHORA CON FILTROS VISIBLES Y FUNCIONALES */}
        {activeTab === 'logs' && (
          <div className="space-y-6 animate-fadeIn">
            
            {/* --- ZONA DE FILTROS VISIBLE --- */}
            <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 flex flex-col lg:flex-row gap-6 items-end shadow-lg">
               
               {/* Filtro Trabajador */}
               <div className="flex-1 w-full">
                 <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider flex items-center gap-2">
                    <Users size={14} /> Trabajador
                 </label>
                 <div className="relative">
                   <select 
                      className="w-full bg-slate-950 border border-slate-700 text-white p-3 rounded-lg appearance-none focus:border-blue-500 outline-none cursor-pointer hover:border-slate-600 transition"
                      value={filterWorker} 
                      onChange={(e) => setFilterWorker(e.target.value)}
                   >
                      <option value="ALL">Todos los trabajadores</option>
                      {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                   </select>
                   <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-500">▼</div>
                 </div>
               </div>

               {/* Filtro Fecha */}
               <div className="flex-1 w-full">
                 <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider flex items-center gap-2">
                    <Calendar size={14} /> Fecha Específica
                 </label>
                 <div className="flex gap-2">
                   <input 
                      type="date" 
                      className="w-full bg-slate-950 border border-slate-700 text-white p-3 rounded-lg focus:border-blue-500 outline-none cursor-pointer hover:border-slate-600 transition"
                      value={filterDate} 
                      onChange={(e) => setFilterDate(e.target.value)}
                   />
                   {filterDate && (
                     <button 
                       onClick={() => setFilterDate('')}
                       className="bg-slate-800 text-slate-400 p-3 rounded-lg hover:bg-slate-700 hover:text-white transition border border-slate-700"
                       title="Limpiar fecha"
                     >
                       <X size={20} />
                     </button>
                   )}
                 </div>
               </div>

               {/* Filtro Tipo */}
               <div className="flex-1 w-full">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider flex items-center gap-2">
                    <Filter size={14} /> Tipo Acción
                  </label>
                  <div className="relative">
                    <select 
                        className="w-full bg-slate-950 border border-slate-700 text-white p-3 rounded-lg appearance-none focus:border-blue-500 outline-none cursor-pointer hover:border-slate-600 transition"
                        value={filterType} 
                        onChange={(e) => setFilterType(e.target.value)}
                    >
                        <option value="ALL">Todas las acciones</option>
                        <option value={LogType.ENTRADA}>Entrada</option>
                        <option value={LogType.SALIDA}>Salida</option>
                        <option value="DESCANSO">Descansos</option>
                        <option value={LogType.REGISTRO}>Registros</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-500">▼</div>
                  </div>
               </div>

               <div className="pb-3 lg:pb-0 min-w-[100px] text-right">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Resultados</span>
                  <span className="text-3xl font-black text-white">{getFilteredLogs().length}</span>
               </div>
            </div>

            {/* TABLA DE DATOS */}
            <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800 shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-slate-300">
                  <thead className="bg-slate-950 text-slate-500 uppercase font-bold text-xs border-b border-slate-800">
                    <tr>
                      <th className="p-4">Fecha/Hora</th>
                      <th className="p-4">Trabajador</th>
                      <th className="p-4">Obra/Evento</th>
                      <th className="p-4">Acción</th>
                      <th className="p-4">Info</th>
                      <th className="p-4">Ubicación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {getFilteredLogs().map(log => (
                      <tr key={log.id} className={`hover:bg-slate-800/50 transition-colors ${log.locationWarning ? 'bg-rose-950/10' : ''}`}>
                        <td className="p-4">
                          <div className="font-bold text-white">{log.dateStr}</div>
                          <div className="text-xs text-slate-500 font-mono">{log.timeStr}</div>
                        </td>
                        <td className="p-4 font-medium text-white">{log.workerName}</td>
                        <td className="p-4 text-slate-400">{log.siteName}</td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wide border ${
                            log.type === LogType.ENTRADA ? 'bg-emerald-950/30 text-emerald-400 border-emerald-900/50' :
                            log.type === LogType.SALIDA ? 'bg-rose-950/30 text-rose-400 border-rose-900/50' :
                            log.type === LogType.REGISTRO ? 'bg-blue-950/30 text-blue-400 border-blue-900/50' :
                            'bg-amber-950/30 text-amber-400 border-amber-900/50'
                          }`}>{log.type}</span>
                        </td>
                        <td className="p-4 max-w-xs text-xs text-slate-500 truncate" title={log.workReport}>{log.workReport || '-'}</td>
                        <td className="p-4">
                           {log.location.latitude !== 0 ? (
                             <a href={`https://www.google.com/maps?q=${log.location.latitude},${log.location.longitude}`} target="_blank" className="text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1 text-xs font-medium">
                               <MapPin size={14}/> {log.location.latitude.toFixed(5)}, {log.location.longitude.toFixed(5)}
                             </a>
                           ) : <span className="text-xs text-slate-600 italic">Sistema</span>}
                           {log.locationWarning && <span className="block text-[10px] text-rose-500 font-bold mt-1">⚠️ Fuera de rango</span>}
                        </td>
                      </tr>
                    ))}
                    {getFilteredLogs().length === 0 && (
                      <tr><td colSpan={6} className="p-12 text-center text-slate-500 italic">No se encontraron registros con los filtros actuales.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* WORKERS TAB */}
        {activeTab === 'workers' && (
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 animate-fadeIn">
            
            {/* Nuevo Trabajador Form */}
            <div className="flex flex-col md:flex-row gap-4 mb-8 bg-slate-950 p-6 rounded-xl border border-slate-800">
              <div className="flex-1 space-y-2">
                 <label className="text-xs font-bold uppercase text-slate-500 tracking-wide">Nombre</label>
                 <input type="text" placeholder="Nombre del trabajador" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-lg focus:border-blue-500 outline-none text-white" value={newWorkerName} onChange={(e) => setNewWorkerName(e.target.value)}/>
              </div>
              <div className="w-full md:w-48 space-y-2">
                <label className="text-xs font-bold uppercase text-slate-500 tracking-wide">Modo</label>
                <select className="w-full bg-slate-900 border border-slate-700 p-3 rounded-lg text-white text-sm outline-none" value={newWorkerMode} onChange={(e) => setNewWorkerMode(e.target.value as WorkMode)}>
                  <option value="HORAS">Por Horas</option>
                  <option value="DESTAJO">A Destajo</option>
                </select>
              </div>
              <div className="w-full md:w-32 space-y-2">
                 <label className="text-xs font-bold uppercase text-slate-500 tracking-wide">PIN</label>
                 <input type="text" placeholder="0000" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-lg text-center tracking-widest outline-none text-white" value={newWorkerPin} maxLength={4} onChange={(e) => setNewWorkerPin(e.target.value.replace(/\D/g,''))}/>
              </div>
              <div className="flex items-end">
                <button onClick={handleAddWorker} className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-500 flex items-center justify-center font-bold shadow-lg transition"><Plus size={20} /></button>
              </div>
            </div>

            {/* Buscador de Trabajadores */}
            <div className="mb-6 relative">
                 <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <Search size={20} />
                 </div>
                 <input 
                    type="text" 
                    placeholder="Buscar trabajador por nombre..." 
                    className="w-full bg-slate-950 border border-slate-700 pl-10 p-3 rounded-lg text-white focus:border-blue-500 outline-none transition-colors"
                    value={workerSearch}
                    onChange={(e) => setWorkerSearch(e.target.value)}
                 />
            </div>

            <div className="grid gap-4">
              {workers
                .filter(w => w.name.toLowerCase().includes(workerSearch.toLowerCase()))
                .map(w => (
                <div key={w.id} className="flex flex-col md:flex-row items-center justify-between p-4 border border-slate-800 rounded-xl hover:bg-slate-800/50 transition gap-4 bg-slate-900">
                  <div className="flex items-center gap-4">
                    <div className="bg-slate-800 p-3 rounded-full hidden md:block text-slate-500"><Users size={20}/></div>
                    <div>
                      <h3 className="font-bold text-lg text-white">{w.name}</h3>
                      <div className="flex flex-col gap-1 mt-1">
                         <div className="flex gap-2 text-xs"><span className="bg-slate-800 px-2 py-0.5 rounded text-slate-500 font-mono">ID: {w.id}</span><span className={`px-2 py-0.5 rounded font-bold uppercase ${w.defaultMode === 'DESTAJO' ? 'bg-purple-900/30 text-purple-400' : 'bg-blue-900/30 text-blue-400'}`}>{w.defaultMode || 'HORAS'}</span></div>
                         {w.phone && <span className="text-xs text-slate-500 flex items-center gap-1"><Phone size={10}/> {w.phone}</span>}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => initiateDeleteWorker(w)} className="text-slate-500 hover:text-rose-500 p-2 hover:bg-rose-900/20 rounded-lg transition"><Trash2 size={20} /></button>
                </div>
              ))}
              
              {workers.filter(w => w.name.toLowerCase().includes(workerSearch.toLowerCase())).length === 0 && (
                  <div className="text-center p-8 text-slate-500 italic">No se encontraron trabajadores con ese nombre.</div>
              )}
            </div>
          </div>
        )}

        {/* SITES TAB */}
        {activeTab === 'sites' && (
           <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 animate-fadeIn">
              <div className="flex gap-2 mb-6">
                <input type="text" placeholder="Nombre Obra" className="flex-1 bg-slate-950 border border-slate-700 p-3 rounded-lg text-white focus:border-blue-500 outline-none" value={newSiteName} onChange={(e)=>setNewSiteName(e.target.value)}/>
                <input type="text" placeholder="Dirección" className="flex-1 bg-slate-950 border border-slate-700 p-3 rounded-lg text-white focus:border-blue-500 outline-none" value={newSiteAddress} onChange={(e)=>setNewSiteAddress(e.target.value)}/>
                
                {/* Botón Guardar / Añadir */}
                <button 
                  onClick={handleSaveSite} 
                  className={`p-3 rounded-lg text-white transition flex items-center justify-center ${editingSiteId ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-blue-600 hover:bg-blue-500'}`}
                  title={editingSiteId ? "Guardar cambios" : "Añadir obra"}
                >
                  {editingSiteId ? <Save size={20}/> : <Plus size={20}/>}
                </button>

                {/* Botón Cancelar (Solo en modo edición) */}
                {editingSiteId && (
                  <button 
                    onClick={cancelEditSite}
                    className="bg-slate-800 text-slate-400 p-3 rounded-lg hover:bg-slate-700 border border-slate-700"
                    title="Cancelar edición"
                  >
                    <X size={20}/>
                  </button>
                )}
              </div>

              <div className="grid gap-4">
                {sites.map(s => (
                  <div key={s.id} className={`flex justify-between p-5 border rounded-xl transition ${editingSiteId === s.id ? 'bg-slate-800/80 border-blue-500/50' : 'border-slate-800 hover:bg-slate-800/30'}`}>
                    <div>
                      <h3 className="font-bold text-white flex items-center gap-2">
                        {s.name}
                        {editingSiteId === s.id && <span className="text-[10px] bg-blue-900/50 text-blue-400 px-2 py-0.5 rounded uppercase tracking-wider">Editando</span>}
                      </h3>
                      <p className="text-xs text-slate-400">{s.address}</p>
                    </div>
                    
                    <div className="flex gap-2">
                       <button onClick={() => startEditSite(s)} className="text-slate-500 hover:text-blue-400 p-2 hover:bg-blue-900/20 rounded-lg transition" title="Editar">
                         <Pencil size={18}/>
                       </button>
                       <button onClick={() => initiateDeleteSite(s)} className="text-slate-500 hover:text-rose-500 p-2 hover:bg-rose-900/20 rounded-lg transition" title="Eliminar">
                         <Trash2 size={18}/>
                       </button>
                    </div>
                  </div>
                ))}
              </div>
           </div>
        )}
        
        {/* ADMINS TAB - Only Visible for Super Admin */}
        {activeTab === 'admins' && isSuperAdmin && (
           <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 animate-fadeIn">
              <h3 className="font-bold mb-6 text-white text-lg">Cuentas de Administrador</h3>
              
              <div className="flex flex-col md:flex-row gap-2 mb-8 bg-slate-950 p-6 rounded-xl border border-slate-800">
                <div className="flex-1 space-y-2">
                    <label className="text-xs font-bold uppercase text-slate-500 tracking-wide">Usuario</label>
                    <input type="text" placeholder="Nuevo Admin User" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-lg text-white focus:border-blue-500 outline-none" value={newAdminUser} onChange={(e)=>setNewAdminUser(e.target.value)}/>
                </div>
                <div className="flex-1 space-y-2">
                    <label className="text-xs font-bold uppercase text-slate-500 tracking-wide">Contraseña</label>
                    <input type="text" placeholder="Contraseña" className="w-full bg-slate-900 border border-slate-700 p-3 rounded-lg text-white focus:border-blue-500 outline-none" value={newAdminPass} onChange={(e)=>setNewAdminPass(e.target.value)}/>
                </div>
                <div className="flex items-end">
                    <button onClick={handleAddAdmin} className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-500 flex items-center justify-center font-bold shadow-lg transition"><Plus size={20}/></button>
                </div>
              </div>

              <div className="grid gap-4">
                  {admins.map(a => (
                    <div key={a.id} className="flex justify-between items-center p-5 border border-slate-800 rounded-xl hover:bg-slate-800/30 transition">
                        <div className="flex items-center gap-4">
                            <div className="bg-slate-800 p-3 rounded-full text-blue-500"><Shield size={20}/></div>
                            <div>
                                <h3 className="font-bold text-white">{a.username}</h3>
                                <p className="text-xs text-slate-500">Creado: {new Date(a.createdAt).toLocaleDateString()}</p>
                            </div>
                        </div>
                        <button onClick={() => initiateDeleteAdmin(a)} className="text-slate-500 hover:text-rose-500 p-2 hover:bg-rose-900/20 rounded-lg transition"><Trash2 size={20}/></button>
                    </div>
                  ))}
                  {admins.length === 0 && <p className="text-slate-500 italic text-center p-8">No hay admins adicionales configurados. Se usa solo la contraseña maestra.</p>}
              </div>
           </div>
        )}
        
        {activeTab === 'reports' && (
           <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 animate-fadeIn">
              <div className="flex items-center gap-4 mb-6"><label className="text-slate-400 font-bold">Mes:</label><input type="month" className="bg-slate-950 border border-slate-700 p-2 rounded text-white" value={reportMonth} onChange={(e)=>setReportMonth(e.target.value)}/></div>
              <table className="w-full text-sm text-left text-slate-300"><thead><tr className="bg-slate-950 text-slate-500 uppercase"><th>Trabajador</th><th>Días</th><th>Horas</th><th>Acción</th></tr></thead><tbody className="divide-y divide-slate-800">{generateMonthlyReport().map(r => (<tr key={r.workerId} className="hover:bg-slate-800/50"><td className="p-3 font-bold text-white">{r.workerName}</td><td className="p-3">{r.daysWorked}</td><td className="p-3 text-blue-400">{msToTime(r.netWorkMs)}</td><td className="p-3"><button onClick={() => handleDownloadPDF(r)} className="text-emerald-500 font-bold hover:underline">PDF</button></td></tr>))}</tbody></table>
           </div>
        )}

        {activeTab === 'config' && (
           <div className="bg-slate-900 p-8 rounded-xl border border-slate-800 max-w-md mx-auto animate-fadeIn">
              <h3 className="font-bold mb-6 text-white text-lg">Configuración General</h3>
              <div className="space-y-4">
                {isSuperAdmin && (
                  <div>
                    <label className="block text-xs font-bold mb-2 text-slate-500 uppercase">Contraseña Maestra (Legacy)</label>
                    <input type="text" className="w-full bg-slate-950 border border-slate-700 p-3 rounded-lg text-white" value={newAdminPassword} placeholder="Dejar vacío para no cambiar" onChange={(e)=>setNewAdminPassword(e.target.value)}/>
                    <p className="text-[10px] text-slate-500 mt-1">Esta contraseña funciona siempre, independientemente de los usuarios creados.</p>
                  </div>
                )}
                <div className="pt-4 border-t border-slate-800">
                  <label className="block text-xs font-bold mb-2 text-slate-500 uppercase">Google Sheet URL</label>
                  <input type="text" className="w-full bg-slate-950 border border-slate-700 p-3 rounded-lg text-white font-mono text-xs" value={config.googleSheetUrl} onChange={(e)=>setConfig({...config, googleSheetUrl: e.target.value})}/>
                </div>
                <button onClick={attemptSaveConfig} className="w-full bg-blue-600 text-white p-3 rounded-lg font-bold hover:bg-blue-500 mt-4">Guardar Cambios</button>
              </div>
           </div>
        )}

      </div>
    </div>
  );
};