import React from 'react';
import { AlertTriangle, X, Check } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  isDestructive = false,
  onConfirm,
  onCancel
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden transform transition-all scale-100">
        
        {/* Header */}
        <div className="p-5 flex items-center gap-3 border-b border-slate-800">
          <div className={`p-2.5 rounded-full ${isDestructive ? 'bg-rose-900/30 text-rose-500' : 'bg-blue-900/30 text-blue-500'}`}>
            {isDestructive ? <AlertTriangle size={24} /> : <Check size={24} />}
          </div>
          <h3 className="text-lg font-bold text-white tracking-tight">
            {title}
          </h3>
          <button onClick={onCancel} className="ml-auto text-slate-400 hover:text-white transition">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <p className="text-slate-300 text-sm leading-relaxed font-medium">
            {message}
          </p>
        </div>

        {/* Footer */}
        <div className="bg-slate-950/50 p-4 flex gap-3 justify-end border-t border-slate-800">
          <button
            onClick={onCancel}
            className="px-5 py-3 rounded-xl text-sm font-bold text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-6 py-3 rounded-xl text-sm font-bold text-white shadow-lg transition transform active:scale-95 ${
              isDestructive 
                ? 'bg-rose-600 hover:bg-rose-500' 
                : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};