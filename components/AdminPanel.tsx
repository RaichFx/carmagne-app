import React, { useState, useEffect } from 'react';
import { StorageService } from '../services/storageService';
import { Worker, Site, WorkLog, AppConfig, WorkMode, LogType } from '../types';
import { 
  Users, MapPin, Download, Settings, FileText, 
  Trash2, Plus, Save, Lock, Database, ClipboardList, Calendar, X, UserPlus, Phone
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ConfirmationModal } from './ConfirmationModal';

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

  const [reportMonth, setReportMonth] = useState<string>(new Date().toISOString().slice(0, 7));

  const [newWorkerName, setNewWorkerName] = useState('');
  const [newWorkerPin, setNewWorkerPin] = useState('');
  const [newWorkerMode, setNewWorkerMode] = useState<WorkMode>('HORAS');
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteAddress, setNewSiteAddress] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'worker' | 'site', id: string, name: string } | null>(null);

  useEffect(() => {
    refreshData();
    const unsubscribeLogs = StorageService.subscribeToLogs((updatedLogs) => setLogs(updatedLogs));
    const unsubscribeWorkers = StorageService.subscribeToWorkers((updatedWorkers) => setWorkers(updatedWorkers));
    const unsubscribeSites = StorageService.subscribeToSites((updatedSites) => setSites(updatedSites));

    return () => {
      unsubscribeLogs();
      unsubscribeWorkers();
      unsubscribeSites();
    };
  }, []);

  const refreshData = () => {
    setLogs(StorageService.getLogs());
    setWorkers(StorageService.getWorkers());
    setSites(StorageService.getSites());
    setConfig(StorageService.getConfig());
  };

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

  const handleAddWorker = () => {
    if (!newWorkerName || !newWorkerPin) {
      alert("Nombre y PIN son obligatorios");
      return;
    }
    // Nota: Para añadir desde admin, generamos un ID, pero el teléfono se quedaría vacío.
    // En un sistema real, el admin debería meter el teléfono también. 
    // Por simplicidad, asumimos que el admin crea usuarios "básicos" y el usuario al registrarse completa el perfil.
    const newWorker: Worker = {
      id: `W${Math.floor(Math.random() * 10000)}`,
      name: newWorkerName,
      qrCode: `QR_${Date.now()}`,
      active: true,
      pin: newWorkerPin,
      role: 'Trabajador',
      defaultMode: newWorkerMode
    };
    StorageService.registerNewWorker(newWorker);
    setNewWorkerName('');
    setNewWorkerPin('');
  };

  const initiateDeleteWorker = (w: Worker) => setDeleteTarget({ type: 'worker', id: w.id, name: w.name });
  const initiateDeleteSite = (s: Site) => setDeleteTarget({ type: 'site', id: s.id, name: s.name });

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'worker') StorageService.deleteWorker(deleteTarget.id);
    else if (deleteTarget.type === 'site') StorageService.deleteSite(deleteTarget.id);
    setDeleteTarget(null);
  };

  const handleAddSite = () => {
    if (!newSiteName) return;
    const newSite: Site = {
      id: `S${Math.floor(Math.random() * 10000)}`,
      name: newSiteName,
      address: newSiteAddress,
      active: true
    };
    StorageService.saveSites([...sites, newSite]);
    setNewSiteName('');
    setNewSiteAddress('');
  };

  const saveConfig = () => {
    const updatedConfig = { ...config };
    if (newAdminPassword) updatedConfig.adminPassword = newAdminPassword;
    StorageService.saveConfig(updatedConfig);
    setConfig(updatedConfig);
    setNewAdminPassword('');
    alert('Configuración guardada correctamente.');
  };

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
        if (log.type === LogType.REGISTRO) continue;
        daysSet.add(log.dateStr);
        if (log.type === LogType.ENTRADA) {
          if (lastEntryTime === null) lastEntryTime = log.timestamp;
        } else if (log.type === LogType.SALIDA) {
          if (lastEntryTime !== null) {
            totalPresence += (log.timestamp - lastEntryTime);
            lastEntryTime = null; 
            if (lastBreakStartTime !== null) {
               totalBreaks += (log.timestamp - lastBreakStartTime);
               lastBreakStartTime = null;
            }
          }
        } else if (log.type === LogType.INICIO_DESCANSO) {
           if (lastBreakStartTime === null) lastBreakStartTime = log.timestamp;
        } else if (log.type === LogType.FIN_DESCANSO) {
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

  const handleDownloadPDF = (summary: WorkerMonthlyReport) => {
    const doc = new jsPDF();
    const [year, month] = reportMonth.split('-').map(Number);
    const workerLogs = logs.filter(log => {
      const d = new Date(log.timestamp);
      return log.workerId === summary.workerId && d.getFullYear() === year && (d.getMonth() + 1) === month;
    }).sort((a, b) => a.timestamp - b.timestamp);

    doc.setFillColor(15, 23, 42); 
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text("CARMAGNE INSTAL", 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text("INFORME MENSUAL", 105, 30, { align: 'center' });

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Trabajador: ${summary.workerName}`, 14, 50);
    doc.text(`ID: ${summary.workerId}`, 14, 56);
    doc.text(`Periodo: ${reportMonth}`, 160, 50);

    const tableData = workerLogs.map(log => [
      log.dateStr,
      log.timeStr,
      log.type.replace('_', ' '),
      log.siteName,
      log.workMode || 'HORAS',
      log.workReport || '-'
    ]);

    autoTable(doc, {
      startY: 70,
      head: [['Fecha', 'Hora', 'Acción', 'Obra', 'Modo', 'Reporte/Notas']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { fontSize: 8 },
      columnStyles: { 5: { cellWidth: 60 } }
    });

    doc.save(`Reporte_${summary.workerName.replace(/\s/g, '_')}_${reportMonth}.pdf`);
  };

  const msToTime = (duration: number) => {
    const minutes = Math.floor((duration / (1000 * 60)) % 60);
    const hours = Math.floor((duration / (1000 * 60 * 60)));
    return `${hours}h ${minutes}m`;
  };

  const logsByType = [
    { name: 'Entrada', value: logs.filter(l => l.type === LogType.ENTRADA).length },
    { name: 'Salida', value: logs.filter(l => l.type === LogType.SALIDA).length },
    { name: 'Registros', value: logs.filter(l => l.type === LogType.REGISTRO).length },
  ];
  const COLORS = ['#3b82f6', '#10b981', '#94a3b8'];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 pb-20 font-sans">
      
      <ConfirmationModal
        isOpen={deleteTarget !== null}
        title={deleteTarget?.type === 'worker' ? 'Eliminar Trabajador' : 'Eliminar Obra'}
        message={`¿Está seguro? Esta acción borrará permanentemente los datos.`}
        isDestructive={true}
        confirmText="Eliminar definitivamente"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />

      <header className="bg-slate-900 text-white p-4 sticky top-0 z-10 shadow-md flex justify-between items-center border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">CARMAGNE</h1>
            <p className="text-[10px] text-blue-500 font-bold uppercase tracking-widest">Admin Panel</p>
          </div>
        </div>
        <button onClick={onBack} className="text-xs bg-slate-800 text-slate-300 border border-slate-700 px-4 py-2 rounded-lg hover:bg-slate-700 transition">
          Volver a App
        </button>
      </header>

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

      <div className="p-6 max-w-7xl mx-auto">
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                   <h3 className="text-slate-500 text-xs uppercase font-bold tracking-wider">Total Registros</h3>
                   <p className="text-4xl font-black text-slate-900 mt-2">{logs.length}</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                   <h3 className="text-slate-500 text-xs uppercase font-bold tracking-wider">Obras Activas</h3>
                   <p className="text-4xl font-black text-blue-600 mt-2">{sites.filter(s => s.active).length}</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                   <h3 className="text-slate-500 text-xs uppercase font-bold tracking-wider">Trabajadores</h3>
                   <p className="text-4xl font-black text-emerald-600 mt-2">{workers.filter(w => w.active).length}</p>
                </div>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col">
                  <h3 className="font-bold mb-6 text-slate-800">Actividad</h3>
                  <div className="flex-1 min-h-[300px]">
                    <ResponsiveContainer width="100%" height={300}>
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
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                   <h3 className="font-bold mb-4 text-slate-800">Acciones Rápidas</h3>
                   <button onClick={handleExport} className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white p-4 rounded-xl hover:bg-emerald-700 transition font-bold shadow-lg shadow-emerald-900/10">
                     <Download size={20} /> Exportar Excel/CSV
                   </button>
                   <div className="mt-6 p-4 bg-blue-50 text-blue-800 text-sm rounded-xl border border-blue-100">
                     <p className="font-bold flex items-center gap-2"><Database size={16}/> Estado del Sistema</p>
                     <p className="mt-1">Conectado a Firebase en tiempo real.</p>
                   </div>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-700 uppercase font-bold text-xs tracking-wider">
                    <tr>
                      <th className="p-4">Fecha/Hora</th>
                      <th className="p-4">Trabajador</th>
                      <th className="p-4">Obra/Evento</th>
                      <th className="p-4">Acción</th>
                      <th className="p-4">Info</th>
                      <th className="p-4">Ubicación (GPS)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {logs.map(log => (
                      <tr key={log.id} className={`hover:bg-slate-50 ${log.locationWarning ? 'bg-rose-50' : ''}`}>
                        <td className="p-4">
                          <div className="font-bold text-slate-900">{log.dateStr}</div>
                          <div className="text-slate-500 text-xs">{log.timeStr}</div>
                        </td>
                        <td className="p-4 font-medium text-slate-800">{log.workerName}</td>
                        <td className="p-4 text-slate-600">{log.siteName}</td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wide ${
                            log.type === LogType.ENTRADA ? 'bg-emerald-100 text-emerald-800' :
                            log.type === LogType.SALIDA ? 'bg-rose-100 text-rose-800' :
                            log.type === LogType.REGISTRO ? 'bg-blue-100 text-blue-800' :
                            'bg-amber-100 text-amber-800'
                          }`}>{log.type}</span>
                        </td>
                        <td className="p-4 max-w-xs">
                          {log.workReport ? <span className="text-xs text-slate-600 italic truncate block w-48" title={log.workReport}>{log.workReport}</span> : <span className="text-slate-300">-</span>}
                        </td>
                        <td className="p-4 max-w-xs truncate">
                          {log.location.latitude !== 0 ? (
                             <div className="flex flex-col">
                               <a href={`https://www.google.com/maps?q=${log.location.latitude},${log.location.longitude}`} target="_blank" className="text-blue-500 hover:text-blue-700 hover:underline flex items-center gap-1 text-xs font-medium">
                                  <MapPin size={14} /> 
                                  {log.location.latitude.toFixed(5)}, {log.location.longitude.toFixed(5)}
                               </a>
                               {log.location.address && <span className="text-[10px] text-slate-500 truncate mt-0.5">{log.location.address}</span>}
                             </div>
                          ) : <span className="text-xs text-slate-400">Sistema</span>}
                           {log.locationWarning && <span className="text-[10px] text-rose-600 font-bold block mt-1">⚠️ Fuera de rango</span>}
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
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex flex-col md:flex-row gap-4 mb-8 bg-slate-50 p-6 rounded-xl border border-slate-100">
              <div className="flex-1 space-y-2">
                 <label className="text-xs font-bold uppercase text-slate-500 tracking-wide">Nombre</label>
                 <input 
                  type="text" 
                  placeholder="Nombre del trabajador" 
                  className="w-full border border-slate-300 p-3 rounded-lg focus:border-blue-500 outline-none"
                  value={newWorkerName}
                  onChange={(e) => setNewWorkerName(e.target.value)}
                />
              </div>
              <div className="w-full md:w-48 space-y-2">
                <label className="text-xs font-bold uppercase text-slate-500 tracking-wide">Modo</label>
                <select 
                  className="w-full border border-slate-300 p-3 rounded-lg bg-white text-sm outline-none"
                  value={newWorkerMode}
                  onChange={(e) => setNewWorkerMode(e.target.value as WorkMode)}
                >
                  <option value="HORAS">Por Horas</option>
                  <option value="DESTAJO">A Destajo</option>
                </select>
              </div>
              <div className="w-full md:w-32 space-y-2">
                 <label className="text-xs font-bold uppercase text-slate-500 tracking-wide">PIN</label>
                 <input 
                  type="text" 
                  placeholder="0000" 
                  className="w-full border border-slate-300 p-3 rounded-lg text-center tracking-widest outline-none"
                  value={newWorkerPin}
                  maxLength={4}
                  onChange={(e) => setNewWorkerPin(e.target.value.replace(/\D/g,''))}
                />
              </div>
              <div className="flex items-end">
                <button 
                  onClick={handleAddWorker}
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center justify-center font-bold shadow-lg shadow-blue-900/20 transition"
                >
                  <Plus size={20} />
                </button>
              </div>
            </div>
            <div className="grid gap-4">
              {workers.map(w => (
                <div key={w.id} className="flex flex-col md:flex-row items-center justify-between p-4 border border-slate-100 rounded-xl hover:shadow-md transition gap-4 bg-white">
                  <div className="flex items-center gap-4">
                    <div className="bg-slate-100 p-3 rounded-full hidden md:block text-slate-500">
                       <Users size={20}/>
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-slate-800">{w.name}</h3>
                      <div className="flex flex-col gap-1 mt-1">
                         <div className="flex gap-2 text-xs">
                           <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-500 font-mono">ID: {w.id}</span>
                           <span className={`px-2 py-0.5 rounded font-bold uppercase ${w.defaultMode === 'DESTAJO' ? 'bg-purple-100 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>
                             {w.defaultMode || 'HORAS'}
                           </span>
                         </div>
                         {w.phone && (
                           <span className="text-xs text-slate-500 flex items-center gap-1">
                             <Phone size={10}/> {w.phone}
                           </span>
                         )}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => initiateDeleteWorker(w)} className="text-slate-400 hover:text-rose-500 p-2 hover:bg-rose-50 rounded-lg transition"><Trash2 size={20} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'reports' && (
           <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="flex items-center gap-4 mb-8 bg-blue-50 p-6 rounded-xl border border-blue-100">
                <div className="bg-blue-100 p-3 rounded-lg text-blue-600"><Calendar size={24} /></div>
                <div className="flex-1">
                  <label className="text-xs uppercase font-bold text-blue-800 tracking-wider">Seleccionar Mes</label>
                  <input 
                    type="month" 
                    value={reportMonth}
                    onChange={(e) => setReportMonth(e.target.value)}
                    className="block w-full bg-transparent font-bold text-2xl outline-none text-blue-900"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                 <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-xs tracking-wider">
                       <tr>
                         <th className="p-4">Trabajador</th>
                         <th className="p-4 text-right">Días</th>
                         <th className="p-4 text-right">Presencia</th>
                         <th className="p-4 text-right">Descansos</th>
                         <th className="p-4 text-right bg-blue-50 text-blue-800">Neto</th>
                         <th className="p-4 text-center">Exportar</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {generateMonthlyReport().map(report => (
                         <tr key={report.workerId} className="hover:bg-slate-50">
                            <td className="p-4 font-bold text-slate-800">{report.workerName}</td>
                            <td className="p-4 text-right">{report.daysWorked}</td>
                            <td className="p-4 text-right text-slate-500">{msToTime(report.totalPresenceMs)}</td>
                            <td className="p-4 text-right text-amber-600">{msToTime(report.totalBreakMs)}</td>
                            <td className="p-4 text-right font-bold bg-blue-50/50 text-blue-700">{msToTime(report.netWorkMs)}</td>
                            <td className="p-4 text-center">
                              <button 
                                onClick={() => handleDownloadPDF(report)}
                                className="text-slate-400 hover:text-red-600 transition mx-auto flex items-center gap-1 text-xs font-bold"
                              >
                                <FileText size={16} /> PDF
                              </button>
                            </td>
                         </tr>
                       ))}
                       {generateMonthlyReport().length === 0 && (
                          <tr><td colSpan={6} className="p-12 text-center text-slate-400 italic">No hay datos para el periodo seleccionado.</td></tr>
                       )}
                    </tbody>
                 </table>
              </div>
           </div>
        )}

        {activeTab === 'sites' && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
             <div className="grid gap-4 mb-8 bg-slate-50 p-6 rounded-xl border border-slate-100">
              <input 
                type="text" 
                placeholder="Nombre de la obra" 
                className="border border-slate-300 p-3 rounded-lg w-full outline-none focus:border-blue-500"
                value={newSiteName}
                onChange={(e) => setNewSiteName(e.target.value)}
              />
              <div className="flex gap-4">
                <input 
                  type="text" 
                  placeholder="Dirección" 
                  className="flex-1 border border-slate-300 p-3 rounded-lg outline-none focus:border-blue-500"
                  value={newSiteAddress}
                  onChange={(e) => setNewSiteAddress(e.target.value)}
                />
                <button 
                  onClick={handleAddSite}
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center gap-2 font-bold shadow-lg shadow-blue-900/20"
                >
                  <Plus size={20} /> Añadir
                </button>
              </div>
            </div>
            <div className="grid gap-4">
              {sites.map(s => (
                <div key={s.id} className="flex items-center justify-between p-5 border border-slate-100 rounded-xl hover:shadow-md transition bg-white">
                  <div>
                    <h3 className="font-bold text-lg text-slate-800">{s.name}</h3>
                    <p className="text-sm text-slate-500 flex items-center gap-1 mt-1"><MapPin size={14}/> {s.address}</p>
                    <div className="flex gap-3 mt-2">
                       <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500 font-mono">ID: {s.id}</span>
                       {s.coordinates && (
                         <span className="text-[10px] text-blue-500 flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded font-bold">
                           GPS OK
                         </span>
                       )}
                    </div>
                  </div>
                  <button onClick={() => initiateDeleteSite(s)} className="text-slate-400 hover:text-rose-500 p-2 hover:bg-rose-50 rounded-lg transition">
                    <Trash2 size={20} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'config' && (
          <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-xl mx-auto space-y-8">
             
             {/* Admin Password */}
             <div>
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-800"><Lock size={20} className="text-blue-500"/> Seguridad</h3>
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                  <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Nueva Contraseña Maestra</label>
                  <div className="flex gap-2">
                     <input 
                       type="password" 
                       placeholder="••••••"
                       className="flex-1 border border-slate-300 p-3 rounded-lg outline-none focus:border-blue-500"
                       value={newAdminPassword}
                       onChange={(e) => setNewAdminPassword(e.target.value)}
                     />
                  </div>
                  <p className="text-xs text-slate-400 mt-2 italic">Deje en blanco si no desea cambiarla.</p>
                </div>
             </div>

             {/* Connection Config */}
             <div>
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-800"><Settings size={20} className="text-blue-500"/> Conexiones</h3>
                
                <div className="mb-4">
                  <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Google Sheet Script URL</label>
                  <input 
                    type="text" 
                    className="w-full border border-slate-300 p-3 rounded-lg bg-slate-50 text-slate-600 text-sm font-mono"
                    placeholder="https://script.google.com/macros/s/..."
                    value={config.googleSheetUrl}
                    onChange={(e) => setConfig({...config, googleSheetUrl: e.target.value})}
                  />
                </div>
             </div>

             <button 
              onClick={saveConfig}
              className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-black flex items-center justify-center gap-2 shadow-xl transition uppercase tracking-widest text-sm"
             >
               <Save size={18} /> Guardar Cambios
             </button>
          </div>
        )}

      </div>
    </div>
  );
};
