import React, { useState, useRef, useMemo } from 'react';
import { Upload, X, FileText, Trash2, Download, Search, Calendar, Filter, Plus, Check, AlertCircle } from 'lucide-react';
import { Worker, Payroll } from '../types';
import { StorageService } from '../services/storageService';

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

interface PayrollAdminPanelProps {
  workers: Worker[];
  payrolls: Payroll[];
  isSuperAdmin: boolean;
  adminUsername: string;
}

export const PayrollAdminPanel: React.FC<PayrollAdminPanelProps> = ({ workers, payrolls, isSuperAdmin, adminUsername }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [fileBase64, setFileBase64] = useState('');
  const [fileName, setFileName] = useState('');
  const [mimeType, setMimeType] = useState('');
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successFlash, setSuccessFlash] = useState(false);

  const [filterWorker, setFilterWorker] = useState('');
  const [filterYear, setFilterYear] = useState<number | ''>('');
  const [filterMonth, setFilterMonth] = useState<number | ''>('');
  const [search, setSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const filteredPayrolls = useMemo(() => {
    return payrolls.filter(p => {
      if (filterWorker && p.workerId !== filterWorker) return false;
      if (filterYear !== '' && p.year !== filterYear) return false;
      if (filterMonth !== '' && p.month !== filterMonth) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!p.workerName.toLowerCase().includes(q) && !p.fileName.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [payrolls, filterWorker, filterYear, filterMonth, search]);

  const resetForm = () => {
    setSelectedWorkerId(''); setFileBase64(''); setFileName(''); setMimeType(''); setNotes(''); setErrorMsg('');
    setMonth(new Date().getMonth()); setYear(new Date().getFullYear());
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 10 * 1024 * 1024) { setErrorMsg('El archivo no puede superar los 10MB.'); return; }
    if (!/(pdf|image\/)/i.test(f.type)) { setErrorMsg('Solo se permiten PDF o imágenes.'); return; }
    const reader = new FileReader();
    reader.onloadend = () => {
      setFileBase64(reader.result as string);
      setFileName(f.name);
      setMimeType(f.type);
      setErrorMsg('');
    };
    reader.readAsDataURL(f);
  };

  const handleUpload = async () => {
    if (!selectedWorkerId) { setErrorMsg('Selecciona un trabajador.'); return; }
    if (!fileBase64) { setErrorMsg('Adjunta un archivo.'); return; }
    const worker = workers.find(w => w.id === selectedWorkerId);
    if (!worker) { setErrorMsg('Trabajador no válido.'); return; }
    setUploading(true);
    const nowTs = Date.now();
    const payroll: Payroll = {
      id: `PAY-${nowTs}`,
      workerId: worker.id,
      workerName: worker.name,
      month, year,
      fileBase64,
      fileName,
      mimeType: mimeType || 'application/octet-stream',
      notes: notes.trim() || undefined,
      uploadedAt: nowTs,
      uploadedBy: adminUsername,
      dateStr: new Date().toLocaleDateString('es-ES'),
    };
    try {
      await StorageService.addPayroll(payroll);
      setSuccessFlash(true);
      setTimeout(() => setSuccessFlash(false), 2500);
      resetForm();
      setUploadOpen(false);
    } catch (e) {
      setErrorMsg('Error guardando la nómina.');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = (p: Payroll) => {
    const a = document.createElement('a');
    a.href = p.fileBase64;
    a.download = p.fileName || `nomina_${p.workerName}_${MONTH_NAMES[p.month]}_${p.year}`;
    a.click();
  };

  const handleDelete = async (id: string) => {
    await StorageService.deletePayroll(id);
    setPendingDelete(null);
  };

  return (
    <div className="space-y-5 animate-fadeIn pb-32" data-testid="admin-payrolls-tab">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="font-serif-display text-4xl text-white">Nóminas</h2>
          <p className="text-[10px] text-stone-500 font-medium uppercase tracking-[0.25em] mt-1">Sube y gestiona las nóminas del personal</p>
        </div>
        <button
          data-testid="open-upload-payroll-btn"
          onClick={() => setUploadOpen(true)}
          className="bg-amber-500 hover:bg-amber-400 text-stone-950 px-5 py-3 rounded-2xl font-bold uppercase text-[11px] tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition active:scale-[0.98]"
        >
          <Plus size={16} /> Subir Nómina
        </button>
      </div>

      {successFlash && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium animate-fadeIn">
          <Check size={16} /> Nómina subida correctamente
        </div>
      )}

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 rounded-3xl bg-stone-900/40 border border-stone-800">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
          <input
            data-testid="payrolls-search-input"
            type="text"
            placeholder="Buscar trabajador o archivo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-stone-950 border border-stone-800 rounded-xl py-2.5 pl-9 pr-3 text-xs text-white outline-none focus:border-amber-500"
          />
        </div>
        <select
          data-testid="payrolls-filter-worker"
          value={filterWorker}
          onChange={(e) => setFilterWorker(e.target.value)}
          className="bg-stone-950 border border-stone-800 rounded-xl py-2.5 px-3 text-xs text-white outline-none focus:border-amber-500"
        >
          <option value="">Todos los trabajadores</option>
          {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select
          data-testid="payrolls-filter-month"
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value === '' ? '' : parseInt(e.target.value))}
          className="bg-stone-950 border border-stone-800 rounded-xl py-2.5 px-3 text-xs text-white outline-none focus:border-amber-500"
        >
          <option value="">Todos los meses</option>
          {MONTH_NAMES.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
        <select
          data-testid="payrolls-filter-year"
          value={filterYear}
          onChange={(e) => setFilterYear(e.target.value === '' ? '' : parseInt(e.target.value))}
          className="bg-stone-950 border border-stone-800 rounded-xl py-2.5 px-3 text-xs text-white outline-none focus:border-amber-500"
        >
          <option value="">Todos los años</option>
          {[now.getFullYear()-2, now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Lista */}
      {filteredPayrolls.length === 0 ? (
        <div className="text-center py-20 rounded-3xl border border-dashed border-stone-800">
          <FileText size={32} className="text-stone-700 mx-auto mb-3" />
          <p className="text-stone-500 text-xs font-medium uppercase tracking-widest">No hay nóminas que coincidan</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredPayrolls.map(p => (
            <div key={p.id} data-testid={`payroll-card-${p.id}`} className="bg-stone-900/60 backdrop-blur-sm border border-stone-800 rounded-3xl p-5 hover:border-amber-500/40 transition group">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <p className="font-serif-display text-2xl text-white leading-none truncate">{MONTH_NAMES[p.month]}</p>
                  <p className="text-[10px] text-amber-500/80 font-mono font-bold uppercase tracking-widest mt-1">{p.year}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
                  <FileText size={16} />
                </div>
              </div>
              <p className="text-sm font-medium text-white truncate">{p.workerName}</p>
              <p className="text-[10px] text-stone-500 font-medium truncate mt-0.5">{p.fileName}</p>
              {p.notes && <p className="text-[10px] text-stone-400 mt-2 line-clamp-2 leading-relaxed">{p.notes}</p>}
              <div className="flex items-center justify-between gap-2 pt-3 mt-3 border-t border-stone-800">
                <span className="text-[9px] text-stone-600 font-mono uppercase tracking-widest">Subida {p.dateStr}</span>
                <div className="flex gap-1">
                  <button data-testid={`download-payroll-${p.id}`} onClick={() => handleDownload(p)} className="p-2 text-amber-500 hover:text-amber-400 transition" title="Descargar"><Download size={14} /></button>
                  {isSuperAdmin && (
                    pendingDelete === p.id ? (
                      <>
                        <button onClick={() => handleDelete(p.id)} className="p-2 text-rose-400 hover:text-rose-300 transition" title="Confirmar"><Check size={14} /></button>
                        <button onClick={() => setPendingDelete(null)} className="p-2 text-stone-500 hover:text-white transition"><X size={14} /></button>
                      </>
                    ) : (
                      <button data-testid={`delete-payroll-${p.id}`} onClick={() => setPendingDelete(p.id)} className="p-2 text-rose-500 hover:text-rose-400 transition" title="Eliminar"><Trash2 size={14} /></button>
                    )
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload modal */}
      {uploadOpen && (
        <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-stone-900 w-full max-w-lg rounded-[2rem] border border-stone-800 shadow-2xl max-h-[95vh] flex flex-col">
            <div className="flex justify-between items-center p-5 border-b border-stone-800 shrink-0">
              <div>
                <h3 className="font-serif-display text-2xl text-white leading-none">Subir Nómina</h3>
                <p className="text-[9px] text-stone-500 font-medium uppercase tracking-[0.25em] mt-1">PDF o imagen, hasta 10 MB</p>
              </div>
              <button data-testid="close-upload-payroll-btn" onClick={() => { setUploadOpen(false); resetForm(); }} className="text-stone-500 hover:text-white p-2"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-stone-500 uppercase tracking-[0.2em]">Trabajador</label>
                <select
                  data-testid="payroll-worker-select"
                  value={selectedWorkerId}
                  onChange={(e) => setSelectedWorkerId(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl py-3 px-3 text-sm text-white outline-none focus:border-amber-500"
                >
                  <option value="">— Selecciona —</option>
                  {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-stone-500 uppercase tracking-[0.2em]">Mes</label>
                  <select data-testid="payroll-month-select" value={month} onChange={(e) => setMonth(parseInt(e.target.value))} className="w-full bg-stone-950 border border-stone-800 rounded-xl py-3 px-3 text-sm text-white outline-none focus:border-amber-500">
                    {MONTH_NAMES.map((m, i) => <option key={m} value={i}>{m}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-stone-500 uppercase tracking-[0.2em]">Año</label>
                  <select data-testid="payroll-year-select" value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="w-full bg-stone-950 border border-stone-800 rounded-xl py-3 px-3 text-sm text-white outline-none focus:border-amber-500">
                    {[now.getFullYear()-2, now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-stone-500 uppercase tracking-[0.2em]">Archivo</label>
                <input ref={fileInputRef} type="file" accept="application/pdf,image/*" onChange={handleFile} className="hidden" data-testid="payroll-file-input" />
                <button onClick={() => fileInputRef.current?.click()} className="w-full bg-stone-950 hover:bg-stone-800 border border-dashed border-stone-700 hover:border-amber-500 rounded-xl py-5 px-4 text-xs font-medium text-stone-400 flex items-center justify-center gap-2 transition">
                  <Upload size={16} />
                  {fileName ? <span className="truncate max-w-[280px]">{fileName}</span> : 'Selecciona PDF o imagen'}
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-stone-500 uppercase tracking-[0.2em]">Notas (opcional)</label>
                <textarea
                  data-testid="payroll-notes-input"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Comentarios sobre la nómina..."
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-sm text-white outline-none focus:border-amber-500 resize-none"
                />
              </div>

              {errorMsg && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] font-medium">
                  <AlertCircle size={14} /> {errorMsg}
                </div>
              )}
            </div>

            <div className="p-5 border-t border-stone-800 shrink-0">
              <button
                data-testid="submit-payroll-btn"
                disabled={uploading || !selectedWorkerId || !fileBase64}
                onClick={handleUpload}
                className={`w-full py-4 rounded-2xl font-bold uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 transition ${
                  uploading || !selectedWorkerId || !fileBase64
                    ? 'bg-stone-800 text-stone-600 cursor-not-allowed'
                    : 'bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-lg shadow-amber-500/20 active:scale-[0.98]'
                }`}
              >
                {uploading ? 'Guardando...' : <><Upload size={14} /> Subir Nómina</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
