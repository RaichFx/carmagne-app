
import React, { useState, useEffect } from 'react';
import { StorageService } from '../services/storageService';
import { Worker, Site, WorkLog, AppConfig, WorkMode, LogType, AdminUser, ToolRecord } from '../types';
import { 
  Users, MapPin, Download, Settings, FileText, 
  Trash2, Plus, Save, Lock, Database, ClipboardList, Calendar, X, UserPlus, Phone, Filter, Search, Clock, Shield, Pencil, Eye, EyeOff, Zap, Wrench, ChevronDown
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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'logs' | 'reports' | 'workers' | 'sites' | 'admins' | 'config' | 'tools'>('dashboard');
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [tools, setTools] = useState<ToolRecord[]>([]);
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
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'worker' | 'site' | 'admin' | 'tool', id: string, name: string } | null>(null);
  
  // Confirms
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

  // FILTERS
  const [filterWorker, setFilterWorker] = useState<string>('ALL');
  const [filterDate, setFilterDate] = useState<string>(''); 
  const [filterType, setFilterType] = useState<string>('ALL');
  
  // TOOL FILTERS
  const [filterToolWorker, setFilterToolWorker] = useState<string>('ALL');
  const [toolSearch, setToolSearch] = useState('');

  // WORKER SEARCH
  const [workerSearch, setWorkerSearch] = useState('');
  const [showPins, setShowPins] = useState(false); 
  
  const isSuperAdmin = currentUser === null;

  useEffect(() => {
    setLogs(StorageService.getLogs());
    setWorkers(StorageService.getWorkers());
    setSites(StorageService.getSites());
    setAdmins(StorageService.getAdmins());
    setTools(StorageService.getTools());
    
    const unsubscribeLogs = StorageService.subscribeToLogs(setLogs);
    const unsubscribeWorkers = StorageService.subscribeToWorkers(setWorkers);
    const unsubscribeSites = StorageService.subscribeToSites(setSites);
    const unsubscribeAdmins = StorageService.subscribeToAdmins(setAdmins);
    const unsubscribeTools = StorageService.subscribeToTools(setTools);

    return () => {
      unsubscribeLogs();
      unsubscribeWorkers();
      unsubscribeSites();
      unsubscribeAdmins();
      unsubscribeTools();
    };
  }, []);

  const handleExport = () => {
    const csv = StorageService.exportToCSV(logs);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Fichajes_CARMAGNE_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 13) return "Buenos días";
    if (hour >= 13 && hour < 21) return "Buenas tardes";
    return "Buenas noches";
  };

  const getFilteredLogs = () => {
    return logs.filter(log => {
      const matchWorker = filterWorker === 'ALL' || log.workerId === filterWorker;
      let matchDate = true;
      if (filterDate) {
         const [day, month, year] = log.dateStr.split('/');
         const [iYear, iMonth, iDay] = filterDate.split('-');
         matchDate = (day === iDay && month === iMonth && year === iYear);
      }
      const matchType = filterType === 'ALL' || 
                        (filterType === 'DESCANSO' ? (log.type === LogType.INICIO_DESCANSO || log.type === LogType.FIN_DESCANSO) : log.type === filterType);
      
      return matchWorker && matchDate && matchType;
    });
  };

  const getFilteredTools = () => {
    return tools.filter(tool => {
      const matchWorker = filterToolWorker === 'ALL' || tool.workerId === filterToolWorker;
      const matchSearch = tool.toolName.toLowerCase().includes(toolSearch.toLowerCase()) || 
                          tool.brand.toLowerCase().includes(toolSearch.toLowerCase()) ||
                          tool.workerName.toLowerCase().includes(toolSearch.toLowerCase());
      return matchWorker && matchSearch;
    });
  };

  const getWeeklyHours = () => {
    const curr = new Date();
    const day = curr.getDay();
    const diff = curr.getDate() - day + (day === 0 ? -6 : 1);
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

  const confirmDelete = () => { 
      if (!deleteTarget) return; 
      if (deleteTarget.type === 'worker') StorageService.deleteWorker(deleteTarget.id); 
      else if (deleteTarget.type === 'site') StorageService.deleteSite(deleteTarget.id); 
      else if (deleteTarget.type === 'admin') StorageService.deleteAdmin(deleteTarget.id);
      else if (deleteTarget.type === 'tool') StorageService.deleteTool(deleteTarget.id);
      setDeleteTarget(null); 
  };

  const handleSaveSite = () => { 
      if (!newSiteName) return;
      if (editingSiteId) {
        const siteToUpdate = sites.find(s => s.id === editingSiteId);
        if (siteToUpdate) {
            StorageService.updateSite({ ...siteToUpdate, name: newSiteName, address: newSiteAddress });
        }
        setEditingSiteId(null);
      } else {
        const newSite: Site = { id: `S${Math.floor(Math.random()*10000)}`, name: newSiteName, address: newSiteAddress, active: true }; 
        StorageService.saveSites([...sites, newSite]);
      }
      setNewSiteName(''); setNewSiteAddress(''); 
  };

  const attemptSaveConfig = () => {
    if (newAdminPassword) setShowPasswordConfirm(true);
    else executeSaveConfig();
  };

  const executeSaveConfig = () => {
    const updatedConfig = { ...config };
    if (newAdminPassword) updatedConfig.adminPassword = newAdminPassword;
    StorageService.saveConfig(updatedConfig);
    setConfig(updatedConfig);
    setNewAdminPassword('');
    setShowPasswordConfirm(false);
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
  const COLORS = ['#3b82f6', '#10b981', '#94a3b8'];

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: FileText }, 
    { id: 'logs', label: 'Registros', icon: Database }, 
    { id: 'reports', label: 'Informes', icon: ClipboardList }, 
    { id: 'workers', label: 'Personal', icon: Users }, 
    { id: 'tools', label: 'Equipos', icon: Wrench },
    { id: 'sites', label: 'Obras', icon: MapPin },
    ...(isSuperAdmin ? [{ id: 'admins', label: 'Admins', icon: Shield }] : []),
    { id: 'config', label: 'Config', icon: Settings }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20 font-sans">
      <ConfirmationModal isOpen={deleteTarget !== null} title="Confirmar Eliminación" message={`¿Estás seguro de que deseas eliminar ${deleteTarget?.name}? Esta acción no se puede deshacer.`} isDestructive={true} onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete} />
      <ConfirmationModal isOpen={showPasswordConfirm} title="Contraseña Maestra" message="Vas a cambiar la contraseña global. Asegúrate de guardarla en un lugar seguro." confirmText="Cambiar" isDestructive={true} onCancel={() => setShowPasswordConfirm(false)} onConfirm={executeSaveConfig} />

      <header className="bg-slate-900 p-4 sticky top-0 z-10 shadow-md flex justify-between items-center border-b border-slate-800">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-black text-white tracking-tight">CARMAGNE ADMIN</h1>
          <div className="bg-gradient-to-br from-blue-500 to-blue-700 text-white p-1.5 rounded-lg shadow-lg shadow-blue-500/30"><Zap size={20} className="fill-white/20" /></div>
        </div>
        <div className="flex items-center gap-4">
           <div className="hidden md:flex items-center gap-3 bg-slate-950 pr-4 pl-1 py-1 rounded-full border border-slate-800">
              <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg">{currentUser ? currentUser.username.substring(0,2).toUpperCase() : 'SA'}</div>
              <span className="text-sm font-medium text-slate-300">{currentUser ? currentUser.username : 'Super Admin'}</span>
           </div>
           <button onClick={onBack} className="text-xs bg-slate-800 text-slate-300 border border-slate-700 px-4 py-2 rounded hover:bg-slate-700 transition">Salir</button>
        </div>
      </header>

      <div className="flex overflow-x-auto bg-slate-900 border-b border-slate-800 scrollbar-hide">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex-1 min-w-[100px] py-4 flex flex-col items-center gap-1 text-xs font-bold transition-all ${activeTab === tab.id ? 'text-blue-500 border-b-2 border-blue-500 bg-slate-800' : 'text-slate-500 hover:text-slate-300'}`}>
            <tab.icon size={18} />{tab.label}
          </button>
        ))}
      </div>

      <div className="p-6 max-w-7xl mx-auto">
        
        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-fadeIn">
             <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-800 pb-6">
                <div>
                   <h2 className="text-3xl font-black text-white tracking-tight flex items-center gap-2">{getGreeting()}, <span className="text-blue-500">{currentUser ? currentUser.username : 'Super Admin'}</span></h2>
                   <p className="text-slate-400 mt-1 capitalize">{new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                </div>
                <div className="hidden md:block bg-slate-900 px-4 py-2 rounded-xl border border-slate-800"><span className="font-mono font-bold text-slate-300">{new Date().toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit'})}</span></div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                 <div className="bg-slate-900 p-6 rounded-xl border border-slate-800"><h3 className="text-slate-500 text-[10px] uppercase font-black tracking-widest">Total Registros</h3><p className="text-4xl font-black text-white mt-2">{logs.length}</p></div>
                 <div className="bg-slate-900 p-6 rounded-xl border border-slate-800"><h3 className="text-slate-500 text-[10px] uppercase font-black tracking-widest">Obras</h3><p className="text-4xl font-black text-blue-500 mt-2">{sites.filter(s => s.active).length}</p></div>
                 <div className="bg-slate-900 p-6 rounded-xl border border-slate-800"><h3 className="text-slate-500 text-[10px] uppercase font-black tracking-widest">Personal</h3><p className="text-4xl font-black text-emerald-500 mt-2">{workers.filter(w => w.active).length}</p></div>
                 <div className="bg-slate-900 p-6 rounded-xl border border-slate-800"><h3 className="text-slate-500 text-[10px] uppercase font-black tracking-widest">Horas Semana</h3><p className="text-4xl font-black text-amber-500 mt-2">{getWeeklyHours()}h</p></div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 lg:col-span-2"><h3 className="font-black text-white text-sm uppercase tracking-widest mb-6">Actividad General</h3><div className="h-64"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={[{ name: 'Entradas', value: logs.filter(l => l.type === LogType.ENTRADA).length }, { name: 'Salidas', value: logs.filter(l => l.type === LogType.SALIDA).length }]} cx="50%" cy="50%" outerRadius={80} fill="#8884d8" dataKey="value" label>{[0,1].map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index]} />)}</Pie><RechartsTooltip /></PieChart></ResponsiveContainer></div></div>
                <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 flex flex-col justify-center gap-4"><h3 className="font-black text-white text-sm uppercase tracking-widest mb-2">Acciones Rápidas</h3><button onClick={handleExport} className="w-full bg-emerald-600 text-white p-4 rounded-xl font-black flex items-center justify-center gap-2 hover:bg-emerald-500 transition shadow-lg"><Download size={20}/> Exportar CSV</button><p className="text-[10px] text-slate-500 text-center font-bold">Descarga el historial completo en formato compatible con Excel.</p></div>
             </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
               <div className="space-y-2"><label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><Users size={14} /> Trabajador</label><select className="w-full bg-slate-950 border border-slate-700 text-white p-3 rounded-lg appearance-none focus:border-blue-500 outline-none" value={filterWorker} onChange={(e) => setFilterWorker(e.target.value)}><option value="ALL">Todos</option>{workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
               <div className="space-y-2"><label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><Calendar size={14} /> Fecha</label><input type="date" className="w-full bg-slate-950 border border-slate-700 text-white p-3 rounded-lg focus:border-blue-500 outline-none [color-scheme:dark]" value={filterDate} onChange={(e) => setFilterDate(e.target.value)}/></div>
               <div className="space-y-2"><label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><Filter size={14} /> Tipo</label><select className="w-full bg-slate-950 border border-slate-700 text-white p-3 rounded-lg appearance-none focus:border-blue-500 outline-none" value={filterType} onChange={(e) => setFilterType(e.target.value)}><option value="ALL">Todas las acciones</option><option value={LogType.ENTRADA}>Entrada</option><option value={LogType.SALIDA}>Salida</option><option value="DESCANSO">Descansos</option></select></div>
            </div>
            <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800 shadow-xl overflow-x-auto"><table className="w-full text-sm text-left text-slate-300"><thead className="bg-slate-950 text-slate-500 uppercase font-black text-[10px] border-b border-slate-800"><tr><th className="p-4">Fecha/Hora</th><th className="p-4">Trabajador</th><th className="p-4">Obra</th><th className="p-4">Acción</th><th className="p-4">Ubicación</th></tr></thead><tbody className="divide-y divide-slate-800">{getFilteredLogs().map(log => (<tr key={log.id} className="hover:bg-slate-800/50"><td className="p-4"><div>{log.dateStr}</div><div className="text-[10px] text-slate-500">{log.timeStr}</div></td><td className="p-4 font-black text-white">{log.workerName}</td><td className="p-4 text-slate-400">{log.siteName}</td><td className="p-4"><span className={`px-2 py-1 rounded-[4px] text-[10px] font-black uppercase tracking-widest border ${log.type === LogType.ENTRADA ? 'bg-emerald-950/30 text-emerald-400 border-emerald-900/50' : 'bg-rose-950/30 text-rose-400 border-rose-900/50'}`}>{log.type}</span></td><td className="p-4">{log.location.latitude !== 0 ? (<a href={`https://www.google.com/maps?q=${log.location.latitude},${log.location.longitude}`} target="_blank" className="text-blue-400 flex items-center gap-1 text-[10px] font-black uppercase"><MapPin size={12}/> Ver GPS</a>) : <span className="text-xs text-slate-600">Sistema</span>}</td></tr>))}</tbody></table></div>
          </div>
        )}

        {activeTab === 'workers' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex flex-col md:flex-row gap-4 bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-xl"><input type="text" placeholder="Nombre completo" className="flex-1 bg-slate-950 border border-slate-700 p-3 rounded-lg text-white" value={newWorkerName} onChange={(e) => setNewWorkerName(e.target.value)}/><input type="text" placeholder="PIN" className="w-32 bg-slate-950 border border-slate-700 p-3 rounded-lg text-white text-center tracking-widest" value={newWorkerPin} maxLength={4} onChange={(e) => setNewWorkerPin(e.target.value.replace(/\D/g,''))}/><button onClick={handleAddWorker} className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-500 font-black flex items-center justify-center gap-2 uppercase text-xs tracking-widest transition shadow-lg"><Plus size={18} /> Añadir</button></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{workers.map(w => (<div key={w.id} className="bg-slate-900 p-5 rounded-xl border border-slate-800 flex justify-between items-center group"><div className="flex items-center gap-4"><div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-blue-500"><Users size={20}/></div><div><h3 className="font-black text-white">{w.name}</h3><p className="text-[10px] text-slate-500 font-black tracking-widest uppercase">PIN: {showPins ? w.pin : '****'}</p></div></div><button onClick={() => setDeleteTarget({ type: 'worker', id: w.id, name: w.name })} className="p-2 text-slate-600 hover:text-rose-500 hover:bg-rose-900/20 rounded-lg"><Trash2 size={18}/></button></div>))}</div>
            <button onClick={() => setShowPins(!showPins)} className="text-slate-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 mx-auto">{showPins ? <EyeOff size={14}/> : <Eye size={14}/>} {showPins ? 'Ocultar PINs' : 'Ver PINs'}</button>
          </div>
        )}

        {activeTab === 'tools' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-xl grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
               <div className="space-y-2">
                 <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><Users size={14} /> Ver Herramientas de:</label>
                 <select className="w-full bg-slate-950 border border-slate-700 text-white p-3 rounded-lg appearance-none focus:border-blue-500 outline-none" value={filterToolWorker} onChange={(e) => setFilterToolWorker(e.target.value)}>
                    <option value="ALL">Toda la plantilla</option>
                    {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                 </select>
               </div>
               <div className="relative">
                  <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input type="text" placeholder="Buscar equipo por nombre o marca..." className="w-full bg-slate-950 border border-slate-700 pl-12 p-3 rounded-lg text-white outline-none focus:border-blue-500" value={toolSearch} onChange={(e) => setToolSearch(e.target.value)}/>
               </div>
            </div>

            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
               <table className="w-full text-sm text-left">
                 <thead className="bg-slate-950 text-slate-500 uppercase font-black text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="p-4">Herramienta</th>
                      <th className="p-4">Marca/Modelo</th>
                      <th className="p-4">Responsable</th>
                      <th className="p-4 text-center">Acción</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-800">
                    {getFilteredTools().map(tool => (
                      <tr key={tool.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="p-4">
                           <div className="flex items-center gap-3">
                              <div className="bg-slate-950 p-2 rounded-lg text-amber-500"><Wrench size={16}/></div>
                              <span className="font-black text-white uppercase tracking-tight">{tool.toolName}</span>
                           </div>
                        </td>
                        <td className="p-4">
                           <span className="text-xs font-bold text-slate-400 uppercase">{tool.brand}</span>
                           <span className="text-[10px] text-slate-600 ml-2">{tool.model || '-'}</span>
                        </td>
                        <td className="p-4">
                           <span className="text-xs font-black text-blue-400 uppercase tracking-widest">{tool.workerName}</span>
                        </td>
                        <td className="p-4 text-center">
                           <button onClick={() => setDeleteTarget({ type: 'tool', id: tool.id, name: tool.toolName })} className="p-2 text-slate-600 hover:text-rose-500 transition-colors">
                              <Trash2 size={18} />
                           </button>
                        </td>
                      </tr>
                    ))}
                    {getFilteredTools().length === 0 && (
                      <tr><td colSpan={4} className="p-10 text-center text-slate-600 italic">No se han encontrado herramientas con los criterios seleccionados.</td></tr>
                    )}
                 </tbody>
               </table>
            </div>
          </div>
        )}

        {activeTab === 'reports' && (
           <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 animate-fadeIn">
              <div className="flex items-center gap-4 mb-8"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Seleccionar Mes:</label><input type="month" className="bg-slate-950 border border-slate-700 p-2 rounded text-white [color-scheme:dark]" value={reportMonth} onChange={(e)=>setReportMonth(e.target.value)}/></div>
              <div className="overflow-x-auto"><table className="w-full text-sm text-left text-slate-300"><thead className="bg-slate-950 text-slate-500 uppercase font-black text-[10px]"><tr><th className="p-4">Trabajador</th><th className="p-4 text-center">Días</th><th className="p-4 text-center">Horas Netas</th><th className="p-4 text-right">Reporte</th></tr></thead><tbody className="divide-y divide-slate-800">{generateMonthlyReport().map(r => (<tr key={r.workerId} className="hover:bg-slate-800/50"><td className="p-4 font-black text-white">{r.workerName}</td><td className="p-4 text-center font-mono">{r.daysWorked}</td><td className="p-4 text-center text-blue-400 font-mono">{msToTime(r.netWorkMs)}</td><td className="p-4 text-right"><button onClick={() => handleDownloadPDF(r)} className="text-emerald-500 font-black text-[10px] uppercase tracking-widest hover:underline flex items-center gap-1 ml-auto"><Download size={14}/> PDF</button></td></tr>))}</tbody></table></div>
           </div>
        )}

        {activeTab === 'sites' && (
           <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 space-y-6 animate-fadeIn">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><input type="text" placeholder="Nombre Obra" className="bg-slate-950 border border-slate-700 p-3 rounded-lg text-white" value={newSiteName} onChange={(e)=>setNewSiteName(e.target.value)}/><input type="text" placeholder="Dirección" className="bg-slate-950 border border-slate-700 p-3 rounded-lg text-white" value={newSiteAddress} onChange={(e)=>setNewSiteAddress(e.target.value)}/></div><button onClick={handleSaveSite} className="w-full bg-blue-600 text-white p-3 rounded-lg font-black uppercase text-xs tracking-widest">{editingSiteId ? 'Guardar Cambios' : 'Añadir Obra'}</button>
              <div className="grid gap-3">{sites.map(s => (<div key={s.id} className="p-4 bg-slate-950 border border-slate-800 rounded-xl flex justify-between items-center"><div><h3 className="font-black text-white text-sm uppercase">{s.name}</h3><p className="text-[10px] text-slate-500 font-bold">{s.address}</p></div><div className="flex gap-1"><button onClick={() => {setEditingSiteId(s.id); setNewSiteName(s.name); setNewSiteAddress(s.address);}} className="p-2 text-slate-500 hover:text-blue-500"><Pencil size={18}/></button><button onClick={() => setDeleteTarget({ type: 'site', id: s.id, name: s.name })} className="p-2 text-slate-600 hover:text-rose-500"><Trash2 size={18}/></button></div></div>))}</div>
           </div>
        )}

        {activeTab === 'config' && (
           <div className="bg-slate-900 p-8 rounded-xl border border-slate-800 max-w-md mx-auto animate-fadeIn"><h3 className="font-black text-white text-sm uppercase tracking-widest mb-6">Configuración Admin</h3><div className="space-y-6">{isSuperAdmin && (<div className="space-y-2"><label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">Contraseña Maestra</label><input type="text" className="w-full bg-slate-950 border border-slate-700 p-3 rounded-lg text-white" value={newAdminPassword} placeholder="Nueva contraseña" onChange={(e)=>setNewAdminPassword(e.target.value)}/></div>)}<div className="space-y-2"><label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">Google Sheet URL</label><input type="text" className="w-full bg-slate-950 border border-slate-700 p-3 rounded-lg text-white font-mono text-xs" value={config.googleSheetUrl} onChange={(e)=>setConfig({...config, googleSheetUrl: e.target.value})}/></div><button onClick={attemptSaveConfig} className="w-full bg-blue-600 text-white p-4 rounded-xl font-black uppercase text-xs tracking-widest shadow-lg">Guardar Configuración</button></div></div>
        )}

      </div>
    </div>
  );
};
