
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { StorageService, ELECTRICAL_TOOLS_LIST, ELECTRICAL_BRANDS_LIST } from '../services/storageService';
import { Worker, Site, WorkLog, AppConfig, WorkMode, LogType, AdminUser, ToolRecord } from '../types';
import { 
  Users, MapPin, Download, Settings, FileText, 
  Trash2, Plus, Save, Lock, Database, ClipboardList, Calendar, X, UserPlus, Phone, Filter, Search, Clock, Shield, Pencil, Eye, EyeOff, Zap, Wrench, ChevronDown, ArrowLeft, BarChart3, LogOut, CalendarDays, CheckCircle2, AlertCircle, AlertTriangle, Map as MapIcon, ExternalLink, Coffee, Package, KeyRound, ChevronRight, ListFilter, RotateCcw, Image as ImageIcon, Upload, Layout, Maximize2, Smartphone, Check, Timer, History
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

// Helper to format milliseconds to HH:mm:ss
const formatMsToTime = (ms: number) => {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

// Enhanced helper to calculate totals from a list of logs, including ongoing sessions
const calculateTotalsFromLogs = (logs: WorkLog[]) => {
  const sorted = [...logs].sort((a, b) => a.timestamp - b.timestamp);
  let totalWork = 0;
  let totalBreak = 0;
  let lastWorkStart: number | null = null;
  let lastBreakStart: number | null = null;
  let isOngoing = false;

  sorted.forEach(log => {
    if (log.type === LogType.ENTRADA || log.type === LogType.FIN_DESCANSO) {
      if (lastBreakStart) {
        totalBreak += (log.timestamp - lastBreakStart);
        lastBreakStart = null;
      }
      lastWorkStart = log.timestamp;
      isOngoing = true;
    } else if (log.type === LogType.INICIO_DESCANSO) {
      if (lastWorkStart) {
        totalWork += (log.timestamp - lastWorkStart);
        lastWorkStart = null;
      }
      lastBreakStart = log.timestamp;
      isOngoing = true;
    } else if (log.type === LogType.SALIDA) {
      if (lastWorkStart) {
        totalWork += (log.timestamp - lastWorkStart);
        lastWorkStart = null;
      }
      if (lastBreakStart) {
        totalBreak += (log.timestamp - lastBreakStart);
        lastBreakStart = null;
      }
      isOngoing = false;
    }
  });

  // If ongoing, add time up to now
  if (isOngoing) {
    const now = Date.now();
    if (lastWorkStart) totalWork += (now - lastWorkStart);
    if (lastBreakStart) totalBreak += (now - lastWorkStart); // Break time usually calculated from start of break
  }

  return { totalWork, totalBreak, isOngoing };
};

// Helper to render log icons consistently
const LogIcon = ({ type, size = 18 }: { type: LogType, size?: number }) => {
  switch (type) {
    case LogType.ENTRADA:
      return <Zap size={size} className="text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" />;
    case LogType.SALIDA:
      return <LogOut size={size} className="text-rose-400 drop-shadow-[0_0_8px_rgba(251,113,133,0.5)]" />;
    case LogType.INICIO_DESCANSO:
      return <Coffee size={size} className="text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" />;
    case LogType.FIN_DESCANSO:
      return <Timer size={size} className="text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]" />;
    default:
      return <ClipboardList size={size} className="text-slate-400" />;
  }
};

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

export const AdminPanel: React.FC<AdminPanelProps> = ({ onBack, currentUser }) => {
  const isSuperAdmin = currentUser === null;
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'workers' | 'sites' | 'logs' | 'tools' | 'hours' | 'admins' | 'settings'>('dashboard');
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [tools, setTools] = useState<ToolRecord[]>([]);
  const [config, setConfig] = useState<AppConfig>(StorageService.getConfig());
  
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);

  // Search & Filter states
  const [workerSearchQuery, setWorkerSearchQuery] = useState('');
  const [siteSearchQuery, setSiteSearchQuery] = useState('');
  const [toolSearchQuery, setToolSearchQuery] = useState('');
  const [hoursSearchQuery, setHoursSearchQuery] = useState('');
  const [hoursFilterDate, setHoursFilterDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Log Filters
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [logFilterWorker, setLogFilterWorker] = useState('');
  const [logFilterSite, setLogFilterSite] = useState('');
  const [logFilterType, setLogFilterType] = useState('');
  const [logFilterDate, setLogFilterDate] = useState('');
  const [showLogFilters, setShowLogFilters] = useState(false);

  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  // Modals States
  const [isSiteModalOpen, setIsSiteModalOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [siteForm, setSiteForm] = useState({ name: '', address: '', active: true, lat: '', lng: '' });

  const [isToolModalOpen, setIsToolModalOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<ToolRecord | null>(null);
  const [toolForm, setToolForm] = useState({ toolName: '', brand: '', model: '', workerId: '' });
  const [toolModalError, setToolModalError] = useState('');

  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [adminForm, setAdminForm] = useState({ username: '', password: '' });

  const [reportModal, setReportModal] = useState<{ isOpen: boolean; worker: Worker | null; type: 'WEEK' | 'MONTH'; selectedDate: string; selectedMonth: number; }>({
    isOpen: false, worker: null, type: 'MONTH', selectedDate: new Date().toISOString().split('T')[0], selectedMonth: new Date().getMonth()
  });

  useEffect(() => {
    setWorkers(StorageService.getWorkers());
    setSites(StorageService.getSites());
    setLogs(StorageService.getLogs());
    setAdmins(StorageService.getAdmins());
    setTools(StorageService.getTools());
    setConfig(StorageService.getConfig());

    const unsubWorkers = StorageService.subscribeToWorkers(setWorkers);
    const unsubSites = StorageService.subscribeToSites(setSites);
    const unsubLogs = StorageService.subscribeToLogs(setLogs);
    const unsubAdmins = StorageService.subscribeToAdmins(setAdmins);
    const unsubTools = StorageService.subscribeToTools(setTools);
    const unsubConfig = StorageService.subscribeToConfig(setConfig);

    return () => {
      unsubWorkers(); unsubSites(); unsubLogs(); unsubAdmins(); unsubTools(); unsubConfig();
    };
  }, []);

  // --- LOGIC FOR DAILY HOURS REPORT ---
  const dailyHoursStats = useMemo(() => {
    const filterDateFormatted = hoursFilterDate ? new Date(hoursFilterDate).toLocaleDateString('es-ES') : null;
    
    // Group logs by worker + date
    const grouped: Record<string, WorkLog[]> = {};
    logs.forEach(log => {
      if (filterDateFormatted && log.dateStr !== filterDateFormatted) return;
      if (hoursSearchQuery && !log.workerName.toLowerCase().includes(hoursSearchQuery.toLowerCase())) return;
      
      const key = `${log.workerId}_${log.dateStr}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(log);
    });

    return Object.entries(grouped).map(([key, workerLogs]) => {
      const { totalWork, totalBreak, isOngoing } = calculateTotalsFromLogs(workerLogs);

      return {
        key,
        workerName: workerLogs[0].workerName,
        dateStr: workerLogs[0].dateStr,
        workMs: totalWork,
        breakMs: totalBreak,
        totalMs: totalWork + totalBreak,
        isCurrentlyActive: isOngoing
      };
    });
  }, [logs, hoursFilterDate, hoursSearchQuery]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 800000) {
        alert("El logo es demasiado pesado. Intenta con una imagen de menos de 800KB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const newConfig = { ...config, logoUrl: base64String };
        setConfig(newConfig);
        StorageService.saveConfig(newConfig);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFaviconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 200000) { 
        alert("El icono es demasiado pesado. Intenta con una imagen de menos de 200KB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const newConfig = { ...config, faviconUrl: base64String };
        setConfig(newConfig);
        StorageService.saveConfig(newConfig);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveLogo = () => {
    const newConfig = { ...config, logoUrl: '', logoScaleLogin: 1.0, logoScaleDashboard: 1.0 };
    setConfig(newConfig);
    StorageService.saveConfig(newConfig);
  };

  const handleRemoveFavicon = () => {
    const newConfig = { ...config, faviconUrl: '' };
    setConfig(newConfig);
    StorageService.saveConfig(newConfig);
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      await StorageService.saveConfig(config);
      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 3000);
    } catch (e) {
      alert("Error al guardar la configuración");
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Reporte General de Actividad - CARMAGNE SOLU 2024", 14, 15);
    doc.setFontSize(10);
    doc.text(`Generado: ${new Date().toLocaleString('es-ES')}`, 14, 22);

    // If filtered by a single worker, we can add a summary to the general report too
    let summaryText = "";
    if (logFilterWorker) {
      const { totalWork, totalBreak, isOngoing } = calculateTotalsFromLogs(filteredLogs);
      summaryText = `TRABAJO: ${formatMsToTime(totalWork)} | DESCANSO: ${formatMsToTime(totalBreak)}${isOngoing ? ' (JORNADA EN CURSO)' : ''}`;
      doc.setFontSize(9);
      doc.setTextColor(59, 130, 246);
      doc.text(summaryText, 14, 28);
    }

    const tableData = filteredLogs.map(l => [
      l.dateStr, 
      l.timeStr, 
      l.workerName, 
      l.siteName, 
      l.type, 
      l.workMode || 'HORAS',
      l.workReport || '-'
    ]);

    autoTable(doc, { 
      head: [['Fecha', 'Hora', 'Trabajador', 'Obra', 'Tipo', 'Modo', 'Reporte/Tareas']], 
      body: tableData, 
      startY: logFilterWorker ? 34 : 30,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [15, 23, 42] },
      columnStyles: {
        6: { cellWidth: 50 }
      }
    });
    
    doc.save(`reporte_general_${new Date().getTime()}.pdf`);
  };

  const handleGenerateWorkerReport = () => {
    if (!reportModal.worker) return;
    const worker = reportModal.worker;
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text(`Reporte de Actividad - ${worker.name}`, 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`DNI: ${worker.dni || 'No registrado'} | Generado: ${new Date().toLocaleDateString('es-ES')}`, 14, 28);

    let filteredReportLogs = logs.filter(l => l.workerId === worker.id);

    if (reportModal.type === 'WEEK') {
      const pickedDate = new Date(reportModal.selectedDate);
      const day = pickedDate.getDay();
      const diffToMonday = pickedDate.getDate() - day + (day === 0 ? -6 : 1);
      const startOfWeek = new Date(pickedDate);
      startOfWeek.setDate(diffToMonday);
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);
      filteredReportLogs = filteredReportLogs.filter(l => l.timestamp >= startOfWeek.getTime() && l.timestamp <= endOfWeek.getTime());
      doc.text(`Periodo: Semana del ${startOfWeek.toLocaleDateString('es-ES')} al ${endOfWeek.toLocaleDateString('es-ES')}`, 14, 34);
    } else {
      filteredReportLogs = filteredReportLogs.filter(l => {
        const logDate = new Date(l.timestamp);
        return logDate.getMonth() === reportModal.selectedMonth && logDate.getFullYear() === new Date().getFullYear();
      });
      doc.text(`Periodo: Mes de ${MONTH_NAMES[reportModal.selectedMonth]} ${new Date().getFullYear()}`, 14, 34);
    }

    // --- CALCULATE TOTALS ---
    const { totalWork, totalBreak, isOngoing } = calculateTotalsFromLogs(filteredReportLogs);

    // Summary Box
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, 40, 182, 28, 3, 3, 'FD');
    
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text("RESUMEN DE TIEMPOS:", 20, 47);
    
    doc.setFontSize(12);
    doc.setTextColor(5, 150, 105); // Green
    doc.text(`Horas Trabajo: ${formatMsToTime(totalWork)}`, 20, 56);
    
    doc.setTextColor(217, 119, 6); // Amber
    doc.text(`Horas Descanso: ${formatMsToTime(totalBreak)}`, 110, 56);

    // Ongoing Warning in PDF
    if (isOngoing) {
      doc.setFontSize(8);
      doc.setTextColor(225, 29, 72); // Rose/Red
      doc.text("(!) PENDIENTE A TERMINAR JORNADA LABORAL", 20, 64);
    }

    const tableData = filteredReportLogs
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(l => [
        l.dateStr, 
        l.timeStr, 
        l.siteName, 
        l.type, 
        l.workMode || 'HORAS', 
        l.workReport || '-'
      ]);
    
    autoTable(doc, { 
      head: [['Fecha', 'Hora', 'Obra', 'Acción', 'Modo', 'Reporte de Tareas']], 
      body: tableData, 
      startY: 75,
      styles: { fontSize: 8, cellPadding: 3, valign: 'middle' },
      headStyles: { fillColor: [59, 130, 246], fontStyle: 'bold' },
      columnStyles: {
        5: { cellWidth: 60 }
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
           if (data.cell.text[0] === 'SALIDA') data.cell.styles.textColor = [225, 29, 72];
           if (data.cell.text[0] === 'ENTRADA') data.cell.styles.textColor = [5, 150, 105];
        }
      }
    });
    
    doc.save(`Reporte_${worker.name.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`);
    setReportModal({ ...reportModal, isOpen: false });
  };

  const handleOpenSiteModal = (site?: Site) => {
    if (site) {
      setEditingSite(site);
      setSiteForm({ name: site.name, address: site.address, active: site.active, lat: site.coordinates?.latitude.toString() || '', lng: site.coordinates?.longitude.toString() || '' });
    } else {
      setEditingSite(null);
      setSiteForm({ name: '', address: '', active: true, lat: '', lng: '' });
    }
    setIsSiteModalOpen(true);
  };

  const handleSaveSite = async () => {
    if (!siteForm.name || !siteForm.address) return;
    const siteData: Site = { id: editingSite ? editingSite.id : `S-${Date.now()}`, name: siteForm.name, address: siteForm.address, active: siteForm.active, coordinates: (siteForm.lat && siteForm.lng) ? { latitude: parseFloat(siteForm.lat), longitude: parseFloat(siteForm.lng) } : editingSite?.coordinates };
    if (editingSite) await StorageService.updateSite(siteData);
    else { const currentSites = StorageService.getSites(); await StorageService.saveSites([...currentSites, siteData]); }
    setIsSiteModalOpen(false);
  };

  const handleOpenToolModal = (tool?: ToolRecord) => {
    setToolModalError('');
    if (tool) {
      setEditingTool(tool);
      setToolForm({ toolName: tool.toolName, brand: tool.brand, model: tool.model, workerId: tool.workerId });
    } else {
      setEditingTool(null);
      setToolForm({ toolName: '', brand: '', model: '', workerId: '' });
    }
    setIsToolModalOpen(true);
  };

  const handleSaveTool = async () => {
    if (!toolForm.toolName.trim()) {
      setToolModalError('El nombre de la herramienta es obligatorio.');
      return;
    }
    if (!toolForm.workerId) {
      setToolModalError('Debes seleccionar un responsable para el equipo.');
      return;
    }
    const worker = workers.find(w => w.id === toolForm.workerId);
    if (!worker) {
      setToolModalError('El operario seleccionado no es válido.');
      return;
    }
    const toolData: ToolRecord = { 
      id: editingTool ? editingTool.id : `T-${Date.now()}`, 
      workerId: worker.id, 
      workerName: worker.name, 
      toolName: toolForm.toolName.trim(), 
      brand: toolForm.brand, 
      model: toolForm.model, 
      timestamp: editingTool ? editingTool.timestamp : Date.now(), 
      dateStr: editingTool ? editingTool.dateStr : new Date().toLocaleDateString('es-ES'), 
      timeStr: editingTool ? editingTool.timeStr : new Date().toLocaleTimeString('es-ES') 
    };
    try {
      await StorageService.addTool(toolData); 
      setIsToolModalOpen(false);
      setToolModalError('');
    } catch (e) {
      setToolModalError('Error al guardar el equipo. Inténtalo de nuevo.');
    }
  };

  const handleSaveAdmin = async () => {
    if (!adminForm.username || !adminForm.password) return;
    const newAdmin: AdminUser = { id: `ADM-${Date.now()}`, username: adminForm.username, password: adminForm.password, active: true, createdAt: Date.now() };
    await StorageService.addAdmin(newAdmin);
    setAdminForm({ username: '', password: '' });
    setIsAdminModalOpen(false);
  };

  const filteredWorkers = workers.filter(w => w.name.toLowerCase().includes(workerSearchQuery.toLowerCase()) || (w.dni || '').toLowerCase().includes(workerSearchQuery.toLowerCase()));
  const filteredSites = sites.filter(s => s.name.toLowerCase().includes(siteSearchQuery.toLowerCase()) || s.address.toLowerCase().includes(siteSearchQuery.toLowerCase()));
  const filteredTools = tools.filter(t => t.toolName.toLowerCase().includes(toolSearchQuery.toLowerCase()) || t.workerName.toLowerCase().includes(toolSearchQuery.toLowerCase()) || t.brand.toLowerCase().includes(toolSearchQuery.toLowerCase()));
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesSearch = !logSearchQuery || log.workerName.toLowerCase().includes(logSearchQuery.toLowerCase()) || log.siteName.toLowerCase().includes(logSearchQuery.toLowerCase()) || (log.workReport || '').toLowerCase().includes(logSearchQuery.toLowerCase());
      const matchesWorker = !logFilterWorker || log.workerId === logFilterWorker;
      const matchesSite = !logFilterSite || log.siteId === logFilterSite;
      const matchesType = !logFilterType || log.type === logFilterType;
      let matchesDate = true;
      if (logFilterDate) { const filterDateStr = new Date(logFilterDate).toLocaleDateString('es-ES'); matchesDate = log.dateStr === filterDateStr; }
      return matchesSearch && matchesWorker && matchesSite && matchesType && matchesDate;
    });
  }, [logs, logSearchQuery, logFilterWorker, logFilterSite, logFilterType, logFilterDate]);

  const sidebarItems = useMemo(() => {
    const baseItems = [
      { id: 'dashboard', icon: BarChart3, label: 'Panel', color: 'blue' },
      { id: 'workers', icon: Users, label: 'Personal', color: 'indigo' },
      { id: 'hours', icon: History, label: 'Control Horario', color: 'emerald' },
      { id: 'sites', icon: MapPin, label: 'Obras', color: 'emerald' },
      { id: 'logs', icon: ClipboardList, label: 'Registros', color: 'amber' },
      { id: 'tools', icon: Wrench, label: 'Herramientas', color: 'orange' },
    ];
    if (isSuperAdmin) { baseItems.push({ id: 'admins', icon: Shield, label: 'Admins', color: 'violet' }, { id: 'settings', icon: Settings, label: 'Ajustes', color: 'slate' }); }
    return baseItems;
  }, [isSuperAdmin]);

  const renderDashboard = () => {
    const stats = { totalWorkers: workers.length, activeSites: sites.filter(s => s.active).length, todayLogs: logs.filter(l => l.dateStr === new Date().toLocaleDateString('es-ES')).length };
    const quickActions = sidebarItems.filter(item => item.id !== 'dashboard');
    return (
      <div className="space-y-6 animate-fadeIn pb-32 md:pb-0">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex flex-col justify-center"><Users className="text-blue-500 mb-1" size={24} /><h4 className="text-xl font-black text-white">{stats.totalWorkers}</h4><p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Trabajadores</p></div>
          <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex flex-col justify-center"><MapPin className="text-emerald-500 mb-1" size={24} /><h4 className="text-xl font-black text-white">{stats.activeSites}</h4><p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Obras Activas</p></div>
          <div className="col-span-2 md:col-span-1 bg-slate-900 p-4 rounded-2xl border border-slate-800 flex items-center justify-between"><div><Zap className="text-amber-500 mb-1" size={24} /><h4 className="text-xl font-black text-white">{stats.todayLogs}</h4><p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Fichajes Hoy</p></div><div className="md:hidden"><Clock size={32} className="text-slate-800" /></div></div>
        </div>
        <div className="md:hidden space-y-3"><h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Acceso Directo</h3><div className="grid grid-cols-2 gap-3">{quickActions.map(action => (<button key={action.id} onClick={() => setActiveTab(action.id as any)} className="bg-slate-900 border border-slate-800 p-4 rounded-3xl flex flex-col gap-3 active:scale-95 transition-all text-left group"><div className={`w-10 h-10 rounded-2xl bg-${action.color}-500/10 flex items-center justify-center text-${action.color}-500 border border-${action.color}-500/20`}><action.icon size={20} /></div><div className="flex justify-between items-end"><span className="text-xs font-black text-white uppercase tracking-tighter">{action.label}</span><ChevronRight size={14} className="text-slate-700 group-active:text-white" /></div></button>))}</div></div>
        <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 h-[280px]"><h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Actividad Semanal</h3><ResponsiveContainer width="100%" height="100%"><BarChart data={logs.slice(0, 10)}><CartesianGrid strokeDasharray="3 3" stroke="#1e293b" /><XAxis dataKey="timeStr" stroke="#64748b" fontSize={10} /><YAxis stroke="#64748b" fontSize={10} /><RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b' }} /><Bar dataKey="timestamp" fill="#3b82f6" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
      </div>
    );
  };

  const renderHoursReport = () => {
    return (
      <div className="space-y-4 animate-fadeIn pb-32 md:pb-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-xl font-black text-white uppercase tracking-tighter">Control de Horas Diarias</h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Auditoría de jornada y descansos</p>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
             <div className="relative flex-1 md:w-48">
                <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500" size={16} />
                <input 
                  type="date" 
                  value={hoursFilterDate} 
                  onChange={(e) => setHoursFilterDate(e.target.value)} 
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 pl-10 pr-3 text-xs text-white focus:border-emerald-500 outline-none [color-scheme:dark]"
                />
             </div>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input 
            type="text" 
            placeholder="Buscar trabajador..." 
            className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-4 pl-12 pr-4 text-xs text-white focus:border-blue-500 outline-none shadow-inner" 
            value={hoursSearchQuery} 
            onChange={(e) => setHoursSearchQuery(e.target.value)}
          />
        </div>

        <div className="hidden md:block overflow-hidden bg-slate-900/30 rounded-3xl border border-slate-900 shadow-xl">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500 uppercase font-black border-b border-slate-800 bg-slate-900/50">
              <tr>
                <th className="p-4">Trabajador</th>
                <th className="p-4">Fecha</th>
                <th className="p-4 text-emerald-500">Horas Trabajo</th>
                <th className="p-4 text-amber-500">Horas Descanso</th>
                <th className="p-4">Total Jornada</th>
                <th className="p-4 text-right">Estado</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {dailyHoursStats.map(stat => (
                <tr key={stat.key} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="p-4 whitespace-nowrap font-bold text-white">{stat.workerName}</td>
                  <td className="p-4 text-slate-500 font-medium">{stat.dateStr}</td>
                  <td className="p-4 font-mono text-emerald-400 font-black">{formatMsToTime(stat.workMs)}</td>
                  <td className="p-4 font-mono text-amber-400 font-black">{formatMsToTime(stat.breakMs)}</td>
                  <td className="p-4 font-mono text-slate-300">{formatMsToTime(stat.totalMs)}</td>
                  <td className="p-4 text-right">
                    {stat.isCurrentlyActive ? (
                      <span className="inline-flex items-center gap-1.5 bg-emerald-500/10 text-emerald-500 text-[8px] font-black px-2 py-1 rounded-full uppercase animate-pulse">
                         <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> En Directo
                      </span>
                    ) : (
                      <span className="text-[8px] font-black text-slate-700 uppercase">Finalizado</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {dailyHoursStats.length === 0 && (<div className="p-20 text-center text-slate-600"><Clock size={48} className="mx-auto mb-4 opacity-10" /><p className="text-sm font-black uppercase tracking-widest">No hay actividad registrada este día</p></div>)}
        </div>

        <div className="md:hidden space-y-3">
          {dailyHoursStats.map(stat => (
            <div key={stat.key} className="bg-slate-900 p-5 rounded-[2.5rem] border border-slate-800 space-y-4 shadow-xl">
               <div className="flex justify-between items-center px-2">
                  <div>
                    <h4 className="text-base font-black text-white leading-none">{stat.workerName}</h4>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1.5 flex items-center gap-1.5">
                       <Calendar size={12} className="text-slate-600"/> {stat.dateStr}
                    </p>
                  </div>
                  {stat.isCurrentlyActive && (
                    <div className="flex flex-col items-end">
                       <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_12px_rgba(16,185,129,0.6)]"></div>
                       <span className="text-[7px] font-black text-emerald-500 uppercase mt-1">Activo</span>
                    </div>
                  )}
               </div>

               <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-950/80 p-4 rounded-3xl border border-white/5 flex flex-col items-center">
                     <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest mb-1.5">Tiempo Trabajo</p>
                     <p className="text-xl font-mono font-black text-white tracking-tighter">{formatMsToTime(stat.workMs)}</p>
                  </div>
                  <div className="bg-slate-950/80 p-4 rounded-3xl border border-white/5 flex flex-col items-center">
                     <p className="text-[8px] font-black text-amber-500 uppercase tracking-widest mb-1.5">Tiempo Pausa</p>
                     <p className="text-xl font-mono font-black text-white tracking-tighter">{formatMsToTime(stat.breakMs)}</p>
                  </div>
               </div>

               <div className="pt-2 px-1">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-wider">Jornada Total</span>
                    <span className="text-sm font-mono font-black text-slate-400">{formatMsToTime(stat.totalMs)}</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden flex border border-white/5">
                    <div style={{ width: `${stat.totalMs > 0 ? (stat.workMs/stat.totalMs)*100 : 0}%` }} className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400"></div>
                    <div style={{ width: `${stat.totalMs > 0 ? (stat.breakMs/stat.totalMs)*100 : 0}%` }} className="h-full bg-gradient-to-r from-amber-600 to-amber-400"></div>
                  </div>
               </div>
            </div>
          ))}
          {dailyHoursStats.length === 0 && (<div className="py-20 text-center text-slate-700 bg-slate-900/20 rounded-[3rem] border border-dashed border-slate-800"><History size={40} className="mx-auto mb-3 opacity-20" /><p className="text-xs font-black uppercase tracking-widest">Sin registros este día</p></div>)}
        </div>
      </div>
    );
  };

  const renderLogs = () => {
    return (
      <div className="space-y-4 animate-fadeIn pb-32 md:pb-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4"><div><h2 className="text-xl font-black text-white uppercase tracking-tighter">Registros de Actividad</h2><p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{filteredLogs.length} eventos encontrados</p></div><div className="flex items-center gap-2 w-full md:w-auto"><button onClick={() => setShowLogFilters(!showLogFilters)} className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${showLogFilters ? 'bg-amber-600 text-white shadow-lg' : 'bg-slate-900 text-slate-500 border border-slate-800'}`}><ListFilter size={16} /> {showLogFilters ? 'Ocultar Filtros' : 'Filtros'}</button><button onClick={handleExportPDF} className="flex-1 md:flex-none bg-emerald-600/10 text-emerald-500 px-4 py-3 rounded-xl border border-emerald-500/20 text-[10px] font-black uppercase flex items-center justify-center gap-2 hover:bg-emerald-600 hover:text-white transition"><Download size={18} /> Exportar</button></div></div>
        <div className="relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} /><input type="text" placeholder="Buscar trabajador u obra..." className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-4 pl-12 pr-4 text-xs text-white focus:border-blue-500 outline-none shadow-inner" value={logSearchQuery} onChange={(e) => setLogSearchQuery(e.target.value)}/>{logSearchQuery && (<button onClick={() => setLogSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"><X size={16} /></button>)}</div>
        {showLogFilters && (<div className="bg-slate-900/40 p-5 rounded-3xl border border-slate-800 space-y-4 animate-fadeIn"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"><div className="space-y-1"><label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Trabajador</label><div className="relative"><select value={logFilterWorker} onChange={(e) => setLogFilterWorker(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-3 pr-8 text-xs text-white outline-none focus:border-blue-500 appearance-none"><option value="">Todos los trabajadores</option>{workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select><ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={14} /></div></div><div className="space-y-1"><label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Obra / Proyecto</label><div className="relative"><select value={logFilterSite} onChange={(e) => setLogFilterSite(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-3 pr-8 text-xs text-white outline-none focus:border-blue-500 appearance-none"><option value="">Todas las obras</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select><ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={14} /></div></div><div className="space-y-1"><label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Tipo de Acción</label><div className="relative"><select value={logFilterType} onChange={(e) => setLogFilterType(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-3 pr-8 text-xs text-white outline-none focus:border-blue-500 appearance-none"><option value="">Todas las acciones</option>{Object.values(LogType).map(t => <option key={t} value={t}>{t}</option>)}</select><ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={14} /></div></div><div className="space-y-1"><label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Fecha específica</label><div className="relative"><input type="date" value={logFilterDate} onChange={(e) => setLogFilterDate(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-xs text-white outline-none focus:border-blue-500 [color-scheme:dark]"/></div></div></div><div className="flex justify-end"><button onClick={() => { setLogSearchQuery(''); setLogFilterWorker(''); setLogFilterSite(''); setLogFilterType(''); setLogFilterDate(''); }} className="flex items-center gap-1.5 text-rose-500 text-[10px] font-black uppercase hover:text-rose-400 transition"><RotateCcw size={14} /> Limpiar Filtros</button></div></div>)}
        
        <div className="hidden md:block overflow-hidden bg-slate-900/30 rounded-3xl border border-slate-900 shadow-xl">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500 uppercase font-black border-b border-slate-800 bg-slate-900/50">
              <tr>
                <th className="p-4">Fecha/Hora</th>
                <th className="p-4">Trabajador</th>
                <th className="p-4">Obra</th>
                <th className="p-4">Acción</th>
                <th className="p-4">Modo / Reporte</th>
                <th className="p-4 text-right">Ubicación</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {filteredLogs.map(log => (
                <tr key={log.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="p-4 whitespace-nowrap">
                    <div className="font-bold text-white">{log.dateStr}</div>
                    <div className="text-[10px] text-slate-500">{log.timeStr}</div>
                  </td>
                  <td className="p-4 whitespace-nowrap font-bold text-blue-400">{log.workerName}</td>
                  <td className="p-4 font-bold text-white leading-tight">{log.siteName}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                       <div className={`p-1.5 rounded-lg border ${log.type === LogType.ENTRADA ? 'bg-emerald-500/10 border-emerald-500/20' : log.type === LogType.SALIDA ? 'bg-rose-500/10 border-rose-500/20' : log.type === LogType.INICIO_DESCANSO ? 'bg-amber-500/10 border-amber-500/20' : 'bg-blue-500/10 border-blue-500/20'}`}>
                          <LogIcon type={log.type} size={14} />
                       </div>
                       <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tight ${log.type === LogType.ENTRADA ? 'text-emerald-500' : log.type === LogType.SALIDA ? 'text-rose-500' : log.type === LogType.INICIO_DESCANSO ? 'text-amber-500' : 'text-blue-500'}`}>
                          {log.type}
                       </span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="text-[9px] font-black text-slate-600 uppercase">{log.workMode || 'HORAS'}</div>
                    <div className="text-[11px] text-slate-400 mt-1 font-medium italic line-clamp-2 max-w-[250px]">{log.workReport || '-'}</div>
                  </td>
                  <td className="p-4 text-right">
                    <a href={`https://www.google.com/maps/search/?api=1&query=${log.location.latitude},${log.location.longitude}`} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-white transition inline-flex p-2 bg-slate-950 rounded-lg border border-slate-800">
                      <MapIcon size={16}/>
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="md:hidden space-y-4">
          {filteredLogs.map(log => (
            <div key={log.id} className="bg-slate-900 p-5 rounded-[2rem] border border-slate-800 shadow-xl space-y-4 transition-all active:scale-[0.98]">
              <div className="flex justify-between items-start gap-3">
                <div className="flex gap-4">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border-2 ${log.type === LogType.ENTRADA ? 'bg-emerald-500/10 border-emerald-500/20' : log.type === LogType.SALIDA ? 'bg-rose-500/10 border-rose-500/20' : log.type === LogType.INICIO_DESCANSO ? 'bg-amber-500/10 border-amber-500/20' : 'bg-blue-500/10 border-blue-500/20'}`}>
                    <LogIcon type={log.type} size={28} />
                  </div>
                  <div className="flex flex-col justify-center">
                    <h4 className="text-base font-black text-white leading-none tracking-tight">{log.workerName}</h4>
                    <p className="text-[10px] text-blue-500 font-bold uppercase tracking-widest mt-1.5 flex items-center gap-1.5">
                       <MapPin size={10} className="text-blue-600" /> {log.siteName}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-white">{log.timeStr}</p>
                  <p className="text-[9px] font-bold text-slate-600 uppercase mt-0.5">{log.dateStr}</p>
                </div>
              </div>
              
              <div className="flex flex-wrap items-center justify-between pt-1">
                 <div className="flex flex-wrap gap-2">
                    <span className={`text-[8px] font-black uppercase px-2.5 py-1.5 rounded-lg border ${log.type === LogType.ENTRADA ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : log.type === LogType.SALIDA ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' : log.type === LogType.INICIO_DESCANSO ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-blue-500/10 text-blue-500 border-blue-500/20'}`}>
                       {log.type}
                    </span>
                    <span className="text-[8px] font-black uppercase bg-slate-950 px-2.5 py-1.5 rounded-lg text-slate-500 border border-slate-800">{log.workMode || 'HORAS'}</span>
                 </div>
              </div>

              {log.workReport && (
                <div className="bg-slate-950/60 p-4 rounded-2xl border border-white/5">
                   <p className="text-[11px] text-slate-400 italic font-medium leading-relaxed">"{log.workReport}"</p>
                </div>
              )}

              <div className="pt-2">
                <a href={`https://www.google.com/maps/search/?api=1&query=${log.location.latitude},${log.location.longitude}`} target="_blank" className="flex items-center justify-center gap-2 w-full py-3 bg-slate-950 rounded-2xl border border-slate-800 text-[10px] font-black text-blue-400 uppercase tracking-widest hover:bg-slate-800 transition shadow-inner">
                  <MapIcon size={14}/> Ubicación GPS
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-slate-950 text-white overflow-hidden">
      {showSaveSuccess && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[200] animate-fadeIn">
          <div className="bg-emerald-600/90 backdrop-blur-md text-white px-6 py-3 rounded-full flex items-center gap-3 shadow-2xl border border-emerald-500/30">
            <div className="bg-white/20 p-1 rounded-full"><Check size={16} strokeWidth={3} /></div>
            <span className="text-xs font-black uppercase tracking-widest">Cambios guardados</span>
          </div>
        </div>
      )}

      <aside className="hidden md:flex flex-col w-64 border-r border-slate-900 p-6 gap-8 bg-slate-950">
        <div className="flex items-center gap-3"><AppLogo size="sm" logoUrl={config.logoUrl} scale={config.logoScaleDashboard} /><h1 className="text-xs font-black tracking-tighter uppercase">Admin Panel</h1></div>
        <nav className="flex flex-col gap-2">
          {sidebarItems.map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id as any)} className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition ${activeTab === item.id ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-slate-900'}`}>
              <item.icon size={20} />{item.label}
            </button>
          ))}
        </nav>
        <button onClick={() => setIsLogoutConfirmOpen(true)} className="mt-auto flex items-center gap-3 px-4 py-3 text-rose-500 font-bold hover:bg-rose-500/10 rounded-2xl transition"><LogOut size={20} /> Cerrar Sesión</button>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-14 border-b border-slate-900 flex items-center justify-between px-6 bg-slate-950/50 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsLogoutConfirmOpen(true)} className="md:hidden p-2 bg-slate-900 rounded-xl text-slate-400 active:scale-95 transition"><ArrowLeft size={18}/></button>
            <div className="flex flex-col"><span className="text-[10px] font-black text-blue-500 uppercase tracking-widest leading-none">Admin</span><span className="text-xs font-black text-white uppercase tracking-tight">{activeTab}</span></div>
          </div>
          <div className={`w-8 h-8 rounded-lg border flex items-center justify-center ${isSuperAdmin ? 'bg-blue-600/10 border-blue-500/20 text-blue-500' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>{isSuperAdmin ? <Shield size={16} /> : <KeyRound size={16} />}</div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'workers' && (
            <div className="space-y-4 animate-fadeIn pb-32">
              <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4"><h2 className="text-xl font-black text-white uppercase">Personal</h2><div className="flex gap-2"><div className="relative flex-1 md:w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} /><input type="text" placeholder="Buscar..." className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-xs text-white focus:border-blue-500 outline-none" value={workerSearchQuery} onChange={(e) => setWorkerSearchQuery(e.target.value)}/></div><button className="bg-blue-600 p-3 rounded-xl text-white hover:bg-blue-500 transition"><UserPlus size={20} /></button></div></div>
              <div className="grid gap-2">{filteredWorkers.map(w => (<div key={w.id} className="bg-slate-900 p-4 rounded-3xl border border-slate-800 flex justify-between items-center active:bg-slate-800 transition-colors"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-2xl bg-slate-800 flex items-center justify-center border border-slate-700 text-slate-500"><Users size={18} /></div><div><p className="font-black text-white text-sm">{w.name}</p><p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{w.dni || 'SIN DNI'}</p></div></div><div className="flex gap-1"><button onClick={() => setReportModal({ ...reportModal, isOpen: true, worker: w })} className="p-2 text-emerald-500"><FileText size={20}/></button><button onClick={() => StorageService.deleteWorker(w.id)} className="p-2 text-rose-500"><Trash2 size={20}/></button></div></div>))}</div>
            </div>
          )}
          {activeTab === 'hours' && renderHoursReport()}
          {activeTab === 'sites' && (
            <div className="space-y-4 animate-fadeIn pb-32">
              <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4"><h2 className="text-xl font-black text-white uppercase tracking-tighter">Gestión de Obras</h2><div className="flex gap-2"><div className="relative flex-1 md:w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} /><input type="text" placeholder="Buscar obra..." className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-xs text-white focus:border-blue-500 outline-none" value={siteSearchQuery} onChange={(e) => setSiteSearchQuery(e.target.value)}/></div><button onClick={() => handleOpenSiteModal()} className="bg-emerald-600 p-3 rounded-xl text-white"><Plus size={20} /></button></div></div>
              <div className="grid gap-3">{filteredSites.map(site => (<div key={site.id} className="bg-slate-900 p-4 rounded-3xl border border-slate-800 flex justify-between items-center active:bg-slate-800"><div className="flex items-center gap-3"><div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${site.active ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'bg-slate-800 border-slate-700 text-slate-400'}`}><MapPin size={18} /></div><div className="max-w-[150px]"><p className="font-black text-white text-sm truncate">{site.name}</p><p className="text-[9px] text-slate-500 font-bold uppercase truncate">{site.address}</p></div></div><div className="flex gap-1"><button onClick={() => handleOpenSiteModal(site)} className="p-2 text-slate-400"><Pencil size={20}/></button><button onClick={() => StorageService.deleteSite(site.id)} className="p-2 text-rose-500"><Trash2 size={20}/></button></div></div>))}</div>
            </div>
          )}
          {activeTab === 'logs' && renderLogs()}
          {activeTab === 'tools' && (
            <div className="space-y-4 animate-fadeIn pb-32">
              <div className="flex justify-between items-center"><h2 className="text-xl font-black text-white uppercase">Herramientas</h2><button onClick={() => handleOpenToolModal()} className="bg-amber-600 p-3 rounded-xl text-white"><Plus size={20} /></button></div>
              <div className="grid grid-cols-1 gap-3">{filteredTools.map(tool => (<div key={tool.id} className="bg-slate-900 p-4 rounded-3xl border border-slate-800 flex flex-col gap-3"><div className="flex justify-between"><div className="w-10 h-10 bg-amber-600/10 rounded-2xl flex items-center justify-center text-amber-500 border border-amber-500/20"><Wrench size={18} /></div><div className="flex gap-1"><button onClick={() => handleOpenToolModal(tool)} className="p-2 text-slate-500"><Pencil size={18} /></button><button onClick={() => StorageService.deleteTool(tool.id)} className="p-2 text-rose-500"><Trash2 size={18} /></button></div></div><div><h4 className="text-base font-black text-white leading-tight">{tool.toolName}</h4><p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{tool.brand} • {tool.model || 'S/M'}</p></div><div className="pt-3 border-t border-slate-800 flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-500"><Users size={12} /></div><span className="text-[10px] font-bold text-slate-400 uppercase">{tool.workerName}</span></div></div>))}</div>
            </div>
          )}
          {activeTab === 'admins' && isSuperAdmin && (
            <div className="space-y-6 animate-fadeIn pb-32">
              <div className="flex justify-between items-center"><h2 className="text-xl font-black text-white uppercase">Cuentas Admin</h2><button onClick={() => setIsAdminModalOpen(true)} className="bg-indigo-600 p-3 rounded-xl text-white"><UserPlus size={20} /></button></div>
              <div className="grid gap-3">{admins.map(admin => (<div key={admin.id} className="bg-slate-900 p-4 rounded-3xl border border-slate-800 flex justify-between items-center"><div className="flex items-center gap-4"><div className="w-10 h-10 bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-700"><KeyRound size={20} /></div><div><h3 className="text-sm font-black text-white">{admin.username}</h3><p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Gestor</p></div></div><button onClick={() => StorageService.deleteAdmin(admin.id)} className="p-2 text-rose-500"><Trash2 size={20} /></button></div>))}</div>
            </div>
          )}
          {activeTab === 'settings' && isSuperAdmin && (
            <div className="max-w-xl space-y-6 pb-32 animate-fadeIn">
               <h2 className="text-xl font-black text-white uppercase tracking-tighter">Ajustes del Sistema</h2>
               <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 shadow-xl space-y-6">
                  <div className="flex items-center gap-3 mb-2"><ImageIcon className="text-blue-500" size={24}/><h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">Identidad Corporativa</h3></div>
                  <div className="flex flex-col items-center gap-4 p-8 bg-slate-950/50 rounded-3xl border-2 border-dashed border-slate-800">
                     {config.logoUrl ? (
                        <div className="relative group">
                           <img src={config.logoUrl} style={{ width: 140, height: 140 }} className="object-contain rounded-2xl bg-slate-900 p-4 shadow-2xl transition-all" alt="Logo corporativo" />
                           <button onClick={handleRemoveLogo} className="absolute -top-3 -right-3 bg-rose-600 text-white p-2 rounded-full shadow-2xl hover:bg-rose-500 transition active:scale-90"><X size={18}/></button>
                        </div>
                     ) : (
                        <div className="flex flex-col items-center text-slate-700 py-4"><ImageIcon size={64} className="mb-4 opacity-10"/><p className="text-[10px] font-black uppercase tracking-widest">Aún no has subido un logo</p></div>
                     )}
                     <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                     <button onClick={() => logoInputRef.current?.click()} className="flex items-center gap-3 bg-blue-600 text-white px-8 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg hover:bg-blue-500 transition active:scale-95"><Upload size={18}/> {config.logoUrl ? 'Actualizar Logo' : 'Subir Logotipo'}</button>
                  </div>
                  <div className="flex flex-col gap-4 p-6 bg-slate-950/50 rounded-3xl border border-slate-800">
                    <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Smartphone className="text-blue-400" size={18}/><h4 className="text-xs font-black text-white uppercase tracking-widest">Icono PWA</h4></div>{config.faviconUrl && (<button onClick={handleRemoveFavicon} className="text-rose-500 hover:text-rose-400 text-[10px] font-black uppercase tracking-widest">Eliminar</button>)}</div>
                    <div className="flex items-center gap-6"><div className="w-16 h-16 rounded-3xl bg-slate-900 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0 shadow-2xl">{config.faviconUrl ? (<img src={config.faviconUrl} className="w-full h-full object-contain p-2" alt="Favicon Preview" />) : (<Zap size={24} className="text-slate-700" />)}</div><div className="flex flex-col gap-2 flex-1"><p className="text-[10px] text-slate-500 font-bold leading-relaxed"><span className="text-blue-400 font-black uppercase">Recomendado:</span> 512x512 px. Aparecerá al instalar la app.</p><input ref={faviconInputRef} type="file" accept="image/*" onChange={handleFaviconUpload} className="hidden" /><button onClick={() => faviconInputRef.current?.click()} className="text-left flex items-center gap-2 text-[10px] font-black text-blue-500 uppercase tracking-widest hover:text-blue-400 transition"><Upload size={14}/> {config.faviconUrl ? 'Cambiar Icono' : 'Seleccionar Archivo'}</button></div></div>
                  </div>
                  <div className="space-y-4 bg-slate-900 p-8 rounded-[2.5rem] border border-slate-800 shadow-xl">
                    <div className="flex items-center gap-3 mb-2"><Database className="text-indigo-500" size={24}/><h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">Configuración Base</h3></div>
                    <div className="space-y-4">
                      <div className="space-y-2"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Google Sheets URL</label><input type="text" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs text-blue-400 focus:border-blue-500 outline-none transition-all" value={config.googleSheetUrl} onChange={(e)=>setConfig({...config, googleSheetUrl: e.target.value})} placeholder="https://script.google.com/..."/></div>
                      <div className="space-y-2"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Contraseña Maestra</label><div className="relative"><input type="text" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs text-indigo-400 focus:border-blue-500 outline-none" value={config.adminPassword} onChange={(e)=>setConfig({...config, adminPassword: e.target.value})} /><Lock className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-700" size={16}/></div></div>
                      <button onClick={handleSaveConfig} disabled={isSaving} className={`w-full ${isSaving ? 'bg-indigo-800' : 'bg-indigo-600'} text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-2xl mt-4 active:scale-95 transition-all flex items-center justify-center gap-2`}>{isSaving ? (<div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>) : (<Save size={18}/>)}{isSaving ? 'Guardando...' : 'Guardar Todos los Cambios'}</button>
                    </div>
                  </div>
               </div>
            </div>
          )}
        </div>

        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-950/95 backdrop-blur-2xl border-t border-white/10 flex items-center justify-between px-6 z-50 shadow-[0_-10px_25px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-around w-full overflow-x-auto no-scrollbar gap-4 py-3">
            {sidebarItems.map(item => (
              <button key={item.id} onClick={() => setActiveTab(item.id as any)} className={`flex flex-col items-center gap-1.5 shrink-0 transition-all active:scale-90 ${activeTab === item.id ? 'text-blue-500' : 'text-slate-500'}`}>
                <div className={`p-2 rounded-xl transition-colors ${activeTab === item.id ? 'bg-blue-500/10' : ''}`}>
                   <item.icon size={20} className={activeTab === item.id ? 'drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]' : ''} />
                </div>
                <span className="text-[7px] font-black uppercase tracking-tighter">{item.label}</span>
              </button>
            ))}
          </div>
        </nav>
      </main>

      {isAdminModalOpen && (<div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-fadeIn"><div className="bg-slate-900 w-full max-w-sm rounded-[2.5rem] border border-slate-800 p-8 shadow-2xl relative overflow-hidden"><div className="flex justify-between items-center mb-6"><div><h3 className="text-lg font-black text-white uppercase tracking-tighter">Nueva Cuenta Admin</h3><p className="text-indigo-500 text-[10px] font-bold uppercase tracking-widest">Configurar Credenciales</p></div><button onClick={() => setIsAdminModalOpen(false)} className="text-slate-500 hover:text-white p-2"><X size={20} /></button></div><div className="space-y-4"><input type="text" placeholder="Usuario" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-white focus:border-indigo-500 outline-none" value={adminForm.username} onChange={(e) => setAdminForm({ ...adminForm, username: e.target.value })}/><input type="password" placeholder="Contraseña" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-white focus:border-indigo-500 outline-none" value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}/><button onClick={handleSaveAdmin} className="w-full bg-indigo-600 text-white py-4 rounded-xl font-black uppercase text-xs tracking-widest mt-4">Crear Administrador</button></div></div></div>)}
      {isToolModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-fadeIn">
          <div className="bg-slate-900 w-full max-w-sm rounded-[2.5rem] border border-slate-800 p-8 shadow-2xl relative overflow-hidden">
            <div className="flex justify-between items-center mb-6"><div><h3 className="text-lg font-black text-white uppercase tracking-tighter">{editingTool ? 'Editar Herramienta' : 'Nueva Herramienta'}</h3><p className="text-amber-500 text-[10px] font-bold uppercase tracking-widest">Inventario</p></div><button onClick={() => setIsToolModalOpen(false)} className="text-slate-500 hover:text-white p-2"><X size={20} /></button></div>
            <div className="space-y-4">
              <input list="admin-tools-list" type="text" placeholder="Equipo" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-sm text-white" value={toolForm.toolName} onChange={(e) => setToolForm({ ...toolForm, toolName: e.target.value })}/>
              <div className="grid grid-cols-2 gap-3">
                <input list="admin-brands-list" type="text" placeholder="Marca" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs text-white" value={toolForm.brand} onChange={(e) => setToolForm({ ...toolForm, brand: e.target.value })}/>
                <input type="text" placeholder="Modelo" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs text-white" value={toolForm.model} onChange={(e) => setToolForm({ ...toolForm, model: e.target.value })}/>
              </div>
              <select className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-sm text-white" value={toolForm.workerId} onChange={(e) => setToolForm({ ...toolForm, workerId: e.target.value })}><option value="">Responsable...</option>{workers.map(w => (<option key={w.id} value={w.id}>{w.name}</option>))}</select>
              {toolModalError && <p className="text-rose-500 text-[10px] font-bold uppercase">{toolModalError}</p>}
              <button onClick={handleSaveTool} className="w-full bg-amber-600 text-white py-4 rounded-2xl font-black uppercase text-xs shadow-lg">{editingTool ? 'Guardar' : 'Añadir'}</button>
            </div>
          </div>
        </div>
      )}
      {isSiteModalOpen && (<div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-fadeIn"><div className="bg-slate-900 w-full max-w-sm rounded-[2.5rem] border border-slate-800 p-8 shadow-2xl relative overflow-hidden"><div className="flex justify-between items-center mb-6"><div><h3 className="text-lg font-black text-white uppercase tracking-tighter">{editingSite ? 'Editar Obra' : 'Nueva Obra'}</h3><p className="text-emerald-500 text-[10px] font-bold uppercase tracking-widest">Ubicación</p></div><button onClick={() => setIsSiteModalOpen(false)} className="text-slate-500 hover:text-white p-2"><X size={20} /></button></div><div className="space-y-4"><input type="text" placeholder="Obra" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-sm text-white" value={siteForm.name} onChange={(e) => setSiteForm({ ...siteForm, name: e.target.value })}/><textarea placeholder="Dirección" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-sm text-white h-20 resize-none" value={siteForm.address} onChange={(e) => setSiteForm({ ...siteForm, address: e.target.value })}/><button onClick={handleSaveSite} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black uppercase text-xs mt-2">{editingSite ? 'Guardar' : 'Crear'}</button></div></div></div>)}
      {reportModal.isOpen && (<div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-fadeIn"><div className="bg-slate-900 w-full max-w-sm rounded-[2.5rem] border border-slate-800 p-8 shadow-2xl relative"><div className="flex justify-between items-center mb-6"><div><h3 className="text-lg font-black text-white uppercase tracking-tighter">Informe</h3><p className="text-blue-500 text-[10px] font-bold uppercase tracking-widest">{reportModal.worker?.name}</p></div><button onClick={() => setReportModal({ ...reportModal, isOpen: false })} className="text-slate-500 hover:text-white p-2"><X size={20} /></button></div><div className="space-y-6"><div className="flex gap-2"><button onClick={() => setReportModal({ ...reportModal, type: 'WEEK' })} className={`flex-1 py-3 rounded-2xl text-xs font-black uppercase transition ${reportModal.type === 'WEEK' ? 'bg-blue-600 text-white' : 'bg-slate-950 text-slate-500'}`}>Semanal</button><button onClick={() => setReportModal({ ...reportModal, type: 'MONTH' })} className={`flex-1 py-3 rounded-2xl text-xs font-black uppercase transition ${reportModal.type === 'MONTH' ? 'bg-blue-600 text-white' : 'bg-slate-950 text-slate-500'}`}>Mensual</button></div>{reportModal.type === 'WEEK' ? (<input type="date" value={reportModal.selectedDate} onChange={(e) => setReportModal({ ...reportModal, selectedDate: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3 px-4 text-xs text-white [color-scheme:dark]"/>) : (<select value={reportModal.selectedMonth} onChange={(e) => setReportModal({ ...reportModal, selectedMonth: parseInt(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3 px-4 text-xs text-white appearance-none">{MONTH_NAMES.map((m, i) => (<option key={m} value={i}>{m}</option>))}</select>)}<button onClick={handleGenerateWorkerReport} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-2 active:scale-95 shadow-lg"><Download size={18} /> Descargar PDF</button></div></div></div>)}
      <ConfirmationModal isOpen={isLogoutConfirmOpen} title="¿Cerrar Sesión?" message="Vas a salir del panel." confirmText="Salir" cancelText="Quedarme" isDestructive={true} onConfirm={() => { setIsLogoutConfirmOpen(false); onBack(); }} onCancel={() => setIsLogoutConfirmOpen(false)} />
    </div>
  );
};
