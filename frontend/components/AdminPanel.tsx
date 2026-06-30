
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { StorageService, ELECTRICAL_TOOLS_LIST, ELECTRICAL_BRANDS_LIST } from '../services/storageService';
import { Worker, Site, WorkLog, AppConfig, WorkMode, LogType, AdminUser, ToolRecord, WeeklyReport, Payroll } from '../types';
import { PayrollAdminPanel } from './PayrollAdminPanel';
import { 
  Users, MapPin, Download, Settings, FileText, 
  Trash2, Plus, Save, Lock, Database, ClipboardList, Calendar, X, UserPlus, Phone, Filter, Search, Clock, Shield, Pencil, Eye, EyeOff, Zap, Wrench, ChevronDown, ArrowLeft, BarChart3, LogOut, CalendarDays, CheckCircle2, AlertCircle, AlertTriangle, Map as MapIcon, ExternalLink, Coffee, Package, KeyRound, ChevronRight, ListFilter, RotateCcw, Image as ImageIcon, Upload, Layout, Maximize2, Smartphone, Check, Timer, History, Sparkles, FileImage, ScrollText
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ConfirmationModal } from './ConfirmationModal';

interface AdminPanelProps {
  onBack: () => void;
  currentUser: AdminUser | null;
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const formatMsToTime = (ms: number) => {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const calculateTotalsFromLogs = (logs: WorkLog[]) => {
  const sorted = [...logs].sort((a, b) => a.timestamp - b.timestamp);
  let totalWork = 0;
  let totalBreak = 0;
  let lastWorkStart: number | null = null;
  let lastBreakStart: number | null = null;
  let currentState: LogType | null = null;

  sorted.forEach(log => {
    if (log.type === LogType.ENTRADA || log.type === LogType.FIN_DESCANSO) {
      if (lastBreakStart && currentState === LogType.INICIO_DESCANSO) {
        totalBreak += Math.max(0, log.timestamp - lastBreakStart);
      }
      lastBreakStart = null;
      lastWorkStart = log.timestamp;
      currentState = log.type;
    } else if (log.type === LogType.INICIO_DESCANSO) {
      if (lastWorkStart && (currentState === LogType.ENTRADA || currentState === LogType.FIN_DESCANSO)) {
        totalWork += Math.max(0, log.timestamp - lastWorkStart);
      }
      lastWorkStart = null;
      lastBreakStart = log.timestamp;
      currentState = log.type;
    } else if (log.type === LogType.SALIDA) {
      if (lastWorkStart && (currentState === LogType.ENTRADA || currentState === LogType.FIN_DESCANSO)) {
        totalWork += Math.max(0, log.timestamp - lastWorkStart);
      }
      if (lastBreakStart && currentState === LogType.INICIO_DESCANSO) {
        totalBreak += Math.max(0, log.timestamp - lastBreakStart);
      }
      lastWorkStart = null;
      lastBreakStart = null;
      currentState = LogType.SALIDA;
    }
  });

  const isOngoing = currentState !== null && currentState !== LogType.SALIDA;
  
  if (isOngoing) {
    const now = Date.now();
    const isToday = logs.length > 0 && logs[0].dateStr === new Date().toLocaleDateString('es-ES');
    if (isToday) {
      if (lastWorkStart) totalWork += Math.max(0, now - lastWorkStart);
      if (lastBreakStart) totalBreak += Math.max(0, now - lastBreakStart);
    }
  }

  return { totalWork, totalBreak, isOngoing };
};

const LogIcon = ({ type, size = 18 }: { type: LogType, size?: number }) => {
  switch (type) {
    case LogType.ENTRADA:
      return <Zap size={size} className="text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" />;
    case LogType.SALIDA:
      return <LogOut size={size} className="text-rose-400 drop-shadow-[0_0_8px_rgba(251,113,133,0.5)]" />;
    case LogType.INICIO_DESCANSO:
      return <Coffee size={size} className="text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" />;
    case LogType.FIN_DESCANSO:
      return <Timer size={size} className="text-sky-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]" />;
    default:
      return <ClipboardList size={size} className="text-stone-400" />;
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
    <div className={`relative flex items-center justify-center ${className} text-amber-500`}>
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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'workers' | 'sites' | 'logs' | 'tools' | 'hours' | 'reports' | 'comparison' | 'payrolls' | 'admins' | 'settings'>('dashboard');
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [tools, setTools] = useState<ToolRecord[]>([]);
  const [weeklyReports, setWeeklyReports] = useState<WeeklyReport[]>([]);
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [config, setConfig] = useState<AppConfig>(StorageService.getConfig());
  
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);

  const [workerSearchQuery, setWorkerSearchQuery] = useState('');
  const [siteSearchQuery, setSiteSearchQuery] = useState('');
  const [toolSearchQuery, setToolSearchQuery] = useState('');
  const [toolFilterWorker, setToolFilterWorker] = useState('');
  const [toolFilterSite, setToolFilterSite] = useState('');
  const [hoursSearchQuery, setHoursSearchQuery] = useState('');
  const [hoursFilterDate, setHoursFilterDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [logFilterWorker, setLogFilterWorker] = useState('');
  const [logFilterSite, setLogFilterSite] = useState('');
  const [logFilterType, setLogFilterType] = useState('');
  const [logFilterDate, setLogFilterDate] = useState('');
  const [showLogFilters, setShowLogFilters] = useState(false);

  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isClearLogsConfirmOpen, setIsClearLogsConfirmOpen] = useState(false);
  const [logToDelete, setLogToDelete] = useState<string | null>(null);

  const [isSiteModalOpen, setIsSiteModalOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [siteForm, setSiteForm] = useState({ name: '', address: '', active: true, lat: '', lng: '' });

  const [isToolModalOpen, setIsToolModalOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<ToolRecord | null>(null);
  const [toolForm, setToolForm] = useState({ toolName: '', brand: '', model: '', workerId: '', siteId: '' });
  const [toolModalError, setToolModalError] = useState('');

  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [adminForm, setAdminForm] = useState({ username: '', password: '' });
  const [showAdminConfigPwd, setShowAdminConfigPwd] = useState(false);

  const [reportModal, setReportModal] = useState<{ isOpen: boolean; worker: Worker | null; type: 'WEEK' | 'MONTH'; selectedDate: string; selectedMonth: number; }>({
    isOpen: false, worker: null, type: 'MONTH', selectedDate: new Date().toISOString().split('T')[0], selectedMonth: new Date().getMonth()
  });

  // Weekly reports tab state
  const [reportsFilterWorker, setReportsFilterWorker] = useState('');
  const [reportsFilterWeek, setReportsFilterWeek] = useState('');
  const [reportsSearch, setReportsSearch] = useState('');
  const [viewingReport, setViewingReport] = useState<WeeklyReport | null>(null);
  const [reportToDelete, setReportToDelete] = useState<string | null>(null);

  // Monthly comparison tab state
  const now = new Date();
  const [comparisonMonth, setComparisonMonth] = useState<number>(now.getMonth());
  const [comparisonYear, setComparisonYear] = useState<number>(now.getFullYear());
  const [comparisonSortBy, setComparisonSortBy] = useState<'hours' | 'reports' | 'name'>('hours');

  useEffect(() => {
    setWorkers(StorageService.getWorkers());
    setSites(StorageService.getSites());
    setLogs(StorageService.getLogs());
    setAdmins(StorageService.getAdmins());
    setTools(StorageService.getTools());
    setConfig(StorageService.getConfig());
    setWeeklyReports(StorageService.getWeeklyReports());
    setPayrolls(StorageService.getPayrolls());

    const unsubWorkers = StorageService.subscribeToWorkers(setWorkers);
    const unsubSites = StorageService.subscribeToSites(setSites);
    const unsubLogs = StorageService.subscribeToLogs(setLogs);
    const unsubAdmins = StorageService.subscribeToAdmins(setAdmins);
    const unsubTools = StorageService.subscribeToTools(setTools);
    const unsubConfig = StorageService.subscribeToConfig(setConfig);
    const unsubReports = StorageService.subscribeToWeeklyReports(setWeeklyReports);
    const unsubPayrolls = StorageService.subscribeToPayrolls(setPayrolls);

    return () => {
      unsubWorkers(); unsubSites(); unsubLogs(); unsubAdmins(); unsubTools(); unsubConfig(); unsubReports(); unsubPayrolls();
    };
  }, []);

  const dailyHoursStats = useMemo(() => {
    const filterDateFormatted = hoursFilterDate ? new Date(hoursFilterDate).toLocaleDateString('es-ES') : null;
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
        key, workerName: workerLogs[0].workerName, dateStr: workerLogs[0].dateStr,
        workMs: totalWork, breakMs: totalBreak, totalMs: totalWork + totalBreak,
        isCurrentlyActive: isOngoing
      };
    });
  }, [logs, hoursFilterDate, hoursSearchQuery]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1000000) { alert("El logo es demasiado pesado. Máximo 1MB."); return; }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const newConfig = { ...config, logoUrl: base64String };
        setConfig(newConfig);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFaviconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 500000) { alert("El icono es demasiado pesado. Máximo 500KB."); return; }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const newConfig = { ...config, faviconUrl: base64String };
        setConfig(newConfig);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveLogo = () => setConfig({ ...config, logoUrl: '' });
  const handleRemoveFavicon = () => setConfig({ ...config, faviconUrl: '' });

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try { 
      await StorageService.saveConfig(config); 
      setShowSaveSuccess(true); 
      setTimeout(() => setShowSaveSuccess(false), 3000); 
    }
    catch (e) { alert("Error al guardar la configuración"); }
    finally { setIsSaving(false); }
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Reporte General de Actividad - CARMAGNE INSTAL SL", 14, 15);
    const tableData = filteredLogs.map(l => [l.dateStr, l.timeStr, l.workerName, l.siteName, l.type, l.workMode || 'HORAS', l.workReport || '-']);
    autoTable(doc, { head: [['Fecha', 'Hora', 'Trabajador', 'Obra', 'Tipo', 'Modo', 'Reporte']], body: tableData, startY: 25, styles: { fontSize: 7 } });
    doc.save(`reporte_carmagne_${new Date().getTime()}.pdf`);
  };

  const handleGenerateWorkerReport = () => {
    if (!reportModal.worker) return;
    const worker = reportModal.worker;
    const doc = new jsPDF();
    doc.setFontSize(18); doc.text(`Informe: ${worker.name}`, 14, 20);
    let filteredReportLogs = logs.filter(l => l.workerId === worker.id);
    if (reportModal.type === 'WEEK') {
      const pickedDate = new Date(reportModal.selectedDate);
      const day = pickedDate.getDay(); const diffToMonday = pickedDate.getDate() - day + (day === 0 ? -6 : 1);
      const startOfWeek = new Date(pickedDate); startOfWeek.setDate(diffToMonday); startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate() + 6); endOfWeek.setHours(23, 59, 59, 999);
      filteredReportLogs = filteredReportLogs.filter(l => l.timestamp >= startOfWeek.getTime() && l.timestamp <= endOfWeek.getTime());
    } else {
      filteredReportLogs = filteredReportLogs.filter(l => {
        const logDate = new Date(l.timestamp);
        return logDate.getMonth() === reportModal.selectedMonth && logDate.getFullYear() === new Date().getFullYear();
      });
    }
    const { totalWork, totalBreak } = calculateTotalsFromLogs(filteredReportLogs);
    doc.text(`TRABAJO NETO: ${formatMsToTime(totalWork)} | DESCANSOS: ${formatMsToTime(totalBreak)}`, 14, 30);
    const tableData = filteredReportLogs.map(l => [l.dateStr, l.timeStr, l.siteName, l.type, l.workMode || 'HORAS', l.workReport || '-']);
    autoTable(doc, { head: [['Fecha', 'Hora', 'Obra', 'Acción', 'Modo', 'Tarea']], body: tableData, startY: 40, styles: { fontSize: 8 } });
    doc.save(`Reporte_${worker.name}_Carmagne.pdf`);
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
      setToolForm({ toolName: tool.toolName, brand: tool.brand, model: tool.model, workerId: tool.workerId, siteId: tool.siteId || '' });
    } else {
      setEditingTool(null);
      setToolForm({ toolName: '', brand: '', model: '', workerId: '', siteId: '' });
    }
    setIsToolModalOpen(true);
  };

  const handleSaveTool = async () => {
    if (!toolForm.toolName.trim() || !toolForm.workerId) { setToolModalError('Nombre y responsable obligatorios.'); return; }
    const worker = workers.find(w => w.id === toolForm.workerId);
    const site = sites.find(s => s.id === toolForm.siteId);
    if (!worker) return;
    const toolData: ToolRecord = { 
      id: editingTool ? editingTool.id : `T-${Date.now()}`, 
      workerId: worker.id, 
      workerName: worker.name, 
      toolName: toolForm.toolName.trim(), 
      brand: toolForm.brand, 
      model: toolForm.model, 
      timestamp: Date.now(), 
      dateStr: new Date().toLocaleDateString('es-ES'), 
      timeStr: new Date().toLocaleTimeString('es-ES'),
      siteId: site?.id,
      siteName: site?.name
    };
    await StorageService.addTool(toolData); setIsToolModalOpen(false);
  };

  const handleDeleteLog = async () => {
    if (logToDelete) {
      await StorageService.deleteLog(logToDelete);
      setLogToDelete(null);
    }
  };

  const handleClearAllLogs = async () => {
    await StorageService.clearAllLogs();
    setIsClearLogsConfirmOpen(false);
  };

  const handleExportReportsPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Partes Semanales - CARMAGNE INSTAL SL", 14, 15);
    doc.setFontSize(9);
    const filterDesc: string[] = [];
    if (reportsFilterWorker) filterDesc.push(`Trabajador: ${workers.find(w => w.id === reportsFilterWorker)?.name || ''}`);
    if (reportsFilterWeek) filterDesc.push(`Semana de: ${reportsFilterWeek}`);
    if (reportsSearch) filterDesc.push(`Búsqueda: "${reportsSearch}"`);
    doc.text(filterDesc.length ? `Filtros: ${filterDesc.join(' • ')}` : 'Todos los partes', 14, 22);
    doc.text(`Total: ${filteredWeeklyReports.length} parte(s)`, 14, 28);
    const tableData = filteredWeeklyReports.map(r => [
      r.workerName,
      `${r.weekStart}\n${r.weekEnd}`,
      r.siteName || '-',
      r.totalHours.toFixed(1) + 'h',
      (r.tasks || '-').slice(0, 80),
      r.dateStr
    ]);
    autoTable(doc, {
      head: [['Trabajador', 'Semana', 'Obra', 'Horas', 'Tareas', 'Enviado']],
      body: tableData,
      startY: 34,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [79, 70, 229] },
      columnStyles: { 1: { cellWidth: 22 }, 4: { cellWidth: 60 } }
    });
    doc.save(`partes_semanales_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleExportSingleReportPDF = (r: WeeklyReport) => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Parte Semanal", 14, 18);
    doc.setFontSize(11);
    doc.text(`Trabajador: ${r.workerName}`, 14, 28);
    doc.text(`Semana: ${r.weekStart}  →  ${r.weekEnd}`, 14, 34);
    doc.text(`Obra: ${r.siteName || '-'}`, 14, 40);
    doc.text(`Total horas: ${r.totalHours.toFixed(1)} h`, 14, 46);
    doc.text(`Enviado: ${r.dateStr} ${r.timeStr}`, 14, 52);
    if (r.tasks) {
      doc.setFontSize(10);
      doc.text("Tareas:", 14, 62);
      const taskLines = doc.splitTextToSize(r.tasks, 180);
      doc.text(taskLines, 14, 68);
    }
    if (r.notes) {
      const noteY = r.tasks ? 68 + Math.min(60, doc.splitTextToSize(r.tasks, 180).length * 5) : 68;
      doc.text("Notas:", 14, noteY);
      const noteLines = doc.splitTextToSize(r.notes, 180);
      doc.text(noteLines, 14, noteY + 6);
    }
    // Embed image on next page if available
    if (r.photoBase64) {
      doc.addPage();
      doc.setFontSize(11);
      doc.text(`Imagen del parte - ${r.workerName} (${r.weekStart} → ${r.weekEnd})`, 14, 15);
      try {
        const mime = r.photoBase64.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        doc.addImage(r.photoBase64, mime, 14, 22, 180, 240, undefined, 'FAST');
      } catch (e) { /* ignore */ }
    }
    doc.save(`parte_${r.workerName.replace(/\s+/g, '_')}_${r.weekStart}.pdf`);
  };

  const handleExportReportsCSV = () => {
    const escape = (v: string) => `"${(v || '').replace(/"/g, '""')}"`;
    const header = ['Trabajador', 'Semana Inicio', 'Semana Fin', 'Horas', 'Obra', 'Tareas', 'Notas', 'Enviado'];
    const rows = filteredWeeklyReports.map(r => [
      r.workerName,
      r.weekStart,
      r.weekEnd,
      r.totalHours.toFixed(1),
      r.siteName || '',
      (r.tasks || '').replace(/\n/g, ' | '),
      (r.notes || '').replace(/\n/g, ' | '),
      `${r.dateStr} ${r.timeStr}`
    ].map(escape).join(','));
    // BOM for Excel UTF-8 compatibility
    const csv = '\uFEFF' + [header.map(escape).join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `partes_semanales_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredWeeklyReports = useMemo(() => {
    return weeklyReports.filter(r => {
      const matchesWorker = !reportsFilterWorker || r.workerId === reportsFilterWorker;
      const matchesWeek = !reportsFilterWeek || (r.weekStart <= reportsFilterWeek && r.weekEnd >= reportsFilterWeek);
      const q = reportsSearch.toLowerCase();
      const matchesSearch = !q || r.workerName.toLowerCase().includes(q) || (r.siteName || '').toLowerCase().includes(q) || (r.tasks || '').toLowerCase().includes(q);
      return matchesWorker && matchesWeek && matchesSearch;
    }).sort((a, b) => b.createdAt - a.createdAt);
  }, [weeklyReports, reportsFilterWorker, reportsFilterWeek, reportsSearch]);

  // Compute current week range
  const currentWeekRange = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    const diffToMonday = d.getDate() - day + (day === 0 ? -6 : 1);
    const start = new Date(d);
    start.setDate(diffToMonday); start.setHours(0,0,0,0);
    const end = new Date(start); end.setDate(start.getDate()+6); end.setHours(23,59,59,999);
    return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
  }, []);

  const workersWithCurrentWeekStatus = useMemo(() => {
    return workers.map(w => {
      const submitted = weeklyReports.some(r => r.workerId === w.id && r.weekStart === currentWeekRange.start);
      return { ...w, currentWeekSubmitted: submitted };
    });
  }, [workers, weeklyReports, currentWeekRange]);

  const monthlyComparison = useMemo(() => {
    // Filter weekly reports whose midpoint of the week falls in the selected month/year
    const monthStart = new Date(comparisonYear, comparisonMonth, 1).getTime();
    const monthEnd = new Date(comparisonYear, comparisonMonth + 1, 0, 23, 59, 59, 999).getTime();
    const reportsInMonth = weeklyReports.filter(r => {
      const ws = new Date(r.weekStart).getTime();
      const we = new Date(r.weekEnd).getTime();
      return we >= monthStart && ws <= monthEnd;
    });

    // Also include logs (clock-in time tracking) for the same period
    const logsInMonth = logs.filter(l => l.timestamp >= monthStart && l.timestamp <= monthEnd);

    const stats = workers.map(w => {
      const wReports = reportsInMonth.filter(r => r.workerId === w.id);
      const reportHours = wReports.reduce((sum, r) => sum + (r.totalHours || 0), 0);
      const wLogs = logsInMonth.filter(l => l.workerId === w.id);
      const { totalWork, totalBreak } = calculateTotalsFromLogs(wLogs);
      const fichajeHoursMs = totalWork;
      const sites = Array.from(new Set(wReports.map(r => r.siteName).filter(Boolean) as string[]));
      const submittedWeeks = new Set(wReports.map(r => r.weekStart));
      return {
        worker: w,
        reportCount: wReports.length,
        reportHours,
        fichajeHoursMs,
        breakMs: totalBreak,
        sites,
        submittedWeeks: submittedWeeks.size,
      };
    });

    const sorted = [...stats].sort((a, b) => {
      if (comparisonSortBy === 'name') return a.worker.name.localeCompare(b.worker.name);
      if (comparisonSortBy === 'reports') return b.reportCount - a.reportCount;
      return b.reportHours - a.reportHours; // hours
    });

    const totals = {
      reportCount: stats.reduce((s, x) => s + x.reportCount, 0),
      reportHours: stats.reduce((s, x) => s + x.reportHours, 0),
      fichajeHoursMs: stats.reduce((s, x) => s + x.fichajeHoursMs, 0),
      activeWorkers: stats.filter(x => x.reportCount > 0).length,
    };

    const maxHours = Math.max(1, ...stats.map(s => s.reportHours));
    return { stats: sorted, totals, maxHours };
  }, [workers, weeklyReports, logs, comparisonMonth, comparisonYear, comparisonSortBy]);

  const handleExportComparisonCSV = () => {
    const escape = (v: string) => `"${(v || '').replace(/"/g, '""')}"`;
    const header = ['Trabajador', 'DNI', 'Partes Enviados', 'Horas Reportadas', 'Horas Fichaje', 'Semanas con Parte', 'Obras'];
    const rows = monthlyComparison.stats.map(s => [
      s.worker.name,
      s.worker.dni || '',
      String(s.reportCount),
      s.reportHours.toFixed(1),
      formatMsToTime(s.fichajeHoursMs),
      String(s.submittedWeeks),
      s.sites.join(' | ')
    ].map(escape).join(','));
    const csv = '\uFEFF' + [header.map(escape).join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comparativa_${MONTH_NAMES[comparisonMonth]}_${comparisonYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportComparisonPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Comparativa Mensual — ${MONTH_NAMES[comparisonMonth]} ${comparisonYear}`, 14, 15);
    doc.setFontSize(9);
    doc.text(`Total partes: ${monthlyComparison.totals.reportCount}  •  Total horas: ${monthlyComparison.totals.reportHours.toFixed(1)}h  •  Trabajadores activos: ${monthlyComparison.totals.activeWorkers}`, 14, 22);
    const tableData = monthlyComparison.stats.map(s => [
      s.worker.name,
      String(s.reportCount),
      s.reportHours.toFixed(1) + 'h',
      formatMsToTime(s.fichajeHoursMs),
      String(s.submittedWeeks),
      s.sites.join(', ').slice(0, 50) || '-',
    ]);
    autoTable(doc, {
      head: [['Trabajador', 'Partes', 'Horas Reporte', 'Horas Fichaje', 'Semanas', 'Obras']],
      body: tableData,
      startY: 28,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [79, 70, 229] }
    });
    doc.save(`comparativa_${MONTH_NAMES[comparisonMonth]}_${comparisonYear}.pdf`);
  };

  const renderComparison = () => (
    <div className="space-y-4 animate-fadeIn pb-32" data-testid="admin-comparison-tab">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white uppercase flex items-center gap-2">
            Comparativa Mensual
            <BarChart3 className="text-amber-400" size={18} />
          </h2>
          <p className="text-[10px] text-stone-500 font-medium uppercase tracking-[0.18em]">Totales por trabajador</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            data-testid="comparison-month-select"
            value={comparisonMonth}
            onChange={(e) => setComparisonMonth(parseInt(e.target.value))}
            className="bg-stone-900 border border-stone-800 rounded-xl py-2 px-3 text-xs font-bold text-white outline-none focus:border-amber-500"
          >
            {MONTH_NAMES.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select
            data-testid="comparison-year-select"
            value={comparisonYear}
            onChange={(e) => setComparisonYear(parseInt(e.target.value))}
            className="bg-stone-900 border border-stone-800 rounded-xl py-2 px-3 text-xs font-bold text-white outline-none focus:border-amber-500"
          >
            {[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button data-testid="comparison-export-pdf-btn" onClick={handleExportComparisonPDF} className="flex items-center gap-2 px-3 py-2 rounded-xl font-black uppercase text-[10px] tracking-widest bg-rose-600/10 text-rose-400 border border-rose-500/20 hover:bg-rose-600/20 transition active:scale-95">
            <FileText size={12} /> PDF
          </button>
          <button data-testid="comparison-export-csv-btn" onClick={handleExportComparisonCSV} className="flex items-center gap-2 px-3 py-2 rounded-xl font-black uppercase text-[10px] tracking-widest bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-600/20 transition active:scale-95">
            <Download size={12} /> Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-stone-900 p-4 rounded-2xl border border-stone-800">
          <p className="text-[9px] text-stone-500 font-medium uppercase tracking-[0.18em]">Total Partes</p>
          <p className="text-2xl font-mono font-semibold text-white mt-1" data-testid="comparison-total-reports">{monthlyComparison.totals.reportCount}</p>
        </div>
        <div className="bg-stone-900 p-4 rounded-2xl border border-stone-800">
          <p className="text-[9px] text-stone-500 font-medium uppercase tracking-[0.18em]">Horas Reporte</p>
          <p className="text-2xl font-mono font-black text-amber-400 mt-1">{monthlyComparison.totals.reportHours.toFixed(1)}<span className="text-sm text-stone-600 ml-1">h</span></p>
        </div>
        <div className="bg-stone-900 p-4 rounded-2xl border border-stone-800">
          <p className="text-[9px] text-stone-500 font-medium uppercase tracking-[0.18em]">Horas Fichaje</p>
          <p className="text-2xl font-mono font-black text-sky-400 mt-1">{formatMsToTime(monthlyComparison.totals.fichajeHoursMs)}</p>
        </div>
        <div className="bg-stone-900 p-4 rounded-2xl border border-stone-800">
          <p className="text-[9px] text-stone-500 font-medium uppercase tracking-[0.18em]">Trabajadores Activos</p>
          <p className="text-2xl font-mono font-black text-emerald-400 mt-1">{monthlyComparison.totals.activeWorkers}<span className="text-sm text-stone-600 ml-1">/ {workers.length}</span></p>
        </div>
      </div>

      <div className="bg-stone-900 rounded-3xl border border-stone-800 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-stone-800">
          <h3 className="text-sm font-semibold text-white tracking-tight">Detalle por trabajador</h3>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-stone-500 font-medium uppercase tracking-[0.18em]">Ordenar:</span>
            {(['hours', 'reports', 'name'] as const).map(s => (
              <button
                key={s}
                data-testid={`comparison-sort-${s}`}
                onClick={() => setComparisonSortBy(s)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-medium uppercase tracking-[0.18em] transition ${comparisonSortBy === s ? 'bg-amber-600 text-white' : 'bg-stone-950 text-stone-500 border border-stone-800 hover:border-stone-700'}`}
              >
                {s === 'hours' ? 'Horas' : s === 'reports' ? 'Partes' : 'Nombre'}
              </button>
            ))}
          </div>
        </div>
        <div className="divide-y divide-stone-800">
          {monthlyComparison.stats.length === 0 && (
            <div className="text-center py-12 text-stone-500 text-xs font-medium uppercase tracking-[0.18em]">No hay trabajadores</div>
          )}
          {monthlyComparison.stats.map((s, idx) => {
            const pct = (s.reportHours / monthlyComparison.maxHours) * 100;
            const isInactive = s.reportCount === 0;
            return (
              <div key={s.worker.id} data-testid={`comparison-row-${s.worker.id}`} className={`p-4 flex items-center gap-4 ${isInactive ? 'opacity-50' : ''} hover:bg-stone-800/30 transition`}>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0 ${idx === 0 && !isInactive ? 'bg-amber-500/20 text-amber-400' : idx === 1 && !isInactive ? 'bg-stone-400/20 text-stone-300' : idx === 2 && !isInactive ? 'bg-orange-500/20 text-orange-400' : 'bg-stone-800 text-stone-500'}`}>
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className="text-sm font-semibold text-white uppercase truncate">{s.worker.name}</p>
                    <div className="flex items-center gap-3 shrink-0 text-right">
                      <div>
                        <p className="text-[8px] text-stone-500 font-medium uppercase tracking-[0.18em]">Partes</p>
                        <p className="text-sm font-mono font-semibold text-white">{s.reportCount}</p>
                      </div>
                      <div>
                        <p className="text-[8px] text-stone-500 font-medium uppercase tracking-[0.18em]">Horas</p>
                        <p className="text-sm font-mono font-black text-amber-400">{s.reportHours.toFixed(1)}h</p>
                      </div>
                      <div>
                        <p className="text-[8px] text-stone-500 font-medium uppercase tracking-[0.18em]">Fichaje</p>
                        <p className="text-sm font-mono font-black text-sky-400">{formatMsToTime(s.fichajeHoursMs)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="h-1.5 bg-stone-950 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isInactive ? 'bg-stone-700' : 'bg-gradient-to-r from-amber-500 to-orange-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {s.sites.length > 0 && (
                    <p className="text-[9px] text-stone-500 font-medium uppercase tracking-[0.18em] mt-1.5 truncate">
                      <span className="text-amber-400">Obras:</span> {s.sites.join(' • ')}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderWeeklyReports = () => (
    <div className="space-y-4 animate-fadeIn pb-32" data-testid="admin-weekly-reports-tab">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white uppercase flex items-center gap-2">
            Partes Semanales
            <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-400/30 rounded-md text-[9px] font-black text-amber-300 uppercase tracking-widest flex items-center gap-1">
              <Sparkles size={9} /> IA
            </span>
          </h2>
          <p className="text-[10px] text-stone-500 font-medium uppercase tracking-[0.18em]">Partes enviados por los trabajadores</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            data-testid="export-reports-pdf-btn"
            onClick={handleExportReportsPDF}
            disabled={filteredWeeklyReports.length === 0}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest transition active:scale-95 ${filteredWeeklyReports.length === 0 ? 'bg-stone-800 text-stone-600 cursor-not-allowed' : 'bg-rose-600/10 text-rose-400 border border-rose-500/20 hover:bg-rose-600/20'}`}
          >
            <FileText size={14} /> PDF
          </button>
          <button
            data-testid="export-reports-csv-btn"
            onClick={handleExportReportsCSV}
            disabled={filteredWeeklyReports.length === 0}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest transition active:scale-95 ${filteredWeeklyReports.length === 0 ? 'bg-stone-800 text-stone-600 cursor-not-allowed' : 'bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-600/20'}`}
          >
            <Download size={14} /> Excel
          </button>
        </div>
      </div>

      {/* Current week worker status grid */}
      <div className="bg-stone-900 p-5 rounded-3xl border border-stone-800">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white tracking-tight">Esta Semana</h3>
            <p className="text-[10px] text-stone-500 font-medium uppercase tracking-[0.18em]">{currentWeekRange.start} → {currentWeekRange.end}</p>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-medium uppercase tracking-[0.18em]">
            <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 size={12} /> Enviado</span>
            <span className="flex items-center gap-1 text-stone-500"><AlertCircle size={12} /> Pendiente</span>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {workersWithCurrentWeekStatus.map(w => (
            <button
              key={w.id}
              data-testid={`worker-week-status-${w.id}`}
              onClick={() => { setReportsFilterWorker(w.id); }}
              className={`p-3 rounded-2xl border text-left transition-all active:scale-95 ${w.currentWeekSubmitted ? 'bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-500/60' : 'bg-stone-950 border-stone-800 hover:border-stone-700'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] font-semibold text-white uppercase truncate">{w.name}</p>
                {w.currentWeekSubmitted ? <CheckCircle2 size={14} className="text-emerald-400 shrink-0" /> : <AlertCircle size={14} className="text-stone-500 shrink-0" />}
              </div>
              <p className={`text-[8px] font-medium uppercase tracking-[0.18em] ${w.currentWeekSubmitted ? 'text-emerald-400' : 'text-stone-500'}`}>
                {w.currentWeekSubmitted ? 'Parte Enviado' : 'Sin Parte'}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-stone-900 p-4 rounded-3xl border border-stone-800 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -transtone-y-1/2 text-stone-500" />
          <input
            data-testid="reports-search-input"
            type="text"
            placeholder="Buscar trabajador, obra o tareas..."
            value={reportsSearch}
            onChange={(e) => setReportsSearch(e.target.value)}
            className="w-full bg-stone-950 border border-stone-800 rounded-xl py-2.5 pl-9 pr-3 text-xs text-white outline-none focus:border-amber-500"
          />
        </div>
        <select
          data-testid="reports-filter-worker"
          value={reportsFilterWorker}
          onChange={(e) => setReportsFilterWorker(e.target.value)}
          className="bg-stone-950 border border-stone-800 rounded-xl py-2.5 px-3 text-xs text-white outline-none focus:border-amber-500"
        >
          <option value="">Todos los trabajadores</option>
          {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <input
          data-testid="reports-filter-week"
          type="date"
          value={reportsFilterWeek}
          onChange={(e) => setReportsFilterWeek(e.target.value)}
          placeholder="Filtrar por semana"
          className="bg-stone-950 border border-stone-800 rounded-xl py-2.5 px-3 text-xs text-white outline-none focus:border-amber-500 [color-scheme:dark]"
        />
      </div>

      {/* Reports list */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredWeeklyReports.length === 0 ? (
          <div className="col-span-full text-center py-16 bg-stone-900/30 rounded-[3rem] border border-dashed border-stone-800">
            <FileText size={32} className="text-stone-700 mx-auto mb-3" />
            <p className="text-stone-500 text-xs font-medium uppercase tracking-[0.18em]">No hay partes que coincidan con los filtros</p>
          </div>
        ) : filteredWeeklyReports.map(report => (
          <div key={report.id} data-testid={`weekly-report-card-${report.id}`} className="bg-stone-900 rounded-3xl border border-stone-800 overflow-hidden flex flex-col hover:border-amber-500/40 transition group">
            <div className="relative h-40 bg-stone-950 overflow-hidden cursor-pointer" onClick={() => setViewingReport(report)}>
              {report.photoBase64 ? (
                <img src={report.photoBase64} alt="Parte" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-stone-700"><FileImage size={32} /></div>
              )}
              <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 backdrop-blur-md rounded-full text-[9px] font-semibold text-white uppercase tracking-widest flex items-center gap-1">
                <Calendar size={9} /> {report.weekStart} → {report.weekEnd}
              </div>
              {report.extracted?.totalHours != null && (
                <div className="absolute top-2 right-2 px-2 py-1 bg-amber-500/80 backdrop-blur-md rounded-full text-[9px] font-semibold text-white uppercase tracking-widest flex items-center gap-1">
                  <Sparkles size={9} /> IA
                </div>
              )}
            </div>
            <div className="p-4 flex flex-col gap-2 flex-1">
              <div className="flex justify-between items-start">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white uppercase truncate">{report.workerName}</p>
                  <p className="text-[10px] text-amber-400 font-bold uppercase truncate">{report.siteName || '—'}</p>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className="text-base font-mono font-semibold text-white">{report.totalHours.toFixed(1)}h</p>
                  <p className="text-[8px] text-stone-500 font-medium uppercase tracking-[0.18em]">horas</p>
                </div>
              </div>
              {report.tasks && (
                <p className="text-[10px] text-stone-400 line-clamp-2 leading-relaxed">{report.tasks}</p>
              )}
              <div className="flex items-center justify-between gap-2 pt-2 mt-auto border-t border-stone-800">
                <span className="text-[8px] text-stone-600 font-medium uppercase tracking-[0.18em]">{report.dateStr} • {report.timeStr}</span>
                <div className="flex gap-1">
                  <button data-testid={`view-report-${report.id}`} onClick={() => setViewingReport(report)} className="p-1.5 text-amber-400 hover:text-amber-300 transition" title="Ver detalle"><Eye size={14} /></button>
                  <button data-testid={`download-report-${report.id}`} onClick={() => handleExportSingleReportPDF(report)} className="p-1.5 text-emerald-400 hover:text-emerald-300 transition" title="Descargar PDF"><Download size={14} /></button>
                  {isSuperAdmin && (
                    <button data-testid={`delete-report-${report.id}`} onClick={() => setReportToDelete(report.id)} className="p-1.5 text-rose-500 hover:text-rose-400 transition"><Trash2 size={14} /></button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
  const filteredSites = sites.filter(s => s.name.toLowerCase().includes(siteSearchQuery.toLowerCase()));
  const filteredWorkers = workers.filter(w => w.name.toLowerCase().includes(workerSearchQuery.toLowerCase()));
  
  const filteredTools = useMemo(() => {
    return tools.filter(t => {
      const matchesSearch = t.toolName.toLowerCase().includes(toolSearchQuery.toLowerCase()) || t.brand.toLowerCase().includes(toolSearchQuery.toLowerCase());
      const matchesWorker = !toolFilterWorker || t.workerId === toolFilterWorker;
      const matchesSite = !toolFilterSite || t.siteId === toolFilterSite;
      return matchesSearch && matchesWorker && matchesSite;
    });
  }, [tools, toolSearchQuery, toolFilterWorker, toolFilterSite]);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesSearch = !logSearchQuery || log.workerName.toLowerCase().includes(logSearchQuery.toLowerCase()) || log.siteName.toLowerCase().includes(logSearchQuery.toLowerCase());
      const matchesWorker = !logFilterWorker || log.workerId === logFilterWorker;
      const matchesSite = !logFilterSite || log.siteId === logFilterSite;
      const matchesType = !logFilterType || log.type === logFilterType;
      let matchesDate = true; if (logFilterDate) { const d = new Date(logFilterDate).toLocaleDateString('es-ES'); matchesDate = log.dateStr === d; }
      return matchesSearch && matchesWorker && matchesSite && matchesType && matchesDate;
    });
  }, [logs, logSearchQuery, logFilterWorker, logFilterSite, logFilterType, logFilterDate]);

  const sidebarItems = useMemo(() => {
    const baseItems = [
      { id: 'dashboard', icon: BarChart3, label: 'Panel' },
      { id: 'workers', icon: Users, label: 'Personal' },
      { id: 'hours', icon: History, label: 'Horas' },
      { id: 'reports', icon: FileText, label: 'Partes' },
      { id: 'comparison', icon: BarChart3, label: 'Comparativa' },
      { id: 'payrolls', icon: ScrollText, label: 'Nóminas' },
      { id: 'sites', icon: MapPin, label: 'Obras' },
      { id: 'logs', icon: ClipboardList, label: 'Registros' },
      { id: 'tools', icon: Wrench, label: 'Equipos' },
    ];
    if (isSuperAdmin) { baseItems.push({ id: 'admins', icon: Shield, label: 'Admins' }, { id: 'settings', icon: Settings, label: 'Ajustes' }); }
    return baseItems;
  }, [isSuperAdmin]);

  const renderDashboard = () => (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 animate-fadeIn">
      <div className="bg-stone-900 p-6 rounded-[2rem] border border-stone-800 shadow-xl"><Users className="text-amber-500 mb-2" size={32} /><h4 className="text-2xl font-semibold text-white">{workers.length}</h4><p className="text-[10px] text-stone-500 font-bold uppercase">Personal</p></div>
      <div className="bg-stone-900 p-6 rounded-[2rem] border border-stone-800 shadow-xl"><MapPin className="text-emerald-500 mb-2" size={32} /><h4 className="text-2xl font-semibold text-white">{sites.length}</h4><p className="text-[10px] text-stone-500 font-bold uppercase">Obras</p></div>
      <div className="col-span-2 md:col-span-1 bg-stone-900 p-6 rounded-[2rem] border border-stone-800 shadow-xl"><Zap className="text-amber-500 mb-2" size={32} /><h4 className="text-2xl font-semibold text-white">{logs.filter(l => l.dateStr === new Date().toLocaleDateString('es-ES')).length}</h4><p className="text-[10px] text-stone-500 font-bold uppercase">Fichajes Hoy</p></div>
    </div>
  );

  const renderHoursReport = () => (
    <div className="space-y-4 animate-fadeIn pb-32">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white uppercase">Reporte de Horas</h2>
          <p className="text-[10px] text-stone-500 font-medium uppercase tracking-[0.18em]">Cálculo de tiempos por jornada</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -transtone-y-1/2 text-stone-500" size={14} />
            <input type="text" placeholder="Buscar operario..." className="bg-stone-900 border border-stone-800 rounded-xl py-2.5 pl-9 pr-4 text-xs text-white outline-none w-full sm:w-48" value={hoursSearchQuery} onChange={(e) => setHoursSearchQuery(e.target.value)} />
          </div>
          <input type="date" className="bg-stone-900 border border-stone-800 rounded-xl py-2.5 px-3 text-xs text-white [color-scheme:dark]" value={hoursFilterDate} onChange={(e) => setHoursFilterDate(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-3">
        {dailyHoursStats.length > 0 ? (
          dailyHoursStats.map(stat => (
            <div key={stat.key} className="bg-stone-900 p-4 rounded-3xl border border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                  <Users size={18} />
                </div>
                <div>
                  <p className="font-semibold text-white text-sm uppercase leading-tight">{stat.workerName}</p>
                  <p className="text-[9px] text-stone-500 font-medium uppercase tracking-[0.18em]">{stat.dateStr}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-2 sm:gap-6">
                <div className="flex flex-col">
                  <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Trabajo</span>
                  <span className="text-xs font-mono font-semibold text-white">{formatMsToTime(stat.workMs)}</span>
                </div>
                <div className="flex flex-col border-x border-stone-800 px-2 sm:px-6">
                  <span className="text-[8px] font-black text-amber-500 uppercase tracking-widest">Descanso</span>
                  <span className="text-xs font-mono font-semibold text-white">{formatMsToTime(stat.breakMs)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[8px] font-black text-sky-400 uppercase tracking-widest">Total</span>
                  <span className="text-xs font-mono font-semibold text-white">{formatMsToTime(stat.totalMs)}</span>
                </div>
              </div>

              {stat.isCurrentlyActive && (
                <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full shrink-0">
                  <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                  <span className="text-[8px] font-black text-amber-500 uppercase tracking-widest">Activo</span>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="text-center py-20 bg-stone-900/30 rounded-[3rem] border border-dashed border-stone-800">
            <p className="text-stone-500 text-xs font-medium uppercase tracking-[0.18em]">No hay registros para este día</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderLogs = () => (
    <div className="space-y-4 animate-fadeIn pb-32">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white uppercase">Registros de Actividad</h2>
          <p className="text-[10px] text-stone-500 font-medium uppercase tracking-[0.18em]">Historial completo con verificación GPS</p>
        </div>
        <div className="flex gap-2">
          {isSuperAdmin && (
            <button onClick={() => setIsClearLogsConfirmOpen(true)} className="bg-rose-600/10 border border-rose-500/30 text-rose-500 px-4 py-2 rounded-xl text-[10px] font-medium uppercase tracking-[0.18em] flex items-center gap-2 hover:bg-rose-600 hover:text-white transition-all">
              <RotateCcw size={14} /> Vaciar Historial
            </button>
          )}
          <button onClick={() => setShowLogFilters(!showLogFilters)} className={`p-3 rounded-xl transition ${showLogFilters ? 'bg-amber-500 text-white' : 'bg-stone-900 text-stone-400'}`}>
            <ListFilter size={20} />
          </button>
          <button onClick={handleExportPDF} className="bg-emerald-600 p-3 rounded-xl text-white">
            <Download size={20} />
          </button>
        </div>
      </div>

      {showLogFilters && (
        <div className="bg-stone-900 p-6 rounded-3xl border border-stone-800 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 animate-slideDown">
          <div className="space-y-1.5">
            <label className="text-[8px] font-black text-stone-500 uppercase ml-1">Buscar</label>
            <input type="text" className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-xs text-white outline-none" value={logSearchQuery} onChange={(e) => setLogSearchQuery(e.target.value)} placeholder="Operario o obra..." />
          </div>
          <div className="space-y-1.5">
            <label className="text-[8px] font-black text-stone-500 uppercase ml-1">Operario</label>
            <select className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-xs text-white outline-none" value={logFilterWorker} onChange={(e) => setLogFilterWorker(e.target.value)}>
              <option value="">Todos</option>
              {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[8px] font-black text-stone-500 uppercase ml-1">Obra</label>
            <select className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-xs text-white outline-none" value={logFilterSite} onChange={(e) => setLogFilterSite(e.target.value)}>
              <option value="">Todas</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[8px] font-black text-stone-500 uppercase ml-1">Fecha</label>
            <input type="date" className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-xs text-white [color-scheme:dark] outline-none" value={logFilterDate} onChange={(e) => setLogFilterDate(e.target.value)} />
          </div>
        </div>
      )}

      <div className="overflow-x-auto bg-stone-900 rounded-3xl border border-stone-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-stone-950 border-b border-stone-800">
            <tr>
              <th className="p-4 font-black uppercase text-stone-500">Fecha/Hora</th>
              <th className="p-4 font-black uppercase text-stone-500">Operario</th>
              <th className="p-4 font-black uppercase text-stone-500">Obra</th>
              <th className="p-4 font-black uppercase text-stone-500">Tipo</th>
              <th className="p-4 font-black uppercase text-stone-500">Reporte</th>
              <th className="p-4 font-black uppercase text-stone-500">Ubicación GPS</th>
              {isSuperAdmin && <th className="p-4 font-black uppercase text-stone-500 text-right">Acciones</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-800">
            {filteredLogs.map(log => (
              <tr key={log.id} className="hover:bg-stone-800/50 transition">
                <td className="p-4">
                  <div className="font-bold text-white">{log.dateStr}</div>
                  <div className="text-[10px] text-stone-500">{log.timeStr}</div>
                </td>
                <td className="p-4 font-bold text-white uppercase">{log.workerName}</td>
                <td className="p-4 font-bold text-sky-400 uppercase">{log.siteName}</td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <LogIcon type={log.type} size={14} />
                    <span className="font-black tracking-tight">{log.type}</span>
                  </div>
                </td>
                <td className="p-4">
                  <p className="max-w-[150px] truncate text-stone-400">{log.workReport || '-'}</p>
                </td>
                <td className="p-4">
                   <div className="flex flex-col gap-1.5">
                      {log.locationWarning ? (
                        <div className="text-rose-500 flex items-center gap-1">
                          <AlertTriangle size={14} />
                          <span className="font-black text-[9px] uppercase tracking-widest">Lejos ({log.distanceMeters}m)</span>
                        </div>
                      ) : (
                        <div className="text-emerald-500 flex items-center gap-1">
                          <CheckCircle2 size={14} />
                          <span className="font-black text-[9px] uppercase tracking-widest">OK (En Obra)</span>
                        </div>
                      )}
                      <a 
                        href={`https://www.google.com/maps?q=${log.location.latitude},${log.location.longitude}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-sky-400 hover:text-sky-300 transition-colors group"
                      >
                         <MapIcon size={12} className="group-hover:scale-110 transition-transform" />
                         <span className="font-bold text-[8px] uppercase tracking-widest border-b border-blue-400/30">Ver en Mapa</span>
                         <ExternalLink size={10} className="opacity-50" />
                      </a>
                   </div>
                </td>
                {isSuperAdmin && (
                  <td className="p-4 text-right">
                    <button 
                      onClick={() => setLogToDelete(log.id)}
                      className="p-2 text-rose-500/50 hover:text-rose-500 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderTools = () => (
    <div className="space-y-4 animate-fadeIn pb-32">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white uppercase">Inventario de Equipos</h2>
          <p className="text-[10px] text-stone-500 font-medium uppercase tracking-[0.18em]">Gestión de herramientas por operario</p>
        </div>
        <button onClick={() => handleOpenToolModal()} className="bg-amber-600 p-3 rounded-xl text-white self-end md:self-auto">
          <Plus size={20} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -transtone-y-1/2 text-stone-500" size={14} />
          <input type="text" placeholder="Buscar herramienta o marca..." className="w-full bg-stone-900 border border-stone-800 rounded-xl py-2.5 pl-9 pr-4 text-xs text-white outline-none" value={toolSearchQuery} onChange={(e) => setToolSearchQuery(e.target.value)} />
        </div>
        <select className="bg-stone-900 border border-stone-800 rounded-xl py-2.5 px-3 text-xs text-white outline-none" value={toolFilterWorker} onChange={(e) => setToolFilterWorker(e.target.value)}>
          <option value="">Responsables...</option>
          {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select className="bg-stone-900 border border-stone-800 rounded-xl py-2.5 px-3 text-xs text-white outline-none" value={toolFilterSite} onChange={(e) => setToolFilterSite(e.target.value)}>
          <option value="">Obras...</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTools.length > 0 ? (
          filteredTools.map(tool => (
            <div key={tool.id} className="bg-stone-900 p-5 rounded-[2rem] border border-stone-800 flex flex-col justify-between group hover:border-amber-500/50 transition-colors shadow-xl">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-amber-500/10 text-amber-500 rounded-2xl">
                  <Wrench size={24} />
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleOpenToolModal(tool)} className="p-2 text-stone-400 hover:text-white transition"><Pencil size={18} /></button>
                  <button onClick={() => StorageService.deleteTool(tool.id)} className="p-2 text-rose-500 hover:text-rose-400 transition"><Trash2 size={18} /></button>
                </div>
              </div>
              
              <div className="space-y-1 mb-4">
                <h3 className="font-semibold text-white text-base uppercase leading-tight truncate">{tool.toolName}</h3>
                <p className="text-[10px] text-amber-500 font-medium uppercase tracking-[0.18em]">{tool.brand} {tool.model}</p>
              </div>

              <div className="space-y-3 pt-4 border-t border-stone-800">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-stone-800 flex items-center justify-center text-stone-400"><Users size={14} /></div>
                  <div>
                    <p className="text-[8px] text-stone-500 font-medium uppercase tracking-[0.18em]">Operario</p>
                    <p className="text-[11px] font-bold text-white uppercase">{tool.workerName}</p>
                  </div>
                </div>
                {tool.siteName && (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-stone-800 flex items-center justify-center text-stone-400"><MapPin size={14} /></div>
                    <div>
                      <p className="text-[8px] text-stone-500 font-medium uppercase tracking-[0.18em]">Obra</p>
                      <p className="text-[11px] font-bold text-white uppercase truncate max-w-[150px]">{tool.siteName}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full text-center py-20 bg-stone-900/30 rounded-[3rem] border border-dashed border-stone-800">
            <p className="text-stone-500 text-xs font-medium uppercase tracking-[0.18em]">No hay herramientas registradas</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="max-w-2xl space-y-6 animate-fadeIn pb-32">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-white tracking-tight">Configuración General</h2>
          <p className="text-[10px] text-stone-500 font-medium uppercase tracking-[0.18em]">Personalización de CARMAGNE INSTAL SL</p>
        </div>
      </div>

      <div className="bg-stone-900 p-6 rounded-[2.5rem] border border-stone-800 shadow-xl space-y-8">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <ImageIcon className="text-amber-500" size={24} />
            <h3 className="text-sm font-semibold text-white uppercase tracking-widest">Identidad Visual (Logo)</h3>
          </div>
          
          <div className="flex flex-col md:flex-row items-center gap-6 p-6 bg-stone-950/50 rounded-3xl border border-stone-800">
            <div className="w-32 h-32 bg-stone-900 border border-stone-800 rounded-2xl flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
              {config.logoUrl ? (
                <img src={config.logoUrl} className="w-full h-full object-contain p-2" alt="Logo preview" />
              ) : (
                <Zap size={32} className="text-stone-800" />
              )}
            </div>
            <div className="flex-1 space-y-3">
              <p className="text-[10px] text-stone-500 font-bold leading-relaxed">
                <span className="text-amber-500 font-black uppercase">Guía:</span> Se recomienda un logo en formato PNG o SVG con fondo transparente. Aparecerá en el login y en el panel superior.
              </p>
              <div className="flex gap-2">
                <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                <button onClick={() => logoInputRef.current?.click()} className="flex-1 bg-amber-500 text-white py-3 rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 shadow-lg">
                  <Upload size={14} /> Subir Logo
                </button>
                {config.logoUrl && (
                  <button onClick={handleRemoveLogo} className="p-3 bg-rose-600/10 text-rose-500 rounded-xl border border-rose-500/20">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Smartphone className="text-emerald-500" size={24} />
            <h3 className="text-sm font-semibold text-white uppercase tracking-widest">Icono PWA / Favicon</h3>
          </div>
          
          <div className="flex flex-col md:flex-row items-center gap-6 p-6 bg-stone-950/50 rounded-3xl border border-stone-800">
            <div className="w-20 h-20 bg-stone-900 border border-stone-800 rounded-2xl flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
              {config.faviconUrl ? (
                <img src={config.faviconUrl} className="w-full h-full object-contain p-1" alt="Favicon preview" />
              ) : (
                <Smartphone size={24} className="text-stone-800" />
              )}
            </div>
            <div className="flex-1 space-y-3">
              <p className="text-[10px] text-stone-500 font-bold leading-relaxed">
                <span className="text-emerald-500 font-black uppercase">Guía:</span> Tamaño recomendado <span className="text-white">512x512 px</span>. Este icono se mostrará al instalar la aplicación en el móvil y en la pestaña del navegador.
              </p>
              <div className="flex gap-2">
                <input ref={faviconInputRef} type="file" accept="image/*" onChange={handleFaviconUpload} className="hidden" />
                <button onClick={() => faviconInputRef.current?.click()} className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 shadow-lg">
                  <Upload size={14} /> Subir Icono PWA
                </button>
                {config.faviconUrl && (
                  <button onClick={handleRemoveFavicon} className="p-3 bg-rose-600/10 text-rose-500 rounded-xl border border-rose-500/20">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t border-stone-800">
          <div className="flex items-center gap-3">
            <Database className="text-amber-500" size={24} />
            <h3 className="text-sm font-semibold text-white uppercase tracking-widest">Datos del Sistema</h3>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest ml-1">URL de Sincronización (Google Sheets)</label>
              <input type="text" className="w-full bg-stone-950 border border-stone-800 rounded-2xl p-4 text-xs text-sky-400 outline-none focus:border-amber-500" value={config.googleSheetUrl} onChange={(e)=>setConfig({...config, googleSheetUrl: e.target.value})} placeholder="https://script.google.com/..."/>
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest ml-1">Contraseña Administrador Principal</label>
              <div className="relative">
                <input
                  type={showAdminConfigPwd ? 'text' : 'password'}
                  data-testid="admin-config-password-input"
                  className="w-full bg-stone-950 border border-stone-800 rounded-2xl p-4 pr-20 text-xs text-amber-400 outline-none focus:border-amber-500"
                  value={config.adminPassword}
                  onChange={(e)=>setConfig({...config, adminPassword: e.target.value})}
                />
                <button
                  type="button"
                  data-testid="admin-config-password-toggle"
                  onClick={() => setShowAdminConfigPwd(v => !v)}
                  className="absolute right-12 top-1/2 -transtone-y-1/2 text-stone-500 hover:text-amber-400 transition"
                  aria-label={showAdminConfigPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showAdminConfigPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <Lock className="absolute right-4 top-1/2 -transtone-y-1/2 text-stone-700" size={16}/>
              </div>
            </div>
          </div>
        </div>

        <button onClick={handleSaveConfig} disabled={isSaving} className={`w-full ${isSaving ? 'bg-stone-800 cursor-wait' : 'bg-amber-500 hover:bg-amber-400 active:scale-[0.98]'} text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-2xl transition-all flex items-center justify-center gap-3`}>
          {isSaving ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : <Save size={18} />}
          {isSaving ? 'Guardando Cambios...' : 'Guardar Toda la Configuración'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-stone-950 text-white overflow-hidden">
      {showSaveSuccess && (
        <div className="fixed top-8 left-1/2 -transtone-x-1/2 z-[200] animate-fadeIn">
          <div className="bg-emerald-600 text-white px-6 py-3 rounded-full flex items-center gap-3 shadow-2xl border border-emerald-500/30">
            <Check size={18} strokeWidth={3} />
            <span className="text-xs font-medium uppercase tracking-[0.18em]">Configuración Guardada</span>
          </div>
        </div>
      )}

      <aside className="hidden md:flex flex-col w-64 border-r border-stone-900 p-6 gap-8 bg-stone-950">
        <div className="flex items-center gap-3">
          <AppLogo size="sm" logoUrl={config.logoUrl} scale={config.logoScaleDashboard} />
          <h1 className="text-xs font-black tracking-tighter uppercase leading-tight">CARMAGNE<br/>INSTAL SL</h1>
        </div>
        <nav className="flex flex-col gap-2">
          {sidebarItems.map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id as any)} className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition ${activeTab === item.id ? 'bg-amber-500 text-white shadow-lg' : 'text-stone-500 hover:text-white hover:bg-stone-900'}`}>
              <item.icon size={20} />{item.label}
            </button>
          ))}
        </nav>
        <button onClick={() => setIsLogoutConfirmOpen(true)} className="mt-auto flex items-center gap-3 px-4 py-3 text-rose-500 font-bold hover:bg-rose-500/10 rounded-2xl transition">
          <LogOut size={20} /> Salir
        </button>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-14 border-b border-stone-900 flex items-center justify-between px-6 bg-stone-950/50 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsLogoutConfirmOpen(true)} className="md:hidden p-2 bg-stone-900 rounded-xl text-stone-400"><ArrowLeft size={18}/></button>
            <span className="text-xs font-semibold text-white uppercase tracking-widest leading-none">{activeTab}</span>
          </div>
          <div className="flex items-center gap-3">
             <div className="flex items-center gap-4">
                <div className="hidden sm:flex flex-col items-end">
                   <span className="text-[8px] font-black text-stone-500 uppercase tracking-widest leading-none">Conectado como</span>
                   <span className="text-[10px] font-black text-sky-400 tracking-tight">
                     {isSuperAdmin ? 'Admin Principal' : `Hola, ${currentUser?.username}`}
                   </span>
                </div>
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                  <Shield size={16}/>
                </div>
             </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'workers' && (
            <div className="space-y-4 animate-fadeIn pb-32">
              <div className="flex justify-between items-center"><h2 className="text-xl font-semibold text-white uppercase">Personal</h2><button className="bg-amber-500 p-3 rounded-xl text-white"><UserPlus size={20}/></button></div>
              <div className="grid gap-2">{filteredWorkers.map(w=>(<div key={w.id} className="bg-stone-900 p-4 rounded-2xl border border-stone-800 flex justify-between items-center"><div><p className="font-semibold text-white text-sm uppercase">{w.name}</p><p className="text-[9px] text-stone-500 font-medium uppercase tracking-[0.18em]">{w.dni || 'S/DNI'}</p></div><div className="flex gap-1"><button onClick={()=>setReportModal({...reportModal, isOpen:true, worker:w})} className="p-2 text-emerald-500"><FileText size={20}/></button><button onClick={()=>StorageService.deleteWorker(w.id)} className="p-2 text-rose-500"><Trash2 size={20}/></button></div></div>))}</div>
            </div>
          )}
          {activeTab === 'hours' && renderHoursReport()}
          {activeTab === 'sites' && (
            <div className="space-y-4 animate-fadeIn pb-32">
              <div className="flex justify-between items-center"><h2 className="text-xl font-semibold text-white uppercase">Obras</h2><button onClick={() => handleOpenSiteModal()} className="bg-emerald-600 p-3 rounded-xl text-white"><Plus size={20}/></button></div>
              <div className="grid gap-3">{filteredSites.map(s=>(<div key={s.id} className="bg-stone-900 p-4 rounded-3xl border border-stone-800 flex justify-between items-center active:bg-stone-800"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center"><MapPin size={18}/></div><div className="max-w-[150px]"><p className="font-semibold text-white text-sm truncate uppercase leading-tight">{s.name}</p><p className="text-[9px] text-stone-500 font-bold uppercase truncate">{s.address}</p></div></div><div className="flex gap-1"><button onClick={()=>handleOpenSiteModal(s)} className="p-2 text-stone-400"><Pencil size={20}/></button><button onClick={()=>StorageService.deleteSite(s.id)} className="p-2 text-rose-500"><Trash2 size={20}/></button></div></div>))}</div>
            </div>
          )}
          {activeTab === 'logs' && renderLogs()}
          {activeTab === 'tools' && renderTools()}
          {activeTab === 'reports' && renderWeeklyReports()}
          {activeTab === 'comparison' && renderComparison()}
          {activeTab === 'payrolls' && <PayrollAdminPanel workers={workers} payrolls={payrolls} isSuperAdmin={isSuperAdmin} adminUsername={currentUser?.username || 'admin'} />}
          {activeTab === 'admins' && isSuperAdmin && (
             <div className="space-y-6 animate-fadeIn pb-32"><div className="flex justify-between items-center"><h2 className="text-xl font-semibold text-white uppercase">Cuentas Admin</h2><button onClick={() => setIsAdminModalOpen(true)} className="bg-amber-600 p-3 rounded-xl text-white"><UserPlus size={20} /></button></div><div className="grid gap-3">{admins.map(admin => (<div key={admin.id} className="bg-stone-900 p-4 rounded-3xl border border-stone-800 flex justify-between items-center"><div className="flex items-center gap-4"><div className="w-10 h-10 bg-stone-800 rounded-2xl flex items-center justify-center text-stone-400 border border-stone-700"><KeyRound size={20} /></div><div><h3 className="text-sm font-semibold text-white">{admin.username}</h3><p className="text-[10px] text-stone-500 font-medium uppercase tracking-[0.18em]">Gestor</p></div></div><button onClick={() => StorageService.deleteAdmin(admin.id)} className="p-2 text-rose-500"><Trash2 size={20} /></button></div>))}</div></div>
          )}
          {activeTab === 'settings' && isSuperAdmin && renderSettings()}
        </div>

        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-stone-950/95 backdrop-blur-2xl border-t border-white/10 flex items-center justify-around py-3 px-4 z-50 shadow-2xl">
          {sidebarItems.map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id as any)} className={`flex flex-col items-center gap-1 transition-all ${activeTab === item.id ? 'text-amber-500' : 'text-stone-500'}`}>
              <item.icon size={20} className={activeTab === item.id ? 'drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]' : ''} />
              <span className="text-[7px] font-black tracking-tight">{item.label}</span>
            </button>
          ))}
        </nav>
      </main>

      {isToolModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-fadeIn">
          <div className="bg-stone-900 w-full max-w-sm rounded-[2.5rem] border border-stone-800 p-8 shadow-2xl relative">
            <div className="flex justify-between items-center mb-6"><div><h3 className="text-lg font-semibold text-white tracking-tight">{editingTool ? 'Editar Equipo' : 'Nuevo Equipo'}</h3><p className="text-amber-500 text-[10px] font-bold uppercase">Gestión Inventario</p></div><button onClick={() => setIsToolModalOpen(false)} className="text-stone-500 p-2"><X size={20}/></button></div>
            <div className="space-y-4">
              <input type="text" placeholder="Nombre de Herramienta" className="w-full bg-stone-950 border border-stone-800 rounded-xl p-4 text-sm text-white outline-none focus:border-amber-500" value={toolForm.toolName} onChange={(e)=>setToolForm({...toolForm, toolName: e.target.value})}/>
              <input type="text" placeholder="Marca" className="w-full bg-stone-950 border border-stone-800 rounded-xl p-4 text-sm text-white outline-none focus:border-amber-500" value={toolForm.brand} onChange={(e)=>setToolForm({...toolForm, brand: e.target.value})}/>
              <select className="w-full bg-stone-950 border border-stone-800 rounded-xl p-4 text-sm text-white outline-none focus:border-amber-500" value={toolForm.workerId} onChange={(e)=>setToolForm({...toolForm, workerId: e.target.value})}><option value="">Responsable...</option>{workers.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select>
              <select className="w-full bg-stone-950 border border-stone-800 rounded-xl p-4 text-sm text-white outline-none focus:border-amber-500" value={toolForm.siteId} onChange={(e)=>setToolForm({...toolForm, siteId: e.target.value})}><option value="">Obra (Opcional)...</option>{sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
              {toolModalError && <p className="text-rose-500 text-[10px] font-bold text-center uppercase">{toolModalError}</p>}
              <button onClick={handleSaveTool} className="w-full bg-amber-600 text-white py-4 rounded-xl font-black uppercase text-xs shadow-lg active:scale-95 transition">Guardar Equipo</button>
            </div>
          </div>
        </div>
      )}

      {isSiteModalOpen && (<div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-fadeIn"><div className="bg-stone-900 w-full max-w-sm rounded-[2.5rem] border border-stone-800 p-8 shadow-2xl relative overflow-hidden"><div className="flex justify-between items-center mb-6"><div><h3 className="text-lg font-semibold text-white tracking-tight">{editingSite ? 'Editar Obra' : 'Nueva Obra'}</h3><p className="text-emerald-500 text-[10px] font-medium uppercase tracking-[0.18em]">Ubicación</p></div><button onClick={() => setIsSiteModalOpen(false)} className="text-stone-500 hover:text-white p-2"><X size={20} /></button></div><div className="space-y-4"><input type="text" placeholder="Obra" className="w-full bg-stone-950 border border-stone-800 rounded-2xl p-4 text-sm text-white" value={siteForm.name} onChange={(e) => setSiteForm({ ...siteForm, name: e.target.value })}/><textarea placeholder="Dirección" className="w-full bg-stone-950 border border-stone-800 rounded-2xl p-4 text-sm text-white h-20 resize-none" value={siteForm.address} onChange={(e) => setSiteForm({ ...siteForm, address: e.target.value })}/><button onClick={handleSaveSite} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black uppercase text-xs mt-2">{editingSite ? 'Guardar' : 'Crear'}</button></div></div></div>)}

      {reportModal.isOpen && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-fadeIn">
          <div className="bg-stone-900 w-full max-w-sm rounded-[2.5rem] border border-stone-800 p-8 shadow-2xl relative">
             <h3 className="text-lg font-semibold text-white uppercase mb-6 leading-none tracking-tighter">Generar Informe PDF</h3>
             <div className="space-y-4">
                <div className="flex gap-2"><button onClick={()=>setReportModal({...reportModal, type:'WEEK'})} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase transition ${reportModal.type==='WEEK'?'bg-amber-500 text-white shadow-lg':'bg-stone-950 text-stone-500'}`}>Semanal</button><button onClick={()=>setReportModal({...reportModal, type:'MONTH'})} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase transition ${reportModal.type==='MONTH'?'bg-amber-500 text-white shadow-lg':'bg-stone-950 text-stone-500'}`}>Mensual</button></div>
                {reportModal.type==='WEEK'?(<input type="date" value={reportModal.selectedDate} onChange={(e)=>setReportModal({...reportModal, selectedDate: e.target.value})} className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-xs text-white [color-scheme:dark]"/>):(<select value={reportModal.selectedMonth} onChange={(e)=>setReportModal({...reportModal, selectedMonth: parseInt(e.target.value)})} className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-xs text-white appearance-none">{MONTH_NAMES.map((m,i)=>(<option key={m} value={i}>{m}</option>))}</select>)}
                <button onClick={handleGenerateWorkerReport} className="w-full bg-emerald-600 text-white py-4 rounded-xl font-black uppercase text-xs flex items-center justify-center gap-2 active:scale-95 shadow-xl transition"><Download size={18}/> Descargar Informe</button>
                <button onClick={()=>setReportModal({...reportModal, isOpen: false})} className="w-full text-stone-500 text-[10px] font-black uppercase mt-2">Cancelar</button>
             </div>
          </div>
        </div>
      )}
      
      <ConfirmationModal isOpen={!!logToDelete} title="Borrar Registro" message="¿Estás seguro de que quieres eliminar este registro? Esta acción no se puede deshacer." confirmText="Borrar" isDestructive={true} onConfirm={handleDeleteLog} onCancel={() => setLogToDelete(null)} />
      
      <ConfirmationModal isOpen={isClearLogsConfirmOpen} title="Vaciar Todo el Historial" message="¡ATENCIÓN! Vas a eliminar TODOS los registros de actividad del sistema. Esta acción es definitiva." confirmText="VACIAR TODO" isDestructive={true} onConfirm={handleClearAllLogs} onCancel={() => setIsClearLogsConfirmOpen(false)} />

      <ConfirmationModal isOpen={isLogoutConfirmOpen} title="¿Cerrar Sesión?" message="Vas a salir del panel de administración." confirmText="Salir" cancelText="Permanecer" isDestructive={true} onConfirm={() => { setIsLogoutConfirmOpen(false); onBack(); }} onCancel={() => setIsLogoutConfirmOpen(false)} />

      <ConfirmationModal
        isOpen={!!reportToDelete}
        title="Borrar Parte Semanal"
        message="¿Seguro que quieres eliminar este parte semanal? Esta acción no se puede deshacer."
        confirmText="Borrar"
        isDestructive={true}
        onConfirm={async () => {
          if (reportToDelete) {
            await StorageService.deleteWeeklyReport(reportToDelete);
            setReportToDelete(null);
            if (viewingReport && viewingReport.id === reportToDelete) setViewingReport(null);
          }
        }}
        onCancel={() => setReportToDelete(null)}
      />

      {viewingReport && (
        <div className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 animate-fadeIn" data-testid="view-report-modal">
          <div className="bg-stone-900 w-full max-w-2xl rounded-[2rem] border border-stone-800 shadow-2xl relative overflow-hidden max-h-[95vh] flex flex-col">
            <div className="flex justify-between items-center p-5 border-b border-stone-800 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 bg-amber-600/10 rounded-xl text-amber-400 shrink-0"><FileText size={20} /></div>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-white tracking-tight truncate">{viewingReport.workerName}</h3>
                  <p className="text-[10px] text-amber-400 font-medium uppercase tracking-[0.18em]">{viewingReport.weekStart} → {viewingReport.weekEnd}</p>
                </div>
              </div>
              <button onClick={() => setViewingReport(null)} className="text-stone-500 hover:text-white p-2"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">
              <div className="flex gap-2">
                <button
                  data-testid="modal-download-pdf-btn"
                  onClick={() => handleExportSingleReportPDF(viewingReport)}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 shadow-lg transition"
                >
                  <Download size={14} /> Descargar PDF
                </button>
              </div>
              {viewingReport.photoBase64 && (
                <div className="rounded-2xl overflow-hidden border border-stone-800 bg-stone-950">
                  <img src={viewingReport.photoBase64} alt="Parte" className="w-full max-h-[60vh] object-contain" />
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-stone-950 border border-stone-800 rounded-2xl p-3">
                  <p className="text-[8px] text-stone-500 font-medium uppercase tracking-[0.18em]">Total Horas</p>
                  <p className="text-lg font-mono font-semibold text-white mt-1">{viewingReport.totalHours.toFixed(1)}</p>
                </div>
                <div className="bg-stone-950 border border-stone-800 rounded-2xl p-3">
                  <p className="text-[8px] text-stone-500 font-medium uppercase tracking-[0.18em]">Obra</p>
                  <p className="text-xs font-semibold text-white mt-1 truncate uppercase">{viewingReport.siteName || '—'}</p>
                </div>
                <div className="bg-stone-950 border border-stone-800 rounded-2xl p-3">
                  <p className="text-[8px] text-stone-500 font-medium uppercase tracking-[0.18em]">Enviado</p>
                  <p className="text-[11px] font-semibold text-white mt-1">{viewingReport.dateStr}</p>
                  <p className="text-[9px] text-stone-500 font-bold">{viewingReport.timeStr}</p>
                </div>
                <div className="bg-stone-950 border border-stone-800 rounded-2xl p-3">
                  <p className="text-[8px] text-stone-500 font-medium uppercase tracking-[0.18em]">Estado</p>
                  <p className="text-[11px] font-black mt-1 flex items-center gap-1 text-emerald-400"><CheckCircle2 size={12} /> {viewingReport.status}</p>
                </div>
              </div>
              {viewingReport.tasks && (
                <div>
                  <p className="text-[9px] text-stone-500 font-medium uppercase tracking-[0.18em] mb-2">Tareas Realizadas</p>
                  <div className="bg-stone-950 border border-stone-800 rounded-2xl p-4 text-xs text-stone-200 whitespace-pre-wrap leading-relaxed">{viewingReport.tasks}</div>
                </div>
              )}
              {viewingReport.notes && (
                <div>
                  <p className="text-[9px] text-stone-500 font-medium uppercase tracking-[0.18em] mb-2">Notas</p>
                  <div className="bg-stone-950 border border-stone-800 rounded-2xl p-4 text-xs text-stone-200 whitespace-pre-wrap leading-relaxed">{viewingReport.notes}</div>
                </div>
              )}
              {viewingReport.extracted && (viewingReport.extracted.rawText || viewingReport.extracted.daysWorked != null) && (
                <div>
                  <p className="text-[9px] text-amber-400 font-medium uppercase tracking-[0.18em] mb-2 flex items-center gap-1"><Sparkles size={10} /> Datos extraídos por IA</p>
                  <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 space-y-2 text-[11px] text-stone-300">
                    {viewingReport.extracted.daysWorked != null && (<p><span className="font-black text-amber-400">Días trabajados:</span> {viewingReport.extracted.daysWorked}</p>)}
                    {viewingReport.extracted.rawText && (<p className="leading-relaxed"><span className="font-black text-amber-400">Texto detectado:</span> {viewingReport.extracted.rawText}</p>)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
