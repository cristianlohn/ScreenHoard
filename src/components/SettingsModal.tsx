import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  X,
  Keyboard,
  Mouse,
  Clock,
  RotateCcw,
  Check,
  Power,
  Video,
} from 'lucide-react';
import type { AppSettings } from '@/types/clipboard';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MOUSE_TRIGGERS = [
  { value: 'Mouse4', label: 'Mouse 4 (Botão Lateral 1 - XBUTTON1)' },
  { value: 'Mouse5', label: 'Mouse 5 (Botão Lateral 2 - XBUTTON2)' },
];

const KEY_TRIGGERS = [
  { value: 'F1', label: 'Tecla F1' },
  { value: 'F2', label: 'Tecla F2' },
  { value: 'F3', label: 'Tecla F3' },
  { value: 'F4', label: 'Tecla F4' },
  { value: 'F5', label: 'Tecla F5' },
  { value: 'F6', label: 'Tecla F6' },
  { value: 'F7', label: 'Tecla F7' },
  { value: 'F8', label: 'Tecla F8' },
  { value: 'F9', label: 'Tecla F9' },
  { value: 'F10', label: 'Tecla F10' },
  { value: 'F11', label: 'Tecla F11' },
  { value: 'F12', label: 'Tecla F12' },
  { value: 'PrintScreen', label: 'Tecla Print Screen (PrtSc)' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [screenshotTrigger, setScreenshotTrigger] = useState('Mouse4');
  const [toggleModalTrigger, setToggleModalTrigger] = useState('Mouse5');
  const [autoClearDays, setAutoClearDays] = useState('30');
  const [gifMaxDuration, setGifMaxDuration] = useState('15');
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Carrega configurações persistidas no SQLite e registro
  useEffect(() => {
    if (isOpen) {
      invoke<AppSettings>('get_shortcuts_config')
        .then((settings) => {
          if (settings.screenshot_trigger) {
            setScreenshotTrigger(settings.screenshot_trigger);
          }
          if (settings.toggle_modal_trigger) {
            setToggleModalTrigger(settings.toggle_modal_trigger);
          }
          if (settings.auto_clear_days) {
            setAutoClearDays(settings.auto_clear_days);
          }
          if (settings.gif_max_duration) {
            setGifMaxDuration(String(settings.gif_max_duration));
          }
        })
        .catch((err) => {
          console.error('[ScreenHoard] Erro ao carregar configurações:', err);
        });

      invoke<boolean>('is_autostart_enabled')
        .then(setAutostartEnabled)
        .catch((err) => {
          console.error('[ScreenHoard] Erro ao consultar autostart:', err);
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Salvar configurações
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await invoke('set_shortcut_config', {
        action: 'screenshot',
        trigger: screenshotTrigger,
      });
      await invoke('set_shortcut_config', {
        action: 'toggle_modal',
        trigger: toggleModalTrigger,
      });
      await invoke('set_shortcut_config', {
        action: 'auto_clear_days',
        trigger: autoClearDays,
      });
      await invoke('set_shortcut_config', {
        action: 'gif_max_duration',
        trigger: gifMaxDuration,
      });
      await invoke('set_autostart_enabled', {
        enabled: autostartEnabled,
      });

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } catch (err) {
      console.error('[ScreenHoard] Falha ao salvar configurações:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Restaurar padrões de fábrica
  const handleRestoreDefaults = async () => {
    setScreenshotTrigger('Mouse4');
    setToggleModalTrigger('Mouse5');
    setAutoClearDays('30');
    setGifMaxDuration('15');
    setAutostartEnabled(true);

    try {
      await invoke('set_shortcut_config', {
        action: 'screenshot',
        trigger: 'Mouse4',
      });
      await invoke('set_shortcut_config', {
        action: 'toggle_modal',
        trigger: 'Mouse5',
      });
      await invoke('set_shortcut_config', {
        action: 'auto_clear_days',
        trigger: '30',
      });
      await invoke('set_shortcut_config', {
        action: 'gif_max_duration',
        trigger: '15',
      });
      await invoke('set_autostart_enabled', {
        enabled: true,
      });

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } catch (err) {
      console.error('[ScreenHoard] Falha ao restaurar padrões:', err);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-150 select-none">
      <div className="w-full max-w-lg rounded-2xl glass-panel border border-white/10 shadow-2xl overflow-hidden flex flex-col">
        {/* Cabeçalho com Identidade Visual em Destaque */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-zinc-950/50">
          <div className="flex items-center gap-3.5">
            <img
              src="/icon.png"
              alt="ScreenHoard Logo"
              className="w-12 h-12 rounded-xl border border-white/15 shadow-lg shadow-violet-500/10 object-cover flex-shrink-0"
            />
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400">
                  ScreenHoard
                </h2>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  v0.1.0
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Utilitário nativo de histórico de área de transferência e captura instantânea.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 transition-colors flex-shrink-0"
            title="Fechar configurações"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo do Painel */}
        <div className="p-5 flex flex-col gap-4 text-xs text-zinc-300 overflow-y-auto max-h-[380px]">
          {/* Gatilho de Captura de Tela */}
          <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-zinc-900/40 border border-white/5">
            <div className="flex items-center justify-between">
              <label className="font-medium text-zinc-200 flex items-center gap-2">
                <Mouse className="w-3.5 h-3.5 text-blue-400" />
                Gatilho para Captura de Tela
              </label>
              <span className="text-[10px] text-zinc-500">Padrão: Mouse 4</span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Dispara screenshot instantâneo do monitor onde o mouse se encontra e copia para o clipboard.
            </p>
            <select
              value={screenshotTrigger}
              onChange={(e) => setScreenshotTrigger(e.target.value)}
              className="mt-1 px-3 py-1.5 rounded-lg glass-input text-zinc-100 text-xs focus:outline-none cursor-pointer"
            >
              <optgroup label="Botões do Mouse">
                {MOUSE_TRIGGERS.map((t) => (
                  <option key={t.value} value={t.value} className="bg-zinc-900 text-zinc-100">
                    {t.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Teclas de Atalho">
                {KEY_TRIGGERS.map((t) => (
                  <option key={t.value} value={t.value} className="bg-zinc-900 text-zinc-100">
                    {t.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Gatilho para Alternar Janela Modal */}
          <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-zinc-900/40 border border-white/5">
            <div className="flex items-center justify-between">
              <label className="font-medium text-zinc-200 flex items-center gap-2">
                <Keyboard className="w-3.5 h-3.5 text-emerald-400" />
                Gatilho para Exibir/Ocultar Modal
              </label>
              <span className="text-[10px] text-zinc-500">Padrão: Mouse 5</span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Abre a janela centralizada no monitor ativo e foca na busca, ou fecha se já estiver aberta.
            </p>
            <select
              value={toggleModalTrigger}
              onChange={(e) => setToggleModalTrigger(e.target.value)}
              className="mt-1 px-3 py-1.5 rounded-lg glass-input text-zinc-100 text-xs focus:outline-none cursor-pointer"
            >
              <optgroup label="Botões do Mouse">
                {MOUSE_TRIGGERS.map((t) => (
                  <option key={t.value} value={t.value} className="bg-zinc-900 text-zinc-100">
                    {t.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Teclas de Atalho">
                {KEY_TRIGGERS.map((t) => (
                  <option key={t.value} value={t.value} className="bg-zinc-900 text-zinc-100">
                    {t.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Limpeza Automática do Histórico */}
          <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-zinc-900/40 border border-white/5">
            <div className="flex items-center justify-between">
              <label className="font-medium text-zinc-200 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-purple-400" />
                Limpeza Automática (Garbage Collection)
              </label>
              <span className="text-[10px] text-zinc-500">Padrão: 30 dias</span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Remove mídias e registros antigos ao iniciar o app. Itens fixados nunca são excluídos.
            </p>
            <select
              value={autoClearDays}
              onChange={(e) => setAutoClearDays(e.target.value)}
              className="mt-1 px-3 py-1.5 rounded-lg glass-input text-zinc-100 text-xs focus:outline-none cursor-pointer"
            >
              <option value="7" className="bg-zinc-900 text-zinc-100">7 dias</option>
              <option value="15" className="bg-zinc-900 text-zinc-100">15 dias</option>
              <option value="30" className="bg-zinc-900 text-zinc-100">30 dias</option>
              <option value="60" className="bg-zinc-900 text-zinc-100">60 dias</option>
              <option value="90" className="bg-zinc-900 text-zinc-100">90 dias</option>
              <option value="0" className="bg-zinc-900 text-zinc-100">Desativado (manter tudo)</option>
            </select>
          </div>

          {/* Duração Máxima da Gravação de GIF */}
          <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-zinc-900/40 border border-white/5">
            <div className="flex items-center justify-between">
              <label className="font-medium text-zinc-200 flex items-center gap-2">
                <Video className="w-3.5 h-3.5 text-pink-400" />
                Duração Máxima da Gravação de GIF
              </label>
              <span className="text-[10px] text-zinc-500">Padrão: 15s</span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Tempo limite automático para capturar a tela em GIF animado. A gravação pode ser interrompida a qualquer momento.
            </p>
            <select
              value={gifMaxDuration}
              onChange={(e) => setGifMaxDuration(e.target.value)}
              className="mt-1 px-3 py-1.5 rounded-lg glass-input text-zinc-100 text-xs focus:outline-none cursor-pointer"
            >
              <option value="5" className="bg-zinc-900 text-zinc-100">5 segundos</option>
              <option value="10" className="bg-zinc-900 text-zinc-100">10 segundos</option>
              <option value="15" className="bg-zinc-900 text-zinc-100">15 segundos (Padrão)</option>
              <option value="30" className="bg-zinc-900 text-zinc-100">30 segundos</option>
              <option value="60" className="bg-zinc-900 text-zinc-100">60 segundos</option>
            </select>
          </div>

          {/* Inicialização Automática com o Windows */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/40 border border-white/5">
            <div className="flex flex-col gap-1 pr-4">
              <label className="font-medium text-zinc-200 flex items-center gap-2">
                <Power className="w-3.5 h-3.5 text-emerald-400" />
                Iniciar com o Windows
              </label>
              <p className="text-[11px] text-zinc-400">
                Inicia silenciosamente na bandeja do sistema (System Tray) ao ligar o computador.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                checked={autostartEnabled}
                onChange={(e) => setAutostartEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>
        </div>

        {/* Rodapé de Ações */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-white/10 bg-zinc-950/40">
          <button
            onClick={handleRestoreDefaults}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 transition-colors text-xs font-medium"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restaurar Padrões</span>
          </button>

          <div className="flex items-center gap-2">
            {savedSuccess && (
              <span className="flex items-center gap-1 text-emerald-400 text-xs animate-in fade-in">
                <Check className="w-3.5 h-3.5" />
                <span>Salvo!</span>
              </span>
            )}

            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-md shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-50"
            >
              {isSaving ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
