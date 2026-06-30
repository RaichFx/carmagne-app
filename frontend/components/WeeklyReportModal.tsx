import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Camera as CameraIcon, Upload, X, Sparkles, FileText, Calendar,
  Clock, MapPin, ClipboardList, Save, RefreshCw, AlertTriangle,
  CheckCircle2, Image as ImageIcon, ChevronLeft, Trash2
} from 'lucide-react';
import { StorageService } from '../services/storageService';
import { WeeklyReportService } from '../services/weeklyReportService';
import { TelegramService } from '../services/telegramService';
import { Worker, WeeklyReport, WeeklyReportExtracted } from '../types';

interface WeeklyReportModalProps {
  worker: Worker;
  onClose: () => void;
  existingReports: WeeklyReport[];
}

type Phase = 'CAPTURE' | 'PREVIEW' | 'EXTRACTING' | 'FORM' | 'SUCCESS';

export const WeeklyReportModal: React.FC<WeeklyReportModalProps> = ({ worker, onClose, existingReports }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [phase, setPhase] = useState<Phase>('CAPTURE');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [imageBase64, setImageBase64] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [extracted, setExtracted] = useState<WeeklyReportExtracted>({});
  const [extractError, setExtractError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const defaultWeek = useMemo(() => WeeklyReportService.getWeekRange(new Date()), []);

  const [form, setForm] = useState({
    weekStart: defaultWeek.start,
    weekEnd: defaultWeek.end,
    totalHours: '',
    siteName: '',
    tasks: '',
    notes: '',
  });

  const currentWeekRange = WeeklyReportService.getWeekRange(new Date());
  const hasCurrentWeekReport = existingReports.some(
    r => r.workerId === worker.id &&
      r.weekStart === currentWeekRange.start &&
      r.weekEnd === currentWeekRange.end
  );

  // Keep the active stream in a ref so the unmount cleanup always sees the latest tracks.
  // Prevents the stale-closure bug where the cleanup captured the initial (null) stream.
  const streamRef = useRef<MediaStream | null>(null);
  useEffect(() => { streamRef.current = stream; }, [stream]);

  const stopCamera = () => {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach(t => t.stop());
      setStream(null);
      streamRef.current = null;
    }
    setCameraOpen(false);
  };

  // On unmount only, stop any active camera stream.
  useEffect(() => {
    return () => {
      const s = streamRef.current;
      if (s) {
        s.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const startCamera = async () => {
    setCameraError('');
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      setStream(mediaStream);
      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = mediaStream;
      }, 50);
    } catch (err) {
      console.error(err);
      setCameraError('No se pudo acceder a la cámara. Comprueba los permisos del navegador.');
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Limit max width to 1600 to keep base64 size reasonable
    const maxW = 1600;
    const scale = Math.min(1, maxW / (video.videoWidth || maxW));
    canvas.width = (video.videoWidth || maxW) * scale;
    canvas.height = (video.videoHeight || maxW) * scale;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    stopCamera();
    setImageBase64(dataUrl);
    setFileName(`captura_${Date.now()}.jpg`);
    setPhase('PREVIEW');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setExtractError('Solo se permiten imágenes (JPG, PNG, WEBP).');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setExtractError('El archivo es demasiado grande. Máximo 8MB.');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Optionally downscale large images via canvas
      const img = new Image();
      img.onload = () => {
        const maxW = 1600;
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL('image/jpeg', 0.85);
        setImageBase64(compressed);
        setFileName(file.name);
        setExtractError('');
        setPhase('PREVIEW');
      };
      img.onerror = () => {
        setImageBase64(result);
        setFileName(file.name);
        setPhase('PREVIEW');
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  const runExtraction = async () => {
    setPhase('EXTRACTING');
    setExtractError('');
    try {
      const res = await WeeklyReportService.extractFromImage(imageBase64);
      if (res.success) {
        setExtracted(res.data);
        // Prefill form with extracted data
        setForm(prev => ({
          weekStart: res.data.weekStart || prev.weekStart,
          weekEnd: res.data.weekEnd || prev.weekEnd,
          totalHours: res.data.totalHours != null ? String(res.data.totalHours) : prev.totalHours,
          siteName: res.data.siteName || prev.siteName,
          tasks: (res.data.tasks && res.data.tasks.length > 0)
            ? res.data.tasks.join('\n- ').replace(/^/, '- ')
            : prev.tasks,
          notes: res.data.notes || prev.notes,
        }));
      } else {
        setExtractError(res.error || 'No se pudieron extraer los datos. Rellena el formulario manualmente.');
      }
    } catch (err: any) {
      setExtractError(err?.message || 'Error de red al extraer los datos.');
    } finally {
      setPhase('FORM');
    }
  };

  const submitReport = async () => {
    if (!form.weekStart || !form.weekEnd) {
      setExtractError('Selecciona el rango de semana.');
      return;
    }
    setSubmitting(true);
    const now = new Date();
    const report: WeeklyReport = {
      id: `WR-${Date.now()}`,
      workerId: worker.id,
      workerName: worker.name,
      weekStart: form.weekStart,
      weekEnd: form.weekEnd,
      totalHours: parseFloat(form.totalHours) || 0,
      siteName: form.siteName.trim(),
      tasks: form.tasks.trim(),
      notes: form.notes.trim() || undefined,
      photoBase64: imageBase64,
      fileName: fileName || undefined,
      extracted,
      status: 'ENVIADO',
      createdAt: Date.now(),
      dateStr: now.toLocaleDateString('es-ES'),
      timeStr: now.toLocaleTimeString('es-ES'),
    };
    try {
      await StorageService.addWeeklyReport(report);

      // Send Telegram notification to admin (non-blocking)
      const tasksLines = report.tasks
        ? '\n' + report.tasks.split('\n').slice(0, 4).map(l => `• ${l.replace(/^[-•]\s*/, '')}`).join('\n')
        : '';
      const message =
        `📋 <b>Nuevo Parte Semanal</b>\n\n` +
        `👷 <b>${report.workerName}</b>\n` +
        `📅 ${report.weekStart} → ${report.weekEnd}\n` +
        `⏱ ${report.totalHours.toFixed(1)} horas\n` +
        (report.siteName ? `📍 ${report.siteName}\n` : '') +
        (tasksLines ? `\n<b>Tareas:</b>${tasksLines}` : '') +
        (report.notes ? `\n\n📝 ${report.notes}` : '') +
        `\n\n<i>Enviado: ${report.dateStr} ${report.timeStr}</i>`;
      TelegramService.enviarNotificacionTelegram(message).catch(() => {});

      setPhase('SUCCESS');
    } catch (err) {
      setExtractError('Error guardando el parte semanal.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 animate-fadeIn" data-testid="weekly-report-modal">
      <div className="bg-stone-900 w-full max-w-md rounded-[2rem] border border-stone-800 shadow-2xl relative overflow-hidden max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-stone-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-600/10 rounded-xl text-amber-400">
              <FileText size={20} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white tracking-tight leading-none">Parte Semanal</h3>
              <p className="text-[9px] text-stone-500 font-medium uppercase tracking-[0.18em] mt-1">
                {phase === 'CAPTURE' && 'Subir / Hacer Foto'}
                {phase === 'PREVIEW' && 'Vista Previa'}
                {phase === 'EXTRACTING' && 'Analizando con IA...'}
                {phase === 'FORM' && 'Confirma los datos'}
                {phase === 'SUCCESS' && 'Enviado correctamente'}
              </p>
            </div>
          </div>
          <button data-testid="close-weekly-report-btn" onClick={onClose} className="text-stone-500 hover:text-white p-2"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
          {/* CAPTURE PHASE */}
          {phase === 'CAPTURE' && !cameraOpen && (
            <div className="space-y-4">
              {hasCurrentWeekReport && (
                <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-200 font-medium leading-relaxed">
                    Ya has enviado un parte esta semana. Si subes otro quedará registrado como adicional.
                  </p>
                </div>
              )}

              <p className="text-xs text-stone-400 leading-relaxed">
                Sube una foto o un archivo de tu parte semanal. La IA extraerá automáticamente las horas, días y tareas para que solo tengas que confirmar.
              </p>

              <button
                data-testid="open-camera-btn"
                onClick={startCamera}
                className="w-full bg-amber-600 hover:bg-amber-500 active:scale-[0.98] text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 shadow-lg transition"
              >
                <CameraIcon size={20} /> Usar Cámara
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                data-testid="weekly-report-file-input"
              />
              <button
                data-testid="upload-file-btn"
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-stone-800 hover:bg-stone-700 active:scale-[0.98] text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 border border-stone-700 transition"
              >
                <Upload size={20} /> Subir Archivo
              </button>

              {cameraError && (
                <p className="text-rose-400 text-[11px] font-bold text-center">{cameraError}</p>
              )}
              {extractError && (
                <p className="text-rose-400 text-[11px] font-bold text-center">{extractError}</p>
              )}
            </div>
          )}

          {/* CAMERA VIEW */}
          {phase === 'CAPTURE' && cameraOpen && (
            <div className="space-y-3">
              <div className="relative rounded-2xl overflow-hidden bg-black border border-amber-500/40">
                <video ref={videoRef} autoPlay playsInline className="w-full h-72 object-cover" />
                <canvas ref={canvasRef} className="hidden" />
                <div className="absolute top-2 right-2 px-2 py-1 bg-black/60 rounded-full text-[9px] font-semibold text-white uppercase tracking-widest">EN VIVO</div>
              </div>
              <div className="flex gap-3">
                <button data-testid="cancel-camera-btn" onClick={stopCamera} className="flex-1 bg-stone-800 text-stone-300 py-3 rounded-2xl font-black uppercase text-xs tracking-widest">Cancelar</button>
                <button data-testid="capture-photo-btn" onClick={capturePhoto} className="flex-1 bg-amber-600 text-white py-3 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2">
                  <CameraIcon size={16} /> Capturar
                </button>
              </div>
            </div>
          )}

          {/* PREVIEW */}
          {phase === 'PREVIEW' && (
            <div className="space-y-4">
              <div className="rounded-2xl overflow-hidden border border-stone-800 bg-stone-950 relative">
                <img src={imageBase64} alt="Parte semanal" className="w-full max-h-80 object-contain" />
                {fileName && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                    <p className="text-[10px] text-white font-medium uppercase tracking-[0.18em] truncate flex items-center gap-2">
                      <ImageIcon size={12} /> {fileName}
                    </p>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  data-testid="retake-photo-btn"
                  onClick={() => { setImageBase64(''); setFileName(''); setPhase('CAPTURE'); }}
                  className="flex-1 bg-stone-800 text-stone-300 py-3 rounded-2xl font-black uppercase text-[11px] tracking-widest flex items-center justify-center gap-2"
                >
                  <RefreshCw size={14} /> Cambiar
                </button>
                <button
                  data-testid="extract-with-ai-btn"
                  onClick={runExtraction}
                  className="flex-[2] bg-gradient-to-r from-amber-600 to-orange-600 text-white py-3 rounded-2xl font-black uppercase text-[11px] tracking-widest flex items-center justify-center gap-2 shadow-lg"
                >
                  <Sparkles size={14} /> Extraer con IA
                </button>
              </div>
              <button
                data-testid="skip-extract-btn"
                onClick={() => setPhase('FORM')}
                className="w-full text-stone-500 hover:text-stone-300 text-[10px] font-black uppercase tracking-[0.2em] py-2"
              >
                Saltar y rellenar manualmente
              </button>
            </div>
          )}

          {/* EXTRACTING */}
          {phase === 'EXTRACTING' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
                <Sparkles size={20} className="absolute inset-0 m-auto text-amber-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-white uppercase tracking-widest">Analizando imagen</p>
                <p className="text-[10px] text-stone-500 font-medium uppercase tracking-[0.18em] mt-1">Esto puede tardar unos segundos</p>
              </div>
            </div>
          )}

          {/* FORM */}
          {phase === 'FORM' && (
            <div className="space-y-4">
              {imageBase64 && (
                <div className="flex items-center gap-3 p-3 bg-stone-950 border border-stone-800 rounded-2xl">
                  <img src={imageBase64} alt="thumb" className="w-14 h-14 object-cover rounded-lg" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-stone-500 font-medium uppercase tracking-[0.18em]">Adjunto</p>
                    <p className="text-xs text-white font-bold truncate">{fileName || 'Imagen'}</p>
                  </div>
                  {extracted.totalHours != null && (
                    <div className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[9px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                      <Sparkles size={10} /> IA
                    </div>
                  )}
                </div>
              )}

              {extractError && (
                <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-amber-200 font-medium">{extractError}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest ml-1 flex items-center gap-1">
                    <Calendar size={10} /> Inicio Semana
                  </label>
                  <input
                    data-testid="week-start-input"
                    type="date"
                    value={form.weekStart}
                    onChange={(e) => setForm({ ...form, weekStart: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-xs text-white outline-none focus:border-amber-500 [color-scheme:dark]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest ml-1 flex items-center gap-1">
                    <Calendar size={10} /> Fin Semana
                  </label>
                  <input
                    data-testid="week-end-input"
                    type="date"
                    value={form.weekEnd}
                    onChange={(e) => setForm({ ...form, weekEnd: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-xs text-white outline-none focus:border-amber-500 [color-scheme:dark]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest ml-1 flex items-center gap-1">
                  <Clock size={10} /> Total de Horas
                </label>
                <input
                  data-testid="total-hours-input"
                  type="number"
                  min="0"
                  step="0.5"
                  value={form.totalHours}
                  onChange={(e) => setForm({ ...form, totalHours: e.target.value })}
                  placeholder="40"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-sm text-white outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest ml-1 flex items-center gap-1">
                  <MapPin size={10} /> Obra / Proyecto
                </label>
                <input
                  data-testid="site-name-input"
                  type="text"
                  value={form.siteName}
                  onChange={(e) => setForm({ ...form, siteName: e.target.value })}
                  placeholder="Nombre de la obra"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-sm text-white outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest ml-1 flex items-center gap-1">
                  <ClipboardList size={10} /> Tareas Realizadas
                </label>
                <textarea
                  data-testid="tasks-input"
                  value={form.tasks}
                  onChange={(e) => setForm({ ...form, tasks: e.target.value })}
                  rows={4}
                  placeholder="Resumen de las tareas..."
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-sm text-white outline-none focus:border-amber-500 resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest ml-1">Notas (opcional)</label>
                <textarea
                  data-testid="notes-input"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-sm text-white outline-none focus:border-amber-500 resize-none"
                />
              </div>

              <button
                data-testid="submit-weekly-report-btn"
                disabled={submitting || !imageBase64}
                onClick={submitReport}
                className={`w-full py-4 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 shadow-lg transition ${
                  submitting || !imageBase64
                    ? 'bg-stone-800 text-stone-500 cursor-not-allowed'
                    : 'bg-amber-600 text-white hover:bg-amber-500 active:scale-[0.98]'
                }`}
              >
                {submitting ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                {submitting ? 'Enviando...' : 'Enviar Parte Semanal'}
              </button>

              {!imageBase64 && (
                <button
                  onClick={() => setPhase('CAPTURE')}
                  className="w-full text-amber-400 hover:text-amber-300 text-[10px] font-black uppercase tracking-[0.2em] py-2 flex items-center justify-center gap-2"
                >
                  <ChevronLeft size={12} /> Adjuntar una foto
                </button>
              )}
            </div>
          )}

          {/* SUCCESS */}
          {phase === 'SUCCESS' && (
            <div className="flex flex-col items-center justify-center py-12 gap-5 text-center">
              <div className="w-20 h-20 bg-emerald-600 rounded-3xl flex items-center justify-center shadow-2xl">
                <CheckCircle2 size={40} className="text-white" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white tracking-tight">¡Parte enviado!</h3>
                <p className="text-stone-500 text-xs font-medium uppercase tracking-[0.18em] mt-2">Tu parte semanal ha sido guardado correctamente</p>
              </div>
              <button
                data-testid="weekly-success-close-btn"
                onClick={onClose}
                className="bg-stone-800 hover:bg-stone-700 text-white px-8 py-3 rounded-xl font-black border border-stone-700 uppercase tracking-widest text-[11px] shadow-lg"
              >
                Cerrar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
