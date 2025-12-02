
import React, { useState, useEffect } from 'react';
import { StorageService } from '../services/storageService';
import { Worker, Site, WorkLog, AppConfig, WorkMode } from '../types';
import { 
  Users, MapPin, Download, Settings, FileText, 
  Trash2, Plus, Save, ExternalLink, Lock, Briefcase, Phone, X, ShieldAlert, Code, Database, CloudOff, ClipboardList, Calendar, Key, FileInput, MessageSquare
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
  const [newWorkerMode, setNewWorkerMode] = useState<WorkMode>('HORAS');
  
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteAddress, setNewSiteAddress] = useState('');
  
  // Debug Mode State
  const [showDebug, setShowDebug] = useState(false);

  // Admin Password Change
  const [newAdminPassword, setNewAdminPassword] = useState('');

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
      role: 'Trabajador',
      defaultMode: newWorkerMode
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
    const updatedConfig = { ...config };
    if (newAdminPassword) {
      updatedConfig.adminPassword = newAdminPassword;
    }
    StorageService.saveConfig(updatedConfig);
    setConfig(updatedConfig);
    setNewAdminPassword('');
    alert('Configuración guardada correctamente.');
  };

  // --- REPORT LOGIC ---
  const generateMonthlyReport = (): WorkerMonthlyReport[] => {
    const [year, month] = reportMonth.split('-').map(Number);
    const monthlyLogs = logs.filter(log => {
      const d = new Date(log.timestamp);
      return d.getFullYear() === year && (d.getMonth() + 1) === month;
    });

    monthlyLogs.sort((a, b) => a.timestamp - b.timestamp);
    const reports: WorkerMonthlyReport[] = [];

    workers.forEach(worker => {
      const workerLogs = monthlyLogs.filter(l => l.workerId === worker.id);
      let totalPresence = 0;
      let totalBreaks = 0;
      let daysSet = new Set<string>();
      let lastEntryTime: number | null = null;
      let lastBreakStartTime: number | null = null;

      for (const log of workerLogs) {
        daysSet.add(log.dateStr);

        if (log.type === 'ENTRADA') {
          if (lastEntryTime === null) lastEntryTime = log.timestamp;
        } else if (log.type === 'SALIDA') {
          if (lastEntryTime !== null) {
            totalPresence += (log.timestamp - lastEntryTime);
            lastEntryTime = null; 
            if (lastBreakStartTime !== null) {
               totalBreaks += (log.timestamp - lastBreakStartTime);
               lastBreakStartTime = null;
            }
          }
        } else if (log.type === 'INICIO_DESCANSO') {
           if (lastBreakStartTime === null) lastBreakStartTime = log.timestamp;
        } else if (log.type === 'FIN_DESCANSO') {
           if (lastBreakStartTime !== null) {
             totalBreaks += (log.timestamp - lastBreakStartTime);
             lastBreakStartTime = null;
           }
        }
      }

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

  const logsByType = [
    { name: 'Entrada', value: logs.filter(l => l.type === 'ENTRADA').length },
    { name: 'Salida', value: logs.filter(l => l.type === 'SALIDA').length },
    { name: 'Descansos', value: logs.filter(l => l.type.includes('DESCANSO')).length },
  ];
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28'];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 pb-20">
      {/* Admin Header */}
      <header className="bg-slate-900 text-white p-4 sticky top-0 z-10 shadow-md flex justify-between items-center">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="Logo" className="w-8 h-8 object-contain" />
          <h1 className="text-xl font-bold text-yellow-400">Panel Administrador</h1>
        </div>
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
        
        {/* DASHBOARD */}
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
                   <button onClick={handleExport} className="w-full flex items-center justify-center gap-2 bg-green-600 text-white p-3 rounded-lg hover:bg-green-700 transition">
                     <Download size={20} /> Exportar Excel/CSV
                   </button>
                   <div className="mt-4 p-4 bg-yellow-50 text-yellow-800 text-sm rounded border border-yellow-200">
                     <p className="font-bold">Informe Mensual:</p>
                     <p>Use la pestaña "Informes" para ver totales por horas y generar reportes para nóminas.</p>
                   </div>
                </div>
             </div>
          </div>
        )}

        {/* LOGS TAB */}
        {activeTab === 'logs' && (
          <div className="space-y-6">
            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-lg shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex gap-3">
                 <Database className="text-blue-500 flex-shrink-0" />
                 <div>
                    <h3 className="text-blue-900 font-bold text-sm uppercase">Almacenamiento Local</h3>
                    <p className="text-sm text-blue-700 mt-1">Mostrando <strong>{logs.length}</strong> registros.</p>
                 </div>
              </div>
              <button onClick={() => setShowDebug(!showDebug)} className="flex items-center gap-2 px-4 py-2 rounded text-sm font-bold border bg-white">
                <Code size={16} /> {showDebug ? 'Ocultar JSON' : 'Ver JSON'}
              </button>
            </div>

            {showDebug && (
              <div className="bg-slate-900 rounded-lg p-4 shadow-inner border border-slate-700">
                <pre className="text-green-400 font-mono text-xs overflow-auto max-h-96 custom-scrollbar">{JSON.stringify(logs, null, 2)}</pre>
              </div>
            )}

            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-700 uppercase font-bold">
                    <tr>
                      <th className="p-3">Est</th>
                      <th className="p-3">Fecha/Hora</th>
                      <th className="p-3">Trabajador</th>
                      <th className="p-3">Obra</th>
                      <th className="p-3">Acción</th>
                      <th className="p-3">Modo</th>
                      <th className="p-3">Reporte</th>
                      <th className="p-3">Ubicación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.slice().reverse().map(log => (
                      <tr key={log.id} className={`border-b hover:bg-slate-50 ${log.locationWarning ? 'bg-red-50' : ''}`}>
                        <td className="p-3">
                           {log.syncedToSheets ? <Database size={12} className="text-green-600" /> : <CloudOff size={12} className="text-slate-400" />}
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
                          }`}>{log.type}</span>
                        </td>
                        <td className="p-3">
                           <span className={`text-[10px] uppercase font-bold px-1 rounded ${log.workMode === 'DESTAJO' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
                             {log.workMode || 'HORAS'}
                           </span>
                        </td>
                        <td className="p-3 max-w-xs">
                          {log.workReport ? <span className="text-xs text-slate-600 italic truncate block w-32" title={log.workReport}>{log.workReport}</span> : '-'}
                        </td>
                        <td className="p-3 max-w-xs truncate">
                           <a href={`https://www.google.com/maps?q=${log.location.latitude},${log.location.longitude}`} target="_blank" className="text-blue-600 hover:underline flex items-center gap-1">
                              <MapPin size={14} /> {log.location.address || "Mapa"}
                           </a>
                           {log.locationWarning && <span className="text-xs text-red-600 font-bold block">⚠️ Alerta</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* WORKERS TAB */}
        {activeTab === 'workers' && (
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex flex-col md:flex-row gap-2 mb-6 bg-slate-50 p-4 rounded border">
              <div className="flex-1 space-y-2">
                 <input 
                  type="text" 
                  placeholder="Nombre del trabajador" 
                  className="w-full border p-2 rounded"
                  value={newWorkerName}
                  onChange={(e) => setNewWorkerName(e.target.value)}
                />
                <select 
                  className="w-full border p-2 rounded text-sm bg-white"
                  value={newWorkerMode}
                  onChange={(e) => setNewWorkerMode(e.target.value as WorkMode)}
                >
                  <option value="HORAS">Por Horas (Estándar)</option>
                  <option value="DESTAJO">A Destajo</option>
                </select>
              </div>
               <input 
                type="text" 
                placeholder="PIN" 
                className="w-24 border p-2 rounded h-10"
                value={newWorkerPin}
                maxLength={4}
                onChange={(e) => setNewWorkerPin(e.target.value.replace(/\D/g,''))}
              />
              <button 
                onClick={handleAddWorker}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 h-10 flex items-center justify-center"
              >
                <Plus size={18} />
              </button>
            </div>
            <div className="grid gap-4">
              {workers.map(w => (
                <div key={w.id} className="flex flex-col md:flex-row items-center justify-between p-4 border rounded hover:shadow-md transition gap-4">
                  <div className="flex items-center gap-4">
                    <div className="bg-slate-200 p-2 rounded-full hidden md:block">
                       <Users size={20} className="text-slate-600"/>
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{w.name}</h3>
                      <div className="flex gap-2 text-xs mt-1">
                         <span className="bg-slate-100 px-1 rounded text-slate-600">ID: {w.id}</span>
                         <span className={`px-1 rounded font-bold ${w.defaultMode === 'DESTAJO' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                           {w.defaultMode || 'HORAS'}
                         </span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => handleDeleteWorker(w.id)} className="text-red-500 hover:bg-red-50 p-2 rounded"><Trash2 size={20} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* REPORTS TAB */}
        {activeTab === 'reports' && (
           <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center gap-4 mb-6 bg-slate-50 p-4 rounded border">
                <Calendar className="text-blue-600" />
                <div className="flex-1">
                  <label className="text-xs uppercase font-bold text-slate-500">Seleccionar Mes</label>
                  <input 
                    type="month" 
                    value={reportMonth}
                    onChange={(e) => setReportMonth(e.target.value)}
                    className="block w-full bg-transparent font-bold text-lg outline-none"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                 <table className="w-full text-sm text-left">
                    <thead className="bg-blue-50 text-blue-800 uppercase font-bold">
                       <tr>
                         <th className="p-3">Trabajador</th>
                         <th className="p-3 text-right">Días</th>
                         <th className="p-3 text-right">Total Presencia</th>
                         <th className="p-3 text-right">Descansos</th>
                         <th className="p-3 text-right bg-blue-100">Horas Netas</th>
                       </tr>
                    </thead>
                    <tbody>
                       {generateMonthlyReport().map(report => (
                         <tr key={report.workerId} className="border-b hover:bg-slate-50">
                            <td className="p-3 font-medium">{report.workerName}</td>
                            <td className="p-3 text-right">{report.daysWorked}</td>
                            <td className="p-3 text-right text-slate-500">{msToTime(report.totalPresenceMs)}</td>
                            <td className="p-3 text-right text-yellow-600">{msToTime(report.totalBreakMs)}</td>
                            <td className="p-3 text-right font-bold bg-blue-50 text-blue-700">{msToTime(report.netWorkMs)}</td>
                         </tr>
                       ))}
                       {generateMonthlyReport().length === 0 && (
                          <tr><td colSpan={5} className="p-6 text-center text-slate-400">No hay datos para el mes seleccionado.</td></tr>
                       )}
                    </tbody>
                 </table>
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
          <div className="bg-white p-6 rounded-lg shadow max-w-xl mx-auto space-y-8">
             
             {/* Admin Password */}
             <div>
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Lock size={20}/> Seguridad Admin</h3>
                <div className="bg-slate-50 p-4 rounded border border-slate-200">
                  <label className="block text-sm font-bold mb-2">Cambiar Contraseña Maestra</label>
                  <div className="flex gap-2">
                     <input 
                       type="password" 
                       placeholder="Nueva contraseña"
                       className="flex-1 border p-2 rounded"
                       value={newAdminPassword}
                       onChange={(e) => setNewAdminPassword(e.target.value)}
                     />
                  </div>
                  <p className="text-xs text-slate-500 mt-2">Deje en blanco si no desea cambiarla.</p>
                </div>
             </div>

             {/* Connection Config */}
             <div>
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Settings size={20}/> Conexiones</h3>
                
                <div className="mb-4">
                  <label className="block text-sm font-bold mb-2">Número WhatsApp Admin</label>
                  <input 
                    type="text" 
                    className="w-full border p-2 rounded"
                    value={config.adminPhone}
                    onChange={(e) => setConfig({...config, adminPhone: e.target.value})}
                  />
                  <p className="text-xs text-slate-500 mt-1">Incluir prefijo país (ej: 34...)</p>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-bold mb-2 text-green-700">URL Google Sheet (Apps Script)</label>
                  <input 
                    type="text" 
                    className="w-full border p-2 rounded border-green-200 bg-green-50"
                    placeholder="https://script.google.com/macros/s/..."
                    value={config.googleSheetUrl}
                    onChange={(e) => setConfig({...config, googleSheetUrl: e.target.value})}
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Pega aquí la URL "Web App" obtenida al desplegar el script en Google Sheets.
                    Esto habilitará el guardado automático en la nube.
                  </p>
                </div>
             </div>

             <button 
              onClick={saveConfig}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 flex items-center justify-center gap-2 shadow-lg"
             >
               <Save size={20} /> Guardar Configuración
             </button>
          </div>
        )}
      </div>
    </div>
  );
};
