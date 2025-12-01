import React, { useState, useEffect } from 'react';
import { StorageService } from '../services/storageService';
import { Worker, Site, WorkLog, AppConfig } from '../types';
import { 
  Users, MapPin, Download, Settings, FileText, 
  Trash2, Plus, Save, ExternalLink, Lock, Briefcase, Phone, QrCode, Printer, X, ShieldAlert, Code, Database, CloudOff, ClipboardList, Calendar
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

interface AdminPanelProps {
  onBack: () => void;
}

interface WorkerMonthlyReport {
  workerId: string;
  workerName: string;
  totalPresenceMs: number;
  totalBreakMs: number;
  netWorkMs: number;
  daysWorked: number;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'logs' | 'reports' | 'workers' | 'sites' | 'config'>('dashboard');
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [config, setConfig] = useState<AppConfig>(StorageService.getConfig());

  // Report State
  const [reportMonth, setReportMonth] = useState<string>(new Date().toISOString().slice(0, 7)); // YYYY-MM

  // Edit states
  const [newWorkerName, setNewWorkerName] = useState('');
  const [newWorkerPin, setNewWorkerPin] = useState('');
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteAddress, setNewSiteAddress] = useState('');
  
  // QR Print Mode State
  const [showQrPrintView, setShowQrPrintView] = useState(false);
  
  // Debug Mode State
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    refreshData();
  }, []);

  const refreshData = () => {
    setLogs(StorageService.getLogs());
    setWorkers(StorageService.getWorkers());
    setSites(StorageService.getSites());
    setConfig(StorageService.getConfig());
  };

  const handleExport = () => {
    if (!confirm('¿Está seguro que desea exportar todos los registros a CSV?')) {
      return;
    }
    const csv = StorageService.exportToCSV(logs);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Fichajes_CARMAGNE_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const handleAddWorker = () => {
    if (!newWorkerName || !newWorkerPin) {
      alert("Nombre y PIN son obligatorios");
      return;
    }
    const newWorker: Worker = {
      id: `W${Math.floor(Math.random() * 10000)}`,
      name: newWorkerName,
      qrCode: `QR_${Date.now()}`,
      active: true,
      pin: newWorkerPin,
      role: 'Trabajador' // Default role
    };
    const updated = [...workers, newWorker];
    StorageService.saveWorkers(updated);
    setNewWorkerName('');
    setNewWorkerPin('');
    refreshData();
  };

  const handleDeleteWorker = (id: string) => {
    if(!confirm('¿Seguro que desea eliminar este trabajador?')) return;
    const updated = workers.filter(w => w.id !== id);
    StorageService.saveWorkers(updated);
    refreshData();
  }

  const handleAddSite = () => {
    if (!newSiteName) return;
    const newSite: Site = {
      id: `S${Math.floor(Math.random() * 10000)}`,
      name: newSiteName,
      address: newSiteAddress,
      active: true
    };
    const updated = [...sites, newSite];
    StorageService.saveSites(updated);
    setNewSiteName('');
    setNewSiteAddress('');
    refreshData();
  };

  const handleDeleteSite = (id: string) => {
    if(!confirm('¿Seguro que desea eliminar esta obra?')) return;
    const updated = sites.filter(s => s.id !== id);
    StorageService.saveSites(updated);
    refreshData();
  };

  const saveConfig = () => {
    StorageService.saveConfig(config);
    alert('Configuración guardada');
  };

  // QR Generation Helper
  const getWorkerQrData = (w: Worker) => {
    // Generate the exact JSON structure requested
    const data = {
      id_trabajador: w.id,
      nombre: w.name,
      dni: w.dni || '',
      cargo: w.role || ''
    };
    return JSON.stringify(data);
  };

  const getQrImageUrl = (data: string) => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data)}`;
  };

  // --- REPORT LOGIC ---
  const generateMonthlyReport = (): WorkerMonthlyReport[] => {
    const [year, month] = reportMonth.split('-').map(Number);
    
    // 1. Filter logs for the selected month
    const monthlyLogs = logs.filter(log => {
      const d = new Date(log.timestamp);
      return d.getFullYear() === year && (d.getMonth() + 1) === month;
    });

    // 2. Sort chronologically (Oldest first)
    monthlyLogs.sort((a, b) => a.timestamp - b.timestamp);

    const reports: WorkerMonthlyReport[] = [];

    // 3. Process each worker
    workers.forEach(worker => {
      const workerLogs = monthlyLogs.filter(l => l.workerId === worker.id);
      
      let totalPresence = 0;
      let totalBreaks = 0;
      let daysSet = new Set<string>();

      // Logic: Iterate to find pairs. 
      // This is a basic algorithm: Find ENTRY, look for next EXIT. 
      // Find BREAK START, look for next BREAK END.
      
      let lastEntryTime: number | null = null;
      let lastBreakStartTime: number | null = null;

      for (const log of workerLogs) {
        daysSet.add(log.dateStr);

        if (log.type === 'ENTRADA') {
          if (lastEntryTime === null) {
            lastEntryTime = log.timestamp;
          }
        } else if (log.type === 'SALIDA') {
          if (lastEntryTime !== null) {
            totalPresence += (log.timestamp - lastEntryTime);
            lastEntryTime = null; // Reset for next shift
            // If they were on break and clocked out, close the break too
            if (lastBreakStartTime !== null) {
               totalBreaks += (log.timestamp - lastBreakStartTime);
               lastBreakStartTime = null;
            }
          }
        } else if (log.type === 'INICIO_DESCANSO') {
           if (lastBreakStartTime === null) {
             lastBreakStartTime = log.timestamp;
           }
        } else if (log.type === 'FIN_DESCANSO') {
           if (lastBreakStartTime !== null) {
             totalBreaks += (log.timestamp - lastBreakStartTime);
             lastBreakStartTime = null;
           }
        }
      }

      // If only logs exist, push to report
      if (workerLogs.length > 0) {
        reports.push({
          workerId: worker.id,
          workerName: worker.name,
          totalPresenceMs: totalPresence,
          totalBreakMs: totalBreaks,
          netWorkMs: Math.max(0, totalPresence - totalBreaks),
          daysWorked: daysSet.size
        });
      }
    });

    return reports;
  };

  const msToTime = (duration: number) => {
    const minutes = Math.floor((duration / (1000 * 60)) % 60);
    const hours = Math.floor((duration / (1000 * 60 * 60)));
    return `${hours}h ${minutes}m`;
  };

  // Chart Data Preparation
  const logsByType = [
    { name: 'Entrada', value: logs.filter(l => l.type === 'ENTRADA').length },
    { name: 'Salida', value: logs.filter(l => l.type === 'SALIDA').length },
    { name: 'Descansos', value: logs.filter(l => l.type.includes('DESCANSO')).length },
  ];
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28'];

  // QR PRINT VIEW
  if (showQrPrintView) {
    return (
      <div className="min-h-screen bg-white text-black p-8">
        <div className="no-print flex justify-between items-center mb-8 bg-slate-100 p-4 rounded-lg">
          <div>
            <h1 className="text-2xl font-bold">Fichas QR - CARMAGNE SOLU 2024</h1>
            <p className="text-slate-600">Imprima esta página para entregar los códigos a los trabajadores.</p>
          </div>
          <div className="flex gap-4">
             <button onClick={() => window.print()} className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2">
               <Printer size={20} /> Imprimir
             </button>
             <button onClick={() => setShowQrPrintView(false)} className="bg-slate-300 text-slate-800 px-4 py-2 rounded flex items-center gap-2">
               <X size={20} /> Cerrar
             </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {workers.filter(w => w.active).map(w => (
            <div key={w.id} className="border-2 border-slate-900 rounded-xl p-6 flex flex-col items-center text-center break-inside-avoid shadow-sm">
               <h2 className="text-xl font-black uppercase mb-1">{w.name}</h2>
               <p className="text-sm font-bold text-slate-600 mb-4">{w.role || 'Personal'}</p>
               
               <img 
                 src={getQrImageUrl(getWorkerQrData(w))} 
                 alt={`QR ${w.name}`}
                 className="w-48 h-48 border border-slate-200 rounded mb-4"
               />
               
               <div className="w-full text-left text-xs space-y-1 bg-slate-50 p-2 rounded border border-slate-200">
                 <p><span className="font-bold">ID:</span> {w.id}</p>
                 <p><span className="font-bold">DNI:</span> {w.dni || 'N/A'}</p>
                 <p><span className="font-bold">PIN:</span> **** (Confidencial)</p>
               </div>
               <div className="mt-4 text-[10px] text-slate-400 font-mono">
                 CARMAGNE SOLU 2024
               </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 pb-20">
      {/* Admin Header */}
      <header className="bg-slate-900 text-white p-4 sticky top-0 z-10 shadow-md flex justify-between items-center">
        <h1 className="text-xl font-bold text-yellow-400">Panel Administrador</h1>
        <button onClick={onBack} className="text-sm bg-slate-700 px-3 py-1 rounded hover:bg-slate-600">
          Volver a App
        </button>
      </header>

      {/* Navigation Tabs */}
      <div className="flex overflow-x-auto bg-white border-b border-slate-200">
        {[
          { id: 'dashboard', label: 'Dashboard', icon: FileText },
          { id: 'logs', label: 'Registros', icon: Database },
          { id: 'reports', label: 'Informes', icon: ClipboardList },
          { id: 'workers', label: 'Trabajadores', icon: Users },
          { id: 'sites', label: 'Obras', icon: MapPin },
          { id: 'config', label: 'Config', icon: Settings },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 min-w-[100px] py-4 flex flex-col items-center gap-1 text-sm font-medium transition-colors ${
              activeTab === tab.id 
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <tab.icon size={20} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-4 max-w-6xl mx-auto">
        
        {/* DASHBOARD TAB */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-500">
                   <h3 className="text-slate-500 text-sm uppercase">Total Registros</h3>
                   <p className="text-3xl font-bold">{logs.length}</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow border-l-4 border-yellow-400">
                   <h3 className="text-slate-500 text-sm uppercase">Obras Activas</h3>
                   <p className="text-3xl font-bold">{sites.filter(s => s.active).length}</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500">
                   <h3 className="text-slate-500 text-sm uppercase">Trabajadores</h3>
                   <p className="text-3xl font-bold">{workers.filter(w => w.active).length}</p>
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-4 rounded-lg shadow h-80">
                  <h3 className="font-bold mb-4">Actividad por Tipo</h3>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={logsByType} cx="50%" cy="50%" outerRadius={80} fill="#8884d8" dataKey="value" label>
                        {logsByType.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="bg-white p-4 rounded-lg shadow">
                   <h3 className="font-bold mb-4">Acciones Rápidas</h3>
                   <button 
                    onClick={handleExport}
                    className="w-full flex items-center justify-center gap-2 bg-green-600 text-white p-3 rounded-lg hover:bg-green-700 transition"
                   >
                     <Download size={20} /> Exportar Excel/CSV
                   </button>
                   <div className="mt-4 p-4 bg-yellow-50 text-yellow-800 text-sm rounded border border-yellow-200">
                     <p className="font-bold">Informe Mensual Automático:</p>
                     <p>El sistema genera automáticamente los totales al exportar. Para imprimir informe PDF individual, use la pestaña "Registros".</p>
                   </div>
                </div>
             </div>
          </div>
        )}

        {/* LOGS TAB */}
        {activeTab === 'logs' && (
          <div className="space-y-6">
            
            {/* Local Data Banner & Debug Toggle */}
            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-lg shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex gap-3">
                 <Database className="text-blue-500 flex-shrink-0" />
                 <div>
                    <h3 className="text-blue-900 font-bold text-sm uppercase">Almacenamiento Local (Local Storage)</h3>
                    <p className="text-sm text-blue-700 mt-1">
                      Mostrando <strong>{logs.length}</strong> registros almacenados en este dispositivo.
                      Estos datos están pendientes de sincronización manual o exportación.
                    </p>
                 </div>
              </div>
              <button 
                onClick={() => setShowDebug(!showDebug)}
                className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-bold border transition ${
                  showDebug 
                    ? 'bg-slate-800 text-white border-slate-900' 
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Code size={16} />
                {showDebug ? 'Ocultar JSON' : 'Ver JSON (Depuración)'}
              </button>
            </div>

            {/* RAW JSON VIEWER */}
            {showDebug && (
              <div className="bg-slate-900 rounded-lg p-4 shadow-inner border border-slate-700 relative group">
                <div className="absolute top-2 right-2 opacity-50 text-xs text-slate-400">Solo lectura</div>
                <pre className="text-green-400 font-mono text-xs overflow-auto max-h-96 p-2 custom-scrollbar">
                  {JSON.stringify(logs, null, 2)}
                </pre>
              </div>
            )}

            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-700 uppercase font-bold">
                    <tr>
                      <th className="p-3">Estado</th>
                      <th className="p-3">Fecha/Hora</th>
                      <th className="p-3">Trabajador</th>
                      <th className="p-3">Obra</th>
                      <th className="p-3">Acción</th>
                      <th className="p-3">Ubicación</th>
                      <th className="p-3">WA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.slice().reverse().map(log => (
                      <tr key={log.id} className={`border-b hover:bg-slate-50 ${log.locationWarning ? 'bg-red-50' : ''}`}>
                        <td className="p-3">
                           {log.syncedToSheets ? (
                             <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                               <Database size={10} /> Sync
                             </span>
                           ) : (
                             <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-200 text-slate-600 text-xs font-bold" title="Guardado localmente">
                               <CloudOff size={10} /> Pendiente
                             </span>
                           )}
                        </td>
                        <td className="p-3">
                          <div className="font-bold">{log.dateStr}</div>
                          <div className="text-slate-500">{log.timeStr}</div>
                        </td>
                        <td className="p-3 font-medium">{log.workerName}</td>
                        <td className="p-3">{log.siteName}</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${
                            log.type === 'ENTRADA' ? 'bg-green-100 text-green-800' :
                            log.type === 'SALIDA' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {log.type}
                          </span>
                        </td>
                        <td className="p-3 max-w-xs truncate" title={log.location.address}>
                          <div className="flex flex-col">
                             <a 
                              href={`https://www.google.com/maps?q=${log.location.latitude},${log.location.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline flex items-center gap-1"
                            >
                              <MapPin size={14} />
                              {log.location.address || "Ver en Mapa"}
                            </a>
                            {log.locationWarning && (
                              <span className="text-xs text-red-600 font-bold flex items-center gap-1 mt-1">
                                <ShieldAlert size={12}/> A {log.distanceMeters}m de Obra
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                           {log.sentToWhatsapp ? <span className="text-green-600 font-bold">Sí</span> : <span className="text-slate-400">No</span>}
                        </td>
                      </tr>
                    ))}
                    {logs.length === 0 && (
                      <tr><td colSpan={8} className="p-8 text-center text-slate-500">No hay registros locales aún.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* REPORTS TAB */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 p-3 rounded-full text-blue-600">
                    <ClipboardList size={24} />
                  </div>
                  <div>
                    <h2 className="font-bold text-xl">Informe Mensual de Horas</h2>
                    <p className="text-slate-500 text-sm">Cálculo de jornadas basado en Entradas y Salidas</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                   <Calendar size={20} className="text-slate-500"/>
                   <input 
                     type="month" 
                     value={reportMonth}
                     onChange={(e) => setReportMonth(e.target.value)}
                     className="border border-slate-300 rounded p-2 font-bold text-slate-700"
                   />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-xs">
                    <tr>
                      <th className="p-4 border-b">ID</th>
                      <th className="p-4 border-b">Trabajador</th>
                      <th className="p-4 border-b">Días Trab.</th>
                      <th className="p-4 border-b text-right">Tiempo Total (Presencia)</th>
                      <th className="p-4 border-b text-right">Tiempo Descansos (-)</th>
                      <th className="p-4 border-b text-right bg-blue-50 text-blue-800">Horas Netas Trabajadas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {generateMonthlyReport().map((report, idx) => (
                      <tr key={report.workerId} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50 hover:bg-slate-100'}>
                        <td className="p-4 border-b text-slate-500 font-mono">{report.workerId}</td>
                        <td className="p-4 border-b font-bold text-lg">{report.workerName}</td>
                        <td className="p-4 border-b">{report.daysWorked}</td>
                        <td className="p-4 border-b text-right font-mono text-slate-600">
                          {msToTime(report.totalPresenceMs)}
                        </td>
                         <td className="p-4 border-b text-right font-mono text-orange-600">
                          {report.totalBreakMs > 0 ? `-${msToTime(report.totalBreakMs)}` : '0h 0m'}
                        </td>
                        <td className="p-4 border-b text-right font-black text-blue-700 bg-blue-50 text-lg">
                          {msToTime(report.netWorkMs)}
                        </td>
                      </tr>
                    ))}
                    {generateMonthlyReport().length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400 italic">
                          No hay actividad registrada en {reportMonth} para generar cálculos.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              <div className="mt-4 p-4 bg-yellow-50 text-yellow-800 text-xs rounded border border-yellow-200">
                <strong>Nota:</strong> El cálculo asume que cada fichaje de "ENTRADA" tiene un fichaje de "SALIDA" correspondiente el mismo día. Si un trabajador olvida fichar la salida, esas horas no se sumarán correctamente hasta que se corrija el registro.
              </div>
            </div>
          </div>
        )}

        {/* WORKERS TAB */}
        {activeTab === 'workers' && (
          <div className="bg-white p-6 rounded-lg shadow">
            
            <div className="flex justify-between items-center mb-6">
               <h2 className="font-bold text-lg">Gestión de Personal</h2>
               <button 
                  onClick={() => setShowQrPrintView(true)}
                  className="bg-slate-800 text-yellow-400 px-4 py-2 rounded flex items-center gap-2 hover:bg-slate-700"
                >
                  <QrCode size={18} /> Generar Fichas QR
                </button>
            </div>

            <div className="flex flex-col md:flex-row gap-2 mb-6 bg-slate-50 p-4 rounded border">
              <input 
                type="text" 
                placeholder="Nombre del trabajador" 
                className="flex-1 border p-2 rounded"
                value={newWorkerName}
                onChange={(e) => setNewWorkerName(e.target.value)}
              />
               <input 
                type="text" 
                placeholder="PIN (4 dígitos)" 
                className="w-32 border p-2 rounded"
                value={newWorkerPin}
                maxLength={4}
                onChange={(e) => setNewWorkerPin(e.target.value.replace(/\D/g,''))}
              />
              <button 
                onClick={handleAddWorker}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2 justify-center"
              >
                <Plus size={18} /> Añadir
              </button>
            </div>
            <div className="grid gap-4">
              {workers.map(w => (
                <div key={w.id} className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 border rounded hover:shadow-md transition gap-4">
                  <div className="flex items-center gap-4">
                    <div className="bg-slate-200 p-2 rounded-full hidden md:block">
                       <Users size={20} className="text-slate-600"/>
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{w.name}</h3>
                      <div className="text-xs text-slate-500 flex flex-col md:flex-row gap-x-3 gap-y-1 mt-1">
                        <span>ID: {w.id}</span>
                        {w.dni && <span className="text-slate-700 font-mono bg-slate-100 px-1 rounded">DNI: {w.dni}</span>}
                        {w.role && <span className="flex items-center gap-1"><Briefcase size={10}/> {w.role}</span>}
                        {w.phone && <span className="flex items-center gap-1"><Phone size={10}/> {w.phone}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 w-full md:w-auto justify-end">
                    <div className="flex items-center gap-1 text-slate-400 bg-slate-50 px-2 py-1 rounded">
                       <Lock size={14}/> <span className="text-sm font-mono">{w.pin}</span>
                    </div>
                    <button onClick={() => handleDeleteWorker(w.id)} className="text-red-500 hover:bg-red-50 p-2 rounded">
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SITES TAB */}
        {activeTab === 'sites' && (
          <div className="bg-white p-6 rounded-lg shadow">
             <div className="grid gap-2 mb-6">
              <input 
                type="text" 
                placeholder="Nombre de la obra" 
                className="border p-2 rounded w-full"
                value={newSiteName}
                onChange={(e) => setNewSiteName(e.target.value)}
              />
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Dirección" 
                  className="flex-1 border p-2 rounded"
                  value={newSiteAddress}
                  onChange={(e) => setNewSiteAddress(e.target.value)}
                />
                <button 
                  onClick={handleAddSite}
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2"
                >
                  <Plus size={18} /> Añadir
                </button>
              </div>
            </div>
            <div className="grid gap-4">
              {sites.map(s => (
                <div key={s.id} className="flex items-center justify-between p-4 border rounded hover:shadow-md transition">
                  <div>
                    <h3 className="font-bold text-lg">{s.name}</h3>
                    <p className="text-sm text-slate-600">{s.address}</p>
                    <div className="flex gap-3 mt-1">
                       <span className="text-xs text-slate-400">ID: {s.id}</span>
                       {s.coordinates && (
                         <span className="text-xs text-blue-500 flex items-center gap-1">
                           <MapPin size={10}/> {s.coordinates.latitude.toFixed(4)}, {s.coordinates.longitude.toFixed(4)}
                         </span>
                       )}
                    </div>
                  </div>
                  <button onClick={() => handleDeleteSite(s.id)} className="text-red-500 hover:bg-red-50 p-2 rounded">
                    <Trash2 size={20} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CONFIG TAB */}
        {activeTab === 'config' && (
          <div className="bg-white p-6 rounded-lg shadow max-w-xl mx-auto">
             <h3 className="font-bold text-lg mb-4">Configuración General</h3>
             
             <div className="mb-4">
               <label className="block text-sm font-bold mb-2">Número WhatsApp Admin (con código país)</label>
               <input 
                 type="text" 
                 className="w-full border p-2 rounded"
                 value={config.adminPhone}
                 onChange={(e) => setConfig({...config, adminPhone: e.target.value})}
               />
               <p className="text-xs text-slate-500 mt-1">Ej: 34600123456. A este número llegarán los fichajes.</p>
             </div>

             <div className="mb-6">
               <label className="block text-sm font-bold mb-2">URL Google Sheet (Script)</label>
               <input 
                 type="text" 
                 className="w-full border p-2 rounded"
                 value={config.googleSheetUrl}
                 onChange={(e) => setConfig({...config, googleSheetUrl: e.target.value})}
               />
               <p className="text-xs text-slate-500 mt-1">URL del Web App de Apps Script para guardar datos reales.</p>
             </div>

             <button 
              onClick={saveConfig}
              className="w-full bg-blue-600 text-white py-3 rounded font-bold hover:bg-blue-700 flex items-center justify-center gap-2"
             >
               <Save size={20} /> Guardar Configuración
             </button>
          </div>
        )}
      </div>
    </div>
  );
};