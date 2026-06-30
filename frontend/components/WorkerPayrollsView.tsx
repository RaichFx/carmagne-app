import React, { useState, useMemo } from 'react';
import { ChevronLeft, FileText, Download, Filter, Calendar, ScrollText } from 'lucide-react';
import { Worker, Payroll } from '../types';

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

interface WorkerPayrollsViewProps {
  worker: Worker;
  payrolls: Payroll[];
  onBack: () => void;
}

export const WorkerPayrollsView: React.FC<WorkerPayrollsViewProps> = ({ worker, payrolls, onBack }) => {
  const now = new Date();
  const [filterYear, setFilterYear] = useState<number | ''>('');
  const [filterMonth, setFilterMonth] = useState<number | ''>('');

  const myPayrolls = useMemo(() => {
    return payrolls
      .filter(p => p.workerId === worker.id)
      .filter(p => filterYear === '' || p.year === filterYear)
      .filter(p => filterMonth === '' || p.month === filterMonth);
  }, [payrolls, worker.id, filterYear, filterMonth]);

  const years = useMemo(() => {
    const ys = new Set(payrolls.filter(p => p.workerId === worker.id).map(p => p.year));
    if (ys.size === 0) ys.add(now.getFullYear());
    return Array.from(ys).sort((a, b) => b - a);
  }, [payrolls, worker.id]);

  const handleDownload = (p: Payroll) => {
    const a = document.createElement('a');
    a.href = p.fileBase64;
    a.download = p.fileName || `nomina_${MONTH_NAMES[p.month]}_${p.year}`;
    a.click();
  };

  return (
    <div className="flex flex-col h-full animate-fadeIn overflow-hidden">
      <div className="flex items-center justify-between gap-4 mb-5 shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <button onClick={onBack} data-testid="back-from-payrolls" className="p-2.5 bg-stone-900 rounded-xl border border-stone-800 text-stone-400 hover:text-amber-500 transition shrink-0">
            <ChevronLeft size={20} />
          </button>
          <div className="min-w-0">
            <h2 className="font-serif-display text-3xl text-white leading-none">Mis Nóminas</h2>
            <p className="text-[9px] text-amber-500/80 font-mono font-bold uppercase tracking-widest mt-1">
              {myPayrolls.length} disponible{myPayrolls.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-500 shrink-0">
          <ScrollText size={20} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4 shrink-0">
        <select
          data-testid="my-payrolls-filter-year"
          value={filterYear}
          onChange={(e) => setFilterYear(e.target.value === '' ? '' : parseInt(e.target.value))}
          className="bg-stone-900 border border-stone-800 rounded-xl py-3 px-3 text-xs font-medium text-white outline-none focus:border-amber-500"
        >
          <option value="">Todos los años</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select
          data-testid="my-payrolls-filter-month"
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value === '' ? '' : parseInt(e.target.value))}
          className="bg-stone-900 border border-stone-800 rounded-xl py-3 px-3 text-xs font-medium text-white outline-none focus:border-amber-500"
        >
          <option value="">Todos los meses</option>
          {MONTH_NAMES.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pb-6 custom-scrollbar">
        {myPayrolls.length === 0 ? (
          <div className="text-center py-20 rounded-3xl border border-dashed border-stone-800">
            <FileText size={36} className="text-stone-700 mx-auto mb-3" />
            <p className="text-stone-500 text-xs font-medium uppercase tracking-widest">Aún no hay nóminas disponibles</p>
            <p className="text-stone-600 text-[10px] mt-1.5">Tu administrador subirá aquí tus nóminas mensuales</p>
          </div>
        ) : myPayrolls.map(p => (
          <button
            key={p.id}
            data-testid={`my-payroll-${p.id}`}
            onClick={() => handleDownload(p)}
            className="w-full bg-stone-900/60 backdrop-blur-sm border border-stone-800 rounded-2xl p-4 flex items-center gap-4 hover:border-amber-500/40 hover:bg-stone-900 transition active:scale-[0.99] text-left"
          >
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex flex-col items-center justify-center text-amber-500 shrink-0">
              <p className="font-mono text-[8px] font-bold leading-none">{p.year}</p>
              <p className="font-serif-display text-xl leading-none mt-0.5">{(p.month + 1).toString().padStart(2, '0')}</p>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-serif-display text-xl text-white leading-none">{MONTH_NAMES[p.month]} {p.year}</p>
              <p className="text-[10px] text-stone-500 font-medium truncate mt-1">{p.fileName}</p>
              {p.notes && <p className="text-[10px] text-stone-400 line-clamp-1 mt-0.5">{p.notes}</p>}
            </div>
            <div className="text-amber-500 shrink-0">
              <Download size={18} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
