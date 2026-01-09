import React, { useState, useEffect, useMemo } from 'react';
import { StorageService, ELECTRICAL_TOOLS_LIST, ELECTRICAL_BRANDS_LIST } from '../services/storageService';
import { Worker, Site, WorkLog, AppConfig, WorkMode, LogType, AdminUser, ToolRecord } from '../types';
import { 
  Users, MapPin, Download, Settings, FileText, 
  Trash2, Plus, Save, Lock, Database, ClipboardList, Calendar, X, UserPlus, Phone, Filter, Search, Clock, Shield, Pencil, Eye, EyeOff, Zap, Wrench, ChevronDown, ArrowLeft, BarChart3, LogOut, CalendarDays, CheckCircle2, AlertCircle, Map as MapIcon, ExternalLink, Coffee, Package, KeyRound, ChevronRight, ListFilter, RotateCcw
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ConfirmationModal } from './ConfirmationModal';

interface AdminPanelProps {
  onBack: () => void;
  currentUser: AdminUser | null; // Null means "Super Admin" (Master Password login)
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const AppLogo = ({ className, size = "md" }: { className?: string, size?: "sm" | "md" | "lg" }) => {
  const iconSize = size === "sm" ? 28 : size === "md" ? 64 : 140;
  
  return (
    <div className={`relative flex items-center justify-center ${className} text-blue-500`}>
      <Zap 
        size={iconSize} 
        className="drop-shadow-[0_0_15px_rgba(59,130,246,0.6)] fill-blue-500/20" 
        strokeWidth={2.5}
      />
    </div>
  );
};

export const AdminPanel: React.FC<AdminPanelProps> = ({ onBack, currentUser }) => {
  const isSuperAdmin = currentUser === null;
  const [activeTab, setActiveTab] = useState<'dashboard' | 'workers' | 'sites' | 'logs' | 'tools' | 'admins' | 'settings'>('dashboard');
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [tools, setTools] = useState<ToolRecord[]>([]);
  const [config, setConfig] = useState<AppConfig>(StorageService.getConfig());

  // Search & Filter states
  const [workerSearchQuery, setWorkerSearchQuery] = useState('');
  const [siteSearchQuery, setSiteSearchQuery] = useState('');
  const [toolSearchQuery, setToolSearchQuery] = useState('');
  
  // Log Filters
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [logFilterWorker, setLogFilterWorker] = useState('');
  const [logFilterSite, setLogFilterSite] = useState('');
  const [logFilterType, setLogFilterType] = useState('');
  const [logFilterDate, setLogFilterDate] = useState('');
  const [showLogFilters, setShowLogFilters] = useState(false);

  // Logout confirmation state
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  // Modals States
  const [isSiteModalOpen, setIsSiteModalOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [siteForm, setSiteForm] = useState({ name: '', address: '', active: true, lat: '', lng: '' });

  const [isToolModalOpen, setIsToolModalOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<ToolRecord | null>(null);
  const [toolForm, setToolForm] = useState({ 
    toolName: '', 
    brand: '', 
    model: '', 
    workerId: '' 
  });

  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [adminForm, setAdminForm] = useState({ username: '', password: '' });

  const [reportModal, setReportModal] = useState<{
    isOpen: boolean;
    worker: Worker | null;
    type: 'WEEK' | 'MONTH';
    selectedDate: string;
    selectedMonth: number;
  }>({
    isOpen: false,
    worker: null,
    type: 'MONTH',
    selectedDate: new Date().toISOString().split('T')[0],
    selectedMonth: new Date().getMonth()
  });

  useEffect(() => {
    setWorkers(StorageService.getWorkers());
    setSites(StorageService.getSites());
    setLogs(StorageService.getLogs());
    setAdmins(StorageService.getAdmins());
    setTools(StorageService.getTools());

    const unsubWorkers = StorageService.subscribeToWorkers(setWorkers);
    const unsubSites = StorageService.subscribeToSites(setSites);
    const unsubLogs = StorageService.subscribeToLogs(setLogs);
    const unsubAdmins = StorageService.subscribeToAdmins(setAdmins);
    const unsubTools = StorageService.subscribeToTools(setTools);

    return () => {
      unsubWorkers(); unsubSites(); unsubLogs(); unsubAdmins(); unsubTools();
    };
  }, []);

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.text("Reporte de Actividad Filtrado - CARMAGNE INSTAL SL", 14, 15);
    const tableData = filteredLogs.map(l => [l.dateStr, l.timeStr, l.workerName, l.siteName, l.type, l.workMode || 'HORAS']);
    autoTable(doc, {
      head: [['Fecha', 'Hora', 'Trabajador', 'Obra', 'Tipo', 'Modo']],
      body: tableData,
      startY: 20
    });
    doc.save(`reporte_actividad_${new Date().getTime()}.pdf`);
  };

  const handleGenerateWorkerReport = () => {
    const { worker, type, selectedDate, selectedMonth } = reportModal;
    if (!worker) return;

    const doc = new jsPDF();
    let workerLogsList = logs.filter(l => l.workerId === worker.id);
    let periodLabel = '';

    if (type === 'WEEK') {
      const pickedDate = new Date(selectedDate);
      const day = pickedDate.getDay();
      const diffToMonday = pickedDate.getDate() - day + (day === 0 ? -6 : 1);
      const startOfWeek = new Date(pickedDate.setDate(diffToMonday));
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      workerLogsList = workerLogsList.filter(l => l.timestamp >= startOfWeek.getTime() && l.timestamp <= endOfWeek.getTime());
      periodLabel = `Semana del ${startOfWeek.toLocaleDateString()} al ${endOfWeek.toLocaleDateString()}`;
    } else {
      const year = new Date().getFullYear();
      const startOfMonth = new Date(year, selectedMonth, 1);
      const endOfMonth = new Date(year, selectedMonth + 1, 0, 23, 59, 59, 999);

      workerLogsList = workerLogsList.filter(l => l.timestamp >= startOfMonth.getTime() && l.timestamp <= endOfMonth.getTime());
      periodLabel = `Mes de ${MONTH_NAMES[selectedMonth]} ${year}`;
    }

    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text("CARMAGNE INSTAL SL 2024", 105, 15, { align: 'center' });
    
    doc.setFontSize(12);
    doc.text(`Informe de Actividad: ${worker.name}`, 105, 25, { align: 'center' });
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`${periodLabel} | DNI: ${worker.dni || 'N/A'}`, 105, 32, { align: 'center' });

    const tableData = workerLogsList.map(l => [
      l.dateStr, 
      l.timeStr, 
      l.type, 
      l.siteName, 
      l.workMode || 'HORAS', 
      l.workReport || '-'
    ]);

    autoTable(doc, {
      startY: 40,
      head: [['Fecha', 'Hora', 'Acción', 'Obra', 'Modo', 'Reporte']],
      body: tableData,
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      styles: { fontSize: 8, cellPadding: 3 }
    });

    doc.save(`Informe_${worker.name.replace(/\s+/g, '_')}_${type}.pdf`);
    setReportModal({ ...reportModal, isOpen: false });
  };

  const handleOpenSiteModal = (site?: Site) => {
    if (site) {
      setEditingSite(site);
      setSiteForm({
        name: site.name,
        address: site.address,
        active: site.active,
        lat: site.coordinates?.latitude.toString() || '',
        lng: site.coordinates?.longitude.toString() || ''
      });
    } else {
      setEditingSite(null);
      setSiteForm({ name: '', address: '', active: true, lat: '', lng: '' });
    }
    setIsSiteModalOpen(true);
  };

  const handleSaveSite = async () => {
    if (!siteForm.name || !siteForm.address) return;
    const siteData: Site = {
      id: editingSite ? editingSite.id : `S-${Date.now()}`,
      name: siteForm.name,
      address: siteForm.address,
      active: siteForm.active,
      coordinates: (siteForm.lat && siteForm.lng) ? {
        latitude: parseFloat(siteForm.lat),
        longitude: parseFloat(siteForm.lng)
      } : editingSite?.coordinates
    };

    if (editingSite) {
      await StorageService.updateSite(siteData);
    } else {
      const currentSites = StorageService.getSites();
      await StorageService.saveSites([...currentSites, siteData]);
    }
    setIsSiteModalOpen(false);
  };

  const handleOpenToolModal = (tool?: ToolRecord) => {
    if (tool) {
      setEditingTool(tool);
      setToolForm({
        toolName: tool.toolName,
        brand: tool.brand,
        model: tool.model,
        workerId: tool.workerId
      });
    } else {
      setEditingTool(null);
      setToolForm({ toolName: '', brand: '', model: '', workerId: '' });
    }
    setIsToolModalOpen(true);
  };

  const handleSaveTool = async () => {
    if (!toolForm.toolName || !toolForm.workerId) return;
    const worker = workers.find(w => w.id === toolForm.workerId);
    if (!worker) return;
    const toolData: ToolRecord = {
      id: editingTool ? editingTool.id : `T-${Date.now()}`,
      workerId: worker.id,
      workerName: worker.name,
      toolName: toolForm.toolName,
      brand: toolForm.brand,
      model: toolForm.model,
      timestamp: editingTool ? editingTool.timestamp : Date.now(),
      dateStr: editingTool ? editingTool.dateStr : new Date().toLocaleDateString('es-ES'),
      timeStr: editingTool ? editingTool.timeStr : new Date().toLocaleTimeString('es-ES'),
    };
    await StorageService.addTool(toolData); 
    setIsToolModalOpen(false);
  };

  const handleSaveAdmin = async () => {
    if (!adminForm.username || !adminForm.password) return;
    const newAdmin: AdminUser = {
      id: `ADM-${Date.now()}`,
      username: adminForm.username,
      password: adminForm.password,
      active: true,
      createdAt: Date.now()
    };
    await StorageService.addAdmin(newAdmin);
    setAdminForm({ username: '', password: '' });
    setIsAdminModalOpen(false);
  };

  const filteredWorkers = workers.filter(w => 
    w.name.toLowerCase().includes(workerSearchQuery.toLowerCase()) || 
    (w.dni || '').toLowerCase().includes(workerSearchQuery.toLowerCase())
  );

  const filteredSites = sites.filter(s => 
    s.name.toLowerCase().includes(siteSearchQuery.toLowerCase()) || 
    s.address.toLowerCase().includes(siteSearchQuery.toLowerCase())
  );

  const filteredTools = tools.filter(t => 
    t.toolName.toLowerCase().includes(toolSearchQuery.toLowerCase()) || 
    t.workerName.toLowerCase().includes(toolSearchQuery.toLowerCase()) ||
    t.brand.toLowerCase().includes(toolSearchQuery.toLowerCase())
  );

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesSearch = !logSearchQuery || 
        log.workerName.toLowerCase().includes(logSearchQuery.toLowerCase()) ||
        log.siteName.toLowerCase().includes(logSearchQuery.toLowerCase()) ||
        (log.workReport || '').toLowerCase().includes(logSearchQuery.toLowerCase());
        
      const matchesWorker = !logFilterWorker || log.workerId === logFilterWorker;
      const matchesSite = !logFilterSite || log.siteId === logFilterSite;
      const matchesType = !logFilterType || log.type === logFilterType;
      
      let matchesDate = true;
      if (logFilterDate) {
        const filterDateStr = new Date(logFilterDate).toLocaleDateString('es-ES');
        matchesDate = log.dateStr === filterDateStr;
      }
      return matchesSearch && matchesWorker && matchesSite && matchesType && matchesDate;
    });
  }, [logs, logSearchQuery, logFilterWorker, logFilterSite, logFilterType, logFilterDate]);

  const sidebarItems = useMemo(() => {
    const baseItems = [
      { id: 'dashboard', icon: BarChart3, label: 'Panel', color: 'blue' },
      { id: 'workers', icon: Users, label: 'Personal', color: 'indigo' },
      { id: 'sites', icon: MapPin, label: 'Obras', color: 'emerald' },
      { id: 'logs', icon: ClipboardList, label: 'Registros', color: 'amber' },
      { id: 'tools', icon: Wrench, label: 'Herramientas', color: 'orange' },
    ];
    
    if (isSuperAdmin) {
      baseItems.push(
        { id: 'admins', icon: Shield, label: 'Admins', color: 'violet' },
        { id: 'settings', icon: Settings, label: 'Ajustes', color: 'slate' }
      );
    }
    
    return baseItems;
  }, [isSuperAdmin]);

  const resetLogFilters = () => {
    setLogSearchQuery('');
    setLogFilterWorker('');
    setLogFilterSite('');
    setLogFilterType('');
    setLogFilterDate('');
  };

  const renderDashboard = () => {
    const stats = {
      totalWorkers: workers.length,
      activeSites: sites.filter(s => s.active).length,
      todayLogs: logs.filter(l => l.dateStr === new Date().toLocaleDateString('es-ES')).length,
    };

    const quickActions = sidebarItems.filter(item => item.id !== 'dashboard');

    return (
      <div className="space-y-6 animate-fadeIn pb-20 md:pb-0">
        {/* Stats Cards - Compact for mobile */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex flex-col justify-center">
            <Users className="text-blue-500 mb-1" size={24} />
            <h4 className="text-xl font-black text-white">{stats.totalWorkers}</h4>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Trabajadores</p>
          </div>
          <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex flex-col justify-center">
            <MapPin className="text-emerald-500 mb-1" size={24} />
            <h4 className="text-xl font-black text-white">{stats.activeSites}</h4>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Obras Activas</p>
          </div>
          <div className="col-span-2 md:col-span-1 bg-slate-900 p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
            <div>
               <Zap className="text-amber-500 mb-1" size={24} />
               <h4 className="text-xl font-black text-white">{stats.todayLogs}</h4>
               <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Fichajes Hoy</p>
            </div>
            <div className="md:hidden">
               <Clock size={32} className="text-slate-800" />
            </div>
          </div>
        </div>

        {/* MOBILE QUICK ACCESS GRID */}
        <div className="md:hidden space-y-3">
           <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Acceso Directo</h3>
           <div className="grid grid-cols-2 gap-3">
              {quickActions.map(action => (
                <button 
                  key={action.id}
                  onClick={() => setActiveTab(action.id as any)}
                  className="bg-slate-900 border border-slate-800 p-4 rounded-3xl flex flex-col gap-3 active:scale-95 transition-all text-left group"
                >
                   <div className={`w-10 h-10 rounded-2xl bg-${action.color}-500/10 flex items-center justify-center text-${action.color}-500 border border-${action.color}-500/20`}>
                      <action.icon size={20} />
                   </div>
                   <div className="flex justify-between items-end">
                      <span className="text-xs font-black text-white uppercase tracking-tighter">{action.label}</span>
                      <ChevronRight size={14} className="text-slate-700 group-active:text-white" />
                   </div>
                </button>
              ))}
           </div>
        </div>
        
        {/* Weekly Chart */}
        <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 h-[280px]">
           <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Actividad Semanal</h3>
           <ResponsiveContainer width="100%" height="100%">
              <BarChart data={logs.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="timeStr" stroke="#64748b" fontSize={10} />
                <YAxis stroke="#64748b" fontSize={10} />
                <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b' }} />
                <Bar dataKey="timestamp" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
           </ResponsiveContainer>
        </div>
      </div>
    );
  };

  const renderLogs = () => {
    const isFiltered = logSearchQuery || logFilterWorker || logFilterSite || logFilterType || logFilterDate;
    
    return (
      <div className="space-y-4 animate-fadeIn pb-20 md:pb-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-xl font-black text-white uppercase tracking-tighter">Registros de Actividad</h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{filteredLogs.length} eventos encontrados</p>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <button 
              onClick={() => setShowLogFilters(!showLogFilters)}
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${showLogFilters ? 'bg-amber-600 text-white shadow-lg' : 'bg-slate-900 text-slate-500 border border-slate-800'}`}
            >
              <ListFilter size={16} /> {showLogFilters ? 'Ocultar Filtros' : 'Filtros'}
            </button>
            <button onClick={handleExportPDF} className="flex-1 md:flex-none bg-emerald-600/10 text-emerald-500 px-4 py-3 rounded-xl border border-emerald-500/20 text-[10px] font-black uppercase flex items-center justify-center gap-2 hover:bg-emerald-600 hover:text-white transition">
              <Download size={18} /> Exportar
            </button>
          </div>
        </div>

        {/* Global Search Bar */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por trabajador, obra o reporte..." 
            className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-4 pl-12 pr-4 text-xs text-white focus:border-blue-500 outline-none shadow-inner"
            value={logSearchQuery}
            onChange={(e) => setLogSearchQuery(e.target.value)}
          />
          {logSearchQuery && (
            <button 
              onClick={() => setLogSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Advanced Filters Section */}
        {showLogFilters && (
          <div className="bg-slate-900/40 p-5 rounded-3xl border border-slate-800 space-y-4 animate-fadeIn">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Trabajador</label>
                <div className="relative">
                  <select 
                    value={logFilterWorker} 
                    onChange={(e) => setLogFilterWorker(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-3 pr-8 text-xs text-white outline-none focus:border-blue-500 appearance-none"
                  >
                    <option value="">Todos los trabajadores</option>
                    {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={14} />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Obra / Proyecto</label>
                <div className="relative">
                  <select 
                    value={logFilterSite} 
                    onChange={(e) => setLogFilterSite(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-3 pr-8 text-xs text-white outline-none focus:border-blue-500 appearance-none"
                  >
                    <option value="">Todas las obras</option>
                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={14} />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Tipo de Acción</label>
                <div className="relative">
                  <select 
                    value={logFilterType} 
                    onChange={(e) => setLogFilterType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-3 pr-8 text-xs text-white outline-none focus:border-blue-500 appearance-none"
                  >
                    <option value="">Todas las acciones</option>
                    {Object.values(LogType).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={14} />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Fecha específica</label>
                <div className="relative">
                  <input 
                    type="date" 
                    value={logFilterDate} 
                    onChange={(e) => setLogFilterDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-xs text-white outline-none focus:border-blue-500 [color-scheme:dark]"
                  />
                </div>
              </div>
            </div>
            {isFiltered && (
              <div className="flex justify-end">
                <button 
                  onClick={resetLogFilters}
                  className="flex items-center gap-1.5 text-rose-500 text-[10px] font-black uppercase hover:text-rose-400 transition"
                >
                  <RotateCcw size={14} /> Limpiar Filtros
                </button>
              </div>
            )}
          </div>
        )}

        {/* Desktop Logs Table */}
        <div className="hidden md:block overflow-hidden bg-slate-900/30 rounded-3xl border border-slate-900">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500 uppercase font-black border-b border-slate-800 bg-slate-900/50">
              <tr>
                <th className="p-4">Fecha/Hora</th>
                <th className="p-4">Trabajador</th>
                <th className="p-4">Obra</th>
                <th className="p-4">Acción</th>
                <th className="p-4">Reporte / Modo</th>
                <th className="p-4">Ubicación</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {filteredLogs.map(log => (
                <tr key={log.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="p-4 whitespace-nowrap">
                    <div className="font-bold text-white">{log.dateStr}</div>
                    <div className="text-[10px] text-slate-500">{log.timeStr}</div>
                  </td>
                  <td className="p-4 whitespace-nowrap">
                    <div className="font-bold text-blue-400">{log.workerName}</div>
                  </td>
                  <td className="p-4">
                    <div className="font-bold text-white leading-tight">{log.siteName}</div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-[10px] font-black ${
                      log.type === LogType.ENTRADA ? 'bg-emerald-500/10 text-emerald-500' : 
                      log.type === LogType.SALIDA ? 'bg-rose-500/10 text-rose-500' : 'bg-blue-500/10 text-blue-500'
                    }`}>
                      {log.type}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="text-[10px] text-slate-500 truncate max-w-[150px]">{log.workReport || '-'}</div>
                    <div className="text-[9px] font-black text-slate-600 uppercase mt-0.5">{log.workMode || 'HORAS'}</div>
                  </td>
                  <td className="p-4">
                    <a 
                      href={`https://www.google.com/maps/search/?api=1&query=${log.location.latitude},${log.location.longitude}`} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-slate-500 hover:text-white transition"
                    >
                      <MapIcon size={18}/>
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredLogs.length === 0 && (
            <div className="p-20 text-center text-slate-600">
              <Search size={48} className="mx-auto mb-4 opacity-10" />
              <p className="text-sm font-black uppercase tracking-widest">No se encontraron registros</p>
              <p className="text-xs mt-2">Intenta cambiar los filtros o la búsqueda.</p>
            </div>
          )}
        </div>

        {/* Mobile Logs View */}
        <div className="md:hidden space-y-3">
          {filteredLogs.map(log => (
            <div key={log.id} className="bg-slate-900 p-5 rounded-3xl border border-slate-800 space-y-4 shadow-sm active:border-slate-700 transition-all">
               <div className="flex justify-between items-start">
                  <div className="flex gap-3">
                     <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                        log.type === LogType.ENTRADA ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 
                        log.type === LogType.SALIDA ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' : 'bg-blue-500/10 border-blue-500/20 text-blue-500'
                     }`}>
                        {log.type === LogType.ENTRADA ? <Zap size={20} /> : log.type === LogType.SALIDA ? <LogOut size={20} /> : <Clock size={20} />}
                     </div>
                     <div>
                        <h4 className="text-sm font-black text-white leading-none">{log.workerName}</h4>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">{log.siteName}</p>
                     </div>
                  </div>
                  <div className="text-right">
                     <p className="text-[10px] font-black text-white">{log.dateStr}</p>
                     <p className="text-[10px] font-bold text-slate-500">{log.timeStr}</p>
                  </div>
               </div>
               
               {log.workReport && (
                 <div className="bg-slate-950/50 p-3 rounded-xl border border-white/5">
                    <p className="text-[10px] text-slate-400 italic font-medium leading-relaxed">"{log.workReport}"</p>
                 </div>
               )}

               <div className="pt-3 border-t border-slate-800 flex justify-between items-center">
                  <div className="flex gap-2">
                     <span className="text-[8px] font-black uppercase bg-slate-950 px-2 py-1 rounded text-slate-500">{log.workMode || 'HORAS'}</span>
                     <span className={`text-[8px] font-black uppercase px-2 py-1 rounded ${log.locationWarning ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                        GPS: {log.distanceMeters || 0}m
                     </span>
                  </div>
                  <a 
                    href={`https://www.google.com/maps/search/?api=1&query=${log.location.latitude},${log.location.longitude}`} 
                    target="_blank" 
                    className="flex items-center gap-1.5 text-[9px] font-black text-blue-400 uppercase tracking-tighter"
                  >
                    <MapIcon size={12}/> Ubicación
                  </a>
               </div>
            </div>
          ))}
          {filteredLogs.length === 0 && (
             <div className="py-20 text-center text-slate-700 bg-slate-900/20 rounded-[3rem] border border-dashed border-slate-800">
                <ClipboardList size={40} className="mx-auto mb-3 opacity-20" />
                <p className="text-xs font-black uppercase tracking-widest">Sin resultados</p>
             </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-slate-950 text-white overflow-hidden">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-64 border-r border-slate-900 p-6 gap-8 bg-slate-950">
        <div className="flex items-center gap-3">
          <AppLogo size="sm" />
          <h1 className="text-xs font-black tracking-tighter uppercase">Admin Panel</h1>
        </div>
        <nav className="flex flex-col gap-2">
          {sidebarItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition ${activeTab === item.id ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-slate-900'}`}
            >
              <item.icon size={20} />
              {item.label}
            </button>
          ))}
        </nav>
        <button 
          onClick={() => setIsLogoutConfirmOpen(true)} 
          className="mt-auto flex items-center gap-3 px-4 py-3 text-rose-500 font-bold hover:bg-rose-500/10 rounded-2xl transition"
        >
          <LogOut size={20} /> Cerrar Sesión
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-14 border-b border-slate-900 flex items-center justify-between px-6 bg-slate-950/50 backdrop-blur-md shrink-0">
           <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsLogoutConfirmOpen(true)} 
                className="md:hidden p-2 bg-slate-900 rounded-xl text-slate-400 active:scale-95 transition"
              >
                <ArrowLeft size={18}/>
              </button>
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest leading-none">Admin</span>
                <span className="text-xs font-black text-white uppercase tracking-tight">{activeTab}</span>
              </div>
           </div>
           
           <div className="flex items-center gap-4">
              <div className={`w-8 h-8 rounded-lg border flex items-center justify-center ${isSuperAdmin ? 'bg-blue-600/10 border-blue-500/20 text-blue-500' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                {isSuperAdmin ? <Shield size={16} /> : <KeyRound size={16} />}
              </div>
           </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
          {activeTab === 'dashboard' && renderDashboard()}
          
          {/* PERSONAL VIEW */}
          {activeTab === 'workers' && (
             <div className="space-y-4 animate-fadeIn pb-20">
               <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                 <h2 className="text-xl font-black text-white uppercase">Personal</h2>
                 <div className="flex gap-2">
                    <div className="relative flex-1 md:w-64">
                       <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                       <input 
                         type="text" 
                         placeholder="Buscar..." 
                         className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-xs text-white focus:border-blue-500 outline-none"
                         value={workerSearchQuery}
                         onChange={(e) => setWorkerSearchQuery(e.target.value)}
                       />
                    </div>
                    <button className="bg-blue-600 p-3 rounded-xl text-white hover:bg-blue-500 transition"><UserPlus size={20} /></button>
                 </div>
               </div>
               <div className="grid gap-2">
                 {filteredWorkers.map(w => (
                   <div key={w.id} className="bg-slate-900 p-4 rounded-3xl border border-slate-800 flex justify-between items-center active:bg-slate-800 transition-colors">
                     <div className="flex items-center gap-3">
                       <div className="w-10 h-10 rounded-2xl bg-slate-800 flex items-center justify-center border border-slate-700 text-slate-500"><Users size={18} /></div>
                       <div><p className="font-black text-white text-sm">{w.name}</p><p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{w.dni || 'SIN DNI'}</p></div>
                     </div>
                     <div className="flex gap-1">
                       <button onClick={() => setReportModal({ ...reportModal, isOpen: true, worker: w })} className="p-2 text-emerald-500"><FileText size={20}/></button>
                       <button onClick={() => StorageService.deleteWorker(w.id)} className="p-2 text-rose-500"><Trash2 size={20}/></button>
                     </div>
                   </div>
                 ))}
               </div>
             </div>
          )}

          {/* SITES VIEW */}
          {activeTab === 'sites' && (
             <div className="space-y-4 animate-fadeIn pb-20">
               <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                 <h2 className="text-xl font-black text-white uppercase tracking-tighter">Gestión de Obras</h2>
                 <div className="flex gap-2">
                    <div className="relative flex-1 md:w-64">
                       <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                       <input type="text" placeholder="Buscar obra..." className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-xs text-white outline-none focus:border-blue-500" value={siteSearchQuery} onChange={(e) => setSiteSearchQuery(e.target.value)}/>
                    </div>
                    <button onClick={() => handleOpenSiteModal()} className="bg-emerald-600 p-3 rounded-xl text-white"><Plus size={20} /></button>
                 </div>
               </div>
               <div className="grid gap-3">
                 {filteredSites.map(site => (
                   <div key={site.id} className="bg-slate-900 p-4 rounded-3xl border border-slate-800 flex justify-between items-center active:bg-slate-800">
                     <div className="flex items-center gap-3">
                       <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${site.active ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'bg-slate-800 border-slate-700 text-slate-500'}`}><MapPin size={18} /></div>
                       <div className="max-w-[150px]"><p className="font-black text-white text-sm truncate">{site.name}</p><p className="text-[9px] text-slate-500 font-bold uppercase truncate">{site.address}</p></div>
                     </div>
                     <div className="flex gap-1">
                       <button onClick={() => handleOpenSiteModal(site)} className="p-2 text-slate-400"><Pencil size={20}/></button>
                       <button onClick={() => StorageService.deleteSite(site.id)} className="p-2 text-rose-500"><Trash2 size={20}/></button>
                     </div>
                   </div>
                 ))}
               </div>
             </div>
          )}

          {/* LOGS VIEW - ENHANCED */}
          {activeTab === 'logs' && renderLogs()}

          {/* TOOLS VIEW */}
          {activeTab === 'tools' && (
             <div className="space-y-4 animate-fadeIn pb-20">
               <div className="flex justify-between items-center">
                 <h2 className="text-xl font-black text-white uppercase">Herramientas</h2>
                 <button onClick={() => handleOpenToolModal()} className="bg-amber-600 p-3 rounded-xl text-white"><Plus size={20} /></button>
               </div>
               <div className="grid grid-cols-1 gap-3">
                 {filteredTools.map(tool => (
                   <div key={tool.id} className="bg-slate-900 p-4 rounded-3xl border border-slate-800 flex flex-col gap-3">
                      <div className="flex justify-between">
                         <div className="w-10 h-10 bg-amber-600/10 rounded-2xl flex items-center justify-center text-amber-500 border border-amber-500/20"><Wrench size={18} /></div>
                         <div className="flex gap-1">
                            <button onClick={() => handleOpenToolModal(tool)} className="p-2 text-slate-500"><Pencil size={18} /></button>
                            <button onClick={() => StorageService.deleteTool(tool.id)} className="p-2 text-rose-500"><Trash2 size={18} /></button>
                         </div>
                      </div>
                      <div>
                         <h4 className="text-base font-black text-white leading-tight">{tool.toolName}</h4>
                         <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{tool.brand} • {tool.model || 'S/M'}</p>
                      </div>
                      <div className="pt-3 border-t border-slate-800 flex items-center gap-2">
                         <div className="w-6 h-6 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-500"><Users size={12} /></div>
                         <span className="text-[10px] font-bold text-slate-400 uppercase">{tool.workerName}</span>
                      </div>
                   </div>
                 ))}
               </div>
             </div>
          )}

          {/* ADMINS & SETTINGS - Only Super Admin */}
          {activeTab === 'admins' && isSuperAdmin && (
             <div className="space-y-6 animate-fadeIn pb-20">
               <div className="flex justify-between items-center"><h2 className="text-xl font-black text-white uppercase">Cuentas Admin</h2><button onClick={() => setIsAdminModalOpen(true)} className="bg-indigo-600 p-3 rounded-xl text-white"><UserPlus size={20} /></button></div>
               <div className="grid gap-3">
                 <div className="bg-blue-600/10 p-5 rounded-3xl border border-blue-500/30 flex items-center gap-4">
                    <Shield className="text-blue-500" size={32} />
                    <div><h3 className="text-sm font-black text-white">Admin Principal</h3><p className="text-[10px] text-blue-400 uppercase font-bold tracking-widest">Master Access</p></div>
                 </div>
                 {admins.map(admin => (
                   <div key={admin.id} className="bg-slate-900 p-4 rounded-3xl border border-slate-800 flex justify-between items-center">
                      <div className="flex items-center gap-4">
                         <div className="w-10 h-10 bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-700"><KeyRound size={20} /></div>
                         <div><h3 className="text-sm font-black text-white">{admin.username}</h3><p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Gestor</p></div>
                      </div>
                      <button onClick={() => StorageService.deleteAdmin(admin.id)} className="p-2 text-rose-500"><Trash2 size={20} /></button>
                   </div>
                 ))}
               </div>
             </div>
          )}

          {activeTab === 'settings' && isSuperAdmin && (
            <div className="max-w-md space-y-6 pb-20">
               <h2 className="text-xl font-black text-white uppercase">Ajustes</h2>
               <div className="space-y-4 bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl">
                  <div className="space-y-2"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Google Sheets URL</label><input type="text" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs text-blue-400 focus:border-blue-500 outline-none" value={config.googleSheetUrl} onChange={(e)=>setConfig({...config, googleSheetUrl: e.target.value})} /></div>
                  <div className="space-y-2"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Contraseña Maestra</label><input type="text" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs text-indigo-400 focus:border-blue-500 outline-none" value={config.adminPassword} onChange={(e)=>setConfig({...config, adminPassword: e.target.value})} /></div>
                  <button onClick={() => StorageService.saveConfig(config)} className="w-full bg-blue-600 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg mt-2 active:scale-95">Guardar Cambios</button>
               </div>
            </div>
          )}
        </div>

        {/* MOBILE NAVIGATION BAR (REFINED) */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-18 bg-slate-950/90 backdrop-blur-xl border-t border-white/5 flex items-center justify-between px-6 z-50">
           <div className="flex items-center justify-around w-full overflow-x-auto no-scrollbar gap-6 py-3">
              {sidebarItems.map(item => (
                <button 
                  key={item.id} 
                  onClick={() => setActiveTab(item.id as any)}
                  className={`flex flex-col items-center gap-1 shrink-0 transition-all ${activeTab === item.id ? 'text-blue-500 scale-110' : 'text-slate-600'}`}
                >
                   <item.icon size={22} className={activeTab === item.id ? 'drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]' : ''} />
                   <span className="text-[8px] font-black uppercase tracking-tighter">{item.label}</span>
                </button>
              ))}
           </div>
        </nav>
      </main>

      {/* MODALS (Tools, Sites, etc.) */}
      {isAdminModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-fadeIn">
           <div className="bg-slate-900 w-full max-w-sm rounded-[2.5rem] border border-slate-800 p-8 shadow-2xl relative overflow-hidden">
             <div className="flex justify-between items-center mb-6">
                <div><h3 className="text-lg font-black text-white uppercase tracking-tighter">Nueva Cuenta Admin</h3><p className="text-indigo-500 text-[10px] font-bold uppercase tracking-widest">Configurar Credenciales</p></div>
                <button onClick={() => setIsAdminModalOpen(false)} className="text-slate-500 hover:text-white p-2"><X size={20} /></button>
             </div>
             <div className="space-y-4">
                <input type="text" placeholder="Usuario" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-white focus:border-indigo-500 outline-none" value={adminForm.username} onChange={(e) => setAdminForm({ ...adminForm, username: e.target.value })}/>
                <input type="password" placeholder="Contraseña" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-white focus:border-indigo-500 outline-none" value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}/>
                <button onClick={handleSaveAdmin} className="w-full bg-indigo-600 text-white py-4 rounded-xl font-black uppercase text-xs tracking-widest mt-4">Crear Administrador</button>
             </div>
           </div>
        </div>
      )}

      {/* Tool Modal */}
      {isToolModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-fadeIn">
           <div className="bg-slate-900 w-full max-w-sm rounded-[2.5rem] border border-slate-800 p-8 shadow-2xl relative overflow-hidden">
             <div className="flex justify-between items-center mb-6">
                <div><h3 className="text-lg font-black text-white uppercase tracking-tighter">{editingTool ? 'Editar Herramienta' : 'Nueva Herramienta'}</h3><p className="text-amber-500 text-[10px] font-bold uppercase tracking-widest">Asignación de Inventario</p></div>
                <button onClick={() => setIsToolModalOpen(false)} className="text-slate-500 hover:text-white p-2"><X size={20} /></button>
             </div>
             <div className="space-y-4">
                <input list="admin-tools-list" type="text" placeholder="Nombre" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-sm text-white outline-none" value={toolForm.toolName} onChange={(e) => setToolForm({ ...toolForm, toolName: e.target.value })}/><datalist id="admin-tools-list">{ELECTRICAL_TOOLS_LIST.map(t => <option key={t} value={t}/>)}</datalist>
                <div className="grid grid-cols-2 gap-3">
                   <input list="admin-brands-list" type="text" placeholder="Marca" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs text-white" value={toolForm.brand} onChange={(e) => setToolForm({ ...toolForm, brand: e.target.value })}/><datalist id="admin-brands-list">{ELECTRICAL_BRANDS_LIST.map(b => <option key={b} value={b}/>)}</datalist>
                   <input type="text" placeholder="Modelo" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs text-white" value={toolForm.model} onChange={(e) => setToolForm({ ...toolForm, model: e.target.value })}/>
                </div>
                <div className="relative"><select className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-sm text-white appearance-none" value={toolForm.workerId} onChange={(e) => setToolForm({ ...toolForm, workerId: e.target.value })}><option value="">Selecciona responsable...</option>{workers.map(w => (<option key={w.id} value={w.id}>{w.name}</option>))}</select><ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} /></div>
                <button onClick={handleSaveTool} className="w-full bg-amber-600 text-white py-4 rounded-2xl font-black uppercase text-xs mt-4">{editingTool ? 'Guardar Cambios' : 'Añadir'}</button>
             </div>
           </div>
        </div>
      )}

      {/* Site Modal */}
      {isSiteModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-fadeIn">
           <div className="bg-slate-900 w-full max-w-sm rounded-[2.5rem] border border-slate-800 p-8 shadow-2xl relative overflow-hidden">
             <div className="flex justify-between items-center mb-6">
                <div><h3 className="text-lg font-black text-white uppercase tracking-tighter">{editingSite ? 'Editar Obra' : 'Nueva Obra'}</h3><p className="text-emerald-500 text-[10px] font-bold uppercase tracking-widest">Ubicación</p></div>
                <button onClick={() => setIsSiteModalOpen(false)} className="text-slate-500 hover:text-white p-2"><X size={20} /></button>
             </div>
             <div className="space-y-4">
                <input type="text" placeholder="Nombre de la Obra" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-sm text-white" value={siteForm.name} onChange={(e) => setSiteForm({ ...siteForm, name: e.target.value })}/>
                <textarea placeholder="Dirección" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-sm text-white h-20 resize-none" value={siteForm.address} onChange={(e) => setSiteForm({ ...siteForm, address: e.target.value })}/>
                <button onClick={handleSaveSite} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black uppercase text-xs mt-2">{editingSite ? 'Guardar Cambios' : 'Crear Obra'}</button>
             </div>
           </div>
        </div>
      )}

      {/* Report Modal */}
      {reportModal.isOpen && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-fadeIn">
          <div className="bg-slate-900 w-full max-w-sm rounded-[2.5rem] border border-slate-800 p-8 shadow-2xl relative">
             <div className="flex justify-between items-center mb-6">
                <div><h3 className="text-lg font-black text-white uppercase tracking-tighter">Generar Informe</h3><p className="text-blue-500 text-[10px] font-bold uppercase tracking-widest">{reportModal.worker?.name}</p></div>
                <button onClick={() => setReportModal({ ...reportModal, isOpen: false })} className="text-slate-500 hover:text-white p-2"><X size={20} /></button>
             </div>
             <div className="space-y-6">
                <div className="flex gap-2">
                   <button onClick={() => setReportModal({ ...reportModal, type: 'WEEK' })} className={`flex-1 py-3 rounded-2xl text-xs font-black uppercase transition ${reportModal.type === 'WEEK' ? 'bg-blue-600 text-white' : 'bg-slate-950 text-slate-500'}`}>Semanal</button>
                   <button onClick={() => setReportModal({ ...reportModal, type: 'MONTH' })} className={`flex-1 py-3 rounded-2xl text-xs font-black uppercase transition ${reportModal.type === 'MONTH' ? 'bg-blue-600 text-white' : 'bg-slate-950 text-slate-500'}`}>Mensual</button>
                </div>
                {reportModal.type === 'WEEK' ? (
                   <input type="date" value={reportModal.selectedDate} onChange={(e) => setReportModal({ ...reportModal, selectedDate: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3 px-4 text-xs text-white [color-scheme:dark]"/>
                ) : (
                   <select value={reportModal.selectedMonth} onChange={(e) => setReportModal({ ...reportModal, selectedMonth: parseInt(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3 px-4 text-xs text-white appearance-none">{MONTH_NAMES.map((m, i) => (<option key={m} value={i}>{m}</option>))}</select>
                )}
                <button onClick={handleGenerateWorkerReport} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-2 active:scale-95 shadow-lg"><Download size={18} /> Descargar PDF</button>
             </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      <ConfirmationModal 
        isOpen={isLogoutConfirmOpen}
        title="¿Cerrar Sesión de Administrador?"
        message="Vas a salir del panel de gestión. Los cambios no guardados en los formularios abiertos podrían perderse."
        confirmText="Sí, salir"
        cancelText="Permanecer aquí"
        isDestructive={true}
        onConfirm={() => {
          setIsLogoutConfirmOpen(false);
          onBack();
        }}
        onCancel={() => setIsLogoutConfirmOpen(false)}
      />
    </div>
  );
};