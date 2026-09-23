import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
import { Check, Zap, Monitor, Play, Pause, X, ScanText } from 'lucide-react';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type OverlayState = 'SELECTING' | 'ARMED' | 'RECORDING';
type OverlayMode = 'record' | 'ocr_snip';

const BAR_WIDTH = 440;
const BAR_HEIGHT = 48;

export const RecorderOverlay: React.FC = () => {
  const [state, setState] = useState<OverlayState>('SELECTING');
  const [isSelecting, setIsSelecting] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedArea, setSelectedArea] = useState<Rect | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [maxRecordingDuration, setMaxRecordingDuration] = useState(15);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1.0);
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('record');
  const [isProcessingSnip, setIsProcessingSnip] = useState(false);
  const [snipFeedback, setSnipFeedback] = useState<string | null>(null);

  const timerRef = useRef<number | null>(null);

  // Formatação de tempo 00:00
  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Carrega a duração máxima configurada no SQLite
  useEffect(() => {
    invoke<string | null>('get_setting', { key: 'gif_max_duration' })
      .then((val) => {
        if (val) {
          const parsed = Number(val);
          if (parsed > 0) setMaxRecordingDuration(parsed);
        }
      })
      .catch(() => {});
  }, []);

  // Prepara overlay para nova seleção ao receber evento do backend
  useEffect(() => {
    const unlistenPrepare = listen<{ mode?: OverlayMode }>('prepare-selection', (event) => {
      const mode = event.payload?.mode || 'record';
      setOverlayMode(mode);
      setState('SELECTING');
      setIsSelecting(false);
      setStartPos(null);
      setCurrentPos(null);
      setSelectedArea(null);
      setIsPaused(false);
      setRecordingDuration(0);
      setIsProcessingSnip(false);
      setSnipFeedback(null);
    });

    const unlistenFinished = listen('recording-finished', () => {
      handleClose();
    });

    return () => {
      unlistenPrepare.then((f) => f());
      unlistenFinished.then((f) => f());
    };
  }, []);

  // Timer de gravação com suporte a pause/resume
  useEffect(() => {
    if (state === 'RECORDING' && !isPaused) {
      timerRef.current = window.setInterval(() => {
        setRecordingDuration((prev) => {
          if (prev + 1 >= maxRecordingDuration) {
            handleStop();
            return maxRecordingDuration;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state, isPaused, maxRecordingDuration]);

  // Teclado: Esc para cancelar ou parar, F para tela inteira
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (state === 'RECORDING') {
          handleStop();
        } else {
          handleClose();
        }
      } else if ((e.key === 'f' || e.key === 'F') && state === 'SELECTING' && !isSelecting) {
        e.preventDefault();
        startFullScreenRecording();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, isSelecting, maxRecordingDuration, speedMultiplier, selectedArea]);

  // Redimensiona o overlay para a barra de controle (390x48px) e exibe a borda vermelha nativa
  const armRecording = async (area: Rect | null) => {
    try {
      const screenW = window.screen.width;
      const screenH = window.screen.height;

      let barLeft = area ? area.x + Math.round((area.width - BAR_WIDTH) / 2) : Math.round((screenW - BAR_WIDTH) / 2);
      let barTop: number;

      if (!area) {
        barTop = screenH - BAR_HEIGHT - 55;
      } else {
        const hasSpaceAbove = area.y >= BAR_HEIGHT + 15;
        const hasSpaceBelow = (area.y + area.height + BAR_HEIGHT + 15) <= (screenH - 50);

        if (hasSpaceAbove) {
          // Espaço suficiente acima da área gravada
          barTop = area.y - BAR_HEIGHT - 10;
        } else if (hasSpaceBelow) {
          // Espaço suficiente abaixo da área gravada
          barTop = area.y + area.height + 10;
        } else {
          // Área ocupa quase todo o ecrã verticalmente: posicionar DENTRO da área no topo
          // Como WDA_EXCLUDEFROMCAPTURE está ativo, a barra não será capturada no GIF
          barTop = area.y + 16;
        }
      }

      // Clamp obrigatório contra todas as margens do ecrã e barra de tarefas
      const safeBarLeft = Math.max(16, Math.min(barLeft, screenW - BAR_WIDTH - 16));
      const safeBarTop = Math.max(16, Math.min(barTop, screenH - BAR_HEIGHT - 55));

      console.log('[OVERLAY] Posição da barra:', { safeBarLeft, safeBarTop, screenW, screenH });

      // Transitar o estado do React imediatamente para ARMED
      setSelectedArea(area);
      setState('ARMED');

      const dpr = window.devicePixelRatio || 1;
      const overlayWin = getCurrentWebviewWindow();

      // Obter posição física absoluta da janela no monitor (offset em multi-monitor)
      const winPos = await overlayWin.outerPosition();
      const monitorOffsetX = winPos?.x && Math.abs(winPos.x) > 50 ? winPos.x : 0;
      const monitorOffsetY = winPos?.y && Math.abs(winPos.y) > 50 ? winPos.y : 0;

      // Redimensionar, reposicionar, exibir e forçar Always-On-Top
      await overlayWin.setFullscreen(false);
      await overlayWin.setSize(new PhysicalSize(Math.round(BAR_WIDTH * dpr), Math.round(BAR_HEIGHT * dpr)));
      await overlayWin.setPosition(new PhysicalPosition(monitorOffsetX + Math.round(safeBarLeft * dpr), monitorOffsetY + Math.round(safeBarTop * dpr)));
      await overlayWin.setAlwaysOnTop(true);
      await overlayWin.show();
      await overlayWin.setFocus();

      // Exibir borda vermelha demarcadora nativa se área selecionada
      if (area) {
        const borderX = monitorOffsetX + Math.round(area.x * dpr);
        const borderY = monitorOffsetY + Math.round(area.y * dpr);
        const borderW = Math.round(area.width * dpr);
        const borderH = Math.round(area.height * dpr);
        await invoke('show_capture_border', {
          x: borderX,
          y: borderY,
          width: borderW,
          height: borderH,
        });
      } else {
        await invoke('hide_capture_border');
      }
    } catch (err) {
      console.error('Erro no RecorderOverlay ao armar:', err);
      handleClose();
    }
  };

  // Dispara a gravação ativa a partir do estado ARMED
  const startRecording = async () => {
    try {
      const dpr = window.devicePixelRatio || 1;
      const physicalArea = selectedArea
        ? {
            x: Math.round(selectedArea.x * dpr),
            y: Math.round(selectedArea.y * dpr),
            width: Math.round(selectedArea.width * dpr),
            height: Math.round(selectedArea.height * dpr),
          }
        : null;

      setState('RECORDING');
      setIsPaused(false);
      setRecordingDuration(0);

      await invoke('start_screen_recording', {
        maxSeconds: maxRecordingDuration,
        max_seconds: maxRecordingDuration,
        speedMultiplier: speedMultiplier,
        speed_multiplier: speedMultiplier,
        area: physicalArea,
      });
    } catch (err) {
      console.error('Erro no RecorderOverlay ao iniciar gravação:', err);
      handleClose();
    }
  };

  // Pausar gravação ativa
  const handlePause = async () => {
    try {
      await invoke('pause_screen_recording');
      setIsPaused(true);
    } catch (err) {
      console.error('Erro no RecorderOverlay ao pausar gravação:', err);
    }
  };

  // Retomar gravação pausada
  const handleResume = async () => {
    try {
      await invoke('resume_screen_recording');
      setIsPaused(false);
    } catch (err) {
      console.error('Erro no RecorderOverlay ao retomar gravação:', err);
    }
  };

  // Gravação em tela inteira
  const startFullScreenRecording = () => {
    try {
      setSelectedArea(null);
      armRecording(null);
    } catch (err) {
      console.error('Erro no RecorderOverlay:', err);
    }
  };

  // Para gravação
  const handleStop = async () => {
    try {
      await invoke('hide_capture_border');
      await invoke('stop_screen_recording');
    } catch (err) {
      console.error('[ScreenHoard Overlay] Erro ao parar gravação:', err);
    } finally {
      handleClose();
    }
  };

  // Fecha o overlay e reseta estado
  const handleClose = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setState('SELECTING');
    setIsPaused(false);
    setIsSelecting(false);
    setSelectedArea(null);
    try {
      await invoke('hide_capture_border');
    } catch {}
    try {
      await invoke('close_recorder_overlay');
    } catch {}
  };

  // Alterar velocidade em tempo real
  const handleSpeedChange = async (newSpeed: number) => {
    setSpeedMultiplier(newSpeed);
    try {
      await invoke('set_recording_speed', { speed: newSpeed });
    } catch (err) {
      console.error('[ScreenHoard Overlay] Erro ao alterar velocidade:', err);
    }
  };

  // Manipuladores de mouse para desenhar retângulo
  const handleMouseDown = (e: React.MouseEvent) => {
    if (state !== 'SELECTING' || e.button !== 0) return;
    setStartPos({ x: e.clientX, y: e.clientY });
    setCurrentPos({ x: e.clientX, y: e.clientY });
    setIsSelecting(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isSelecting || state !== 'SELECTING') return;
    setCurrentPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = async () => {
    try {
      if (!isSelecting || state !== 'SELECTING' || !startPos || !currentPos) return;
      setIsSelecting(false);

      const x = Math.min(startPos.x, currentPos.x);
      const y = Math.min(startPos.y, currentPos.y);
      const width = Math.abs(currentPos.x - startPos.x);
      const height = Math.abs(currentPos.y - startPos.y);

      // Modo Snip OCR: captura imediata em memória e injeção no clipboard
      if (overlayMode === 'ocr_snip') {
        if (width >= 10 && height >= 10) {
          setIsProcessingSnip(true);
          const dpr = window.devicePixelRatio || 1;
          const overlayWin = getCurrentWebviewWindow();
          const winPos = await overlayWin.outerPosition();
          const monitorOffsetX = winPos?.x && Math.abs(winPos.x) > 50 ? winPos.x : 0;
          const monitorOffsetY = winPos?.y && Math.abs(winPos.y) > 50 ? winPos.y : 0;

          const physicalX = monitorOffsetX + Math.round(x * dpr);
          const physicalY = monitorOffsetY + Math.round(y * dpr);
          const physicalW = Math.round(width * dpr);
          const physicalH = Math.round(height * dpr);

          try {
            const extracted = await invoke<string>('snip_ocr_rect', {
              x: physicalX,
              y: physicalY,
              width: physicalW,
              height: physicalH,
            });

            if (extracted && extracted.trim().length > 0) {
              setSnipFeedback('Texto copiado para a área de transferência!');
            } else {
              setSnipFeedback('Nenhum texto identificado nesta imagem');
            }
          } catch (err) {
            console.error('[Snip OCR] Erro ao extrair texto:', err);
            setSnipFeedback('Falha na extração de texto');
          } finally {
            setIsProcessingSnip(false);
            setTimeout(() => {
              handleClose();
            }, 650);
          }
        } else {
          setStartPos(null);
          setCurrentPos(null);
        }
        return;
      }

      if (width >= 40 && height >= 40) {
        const area: Rect = { x, y, width, height };
        await armRecording(area);
      } else {
        // Clique rápido ou área muito pequena cancela seleção
        setStartPos(null);
        setCurrentPos(null);
      }
    } catch (err) {
      console.error('Erro no RecorderOverlay:', err);
    }
  };

  // Calcula coordenadas atuais da seleção
  const currentRect: Rect | null =
    isSelecting && startPos && currentPos
      ? {
          x: Math.min(startPos.x, currentPos.x),
          y: Math.min(startPos.y, currentPos.y),
          width: Math.abs(currentPos.x - startPos.x),
          height: Math.abs(currentPos.y - startPos.y),
        }
      : selectedArea;

  // Estado ARMED: Aguardando o clique do usuário em "▶ Gravar"
  if (state === 'ARMED') {
    return (
      <div className="w-full h-full flex items-center justify-between px-3 gap-2 whitespace-nowrap overflow-hidden bg-zinc-950/95 border border-zinc-700/90 rounded-xl shadow-2xl backdrop-blur-xl select-none">
        {/* Dimensões da Área */}
        <div className="flex items-center gap-1.5 text-xs font-mono text-cyan-300 font-semibold shrink-0">
          <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />
          <span>
            {selectedArea
              ? `${Math.round(selectedArea.width)} × ${Math.round(selectedArea.height)}`
              : 'Tela Inteira'}
          </span>
        </div>

        <div className="w-[1px] h-4 bg-white/15 shrink-0" />

        {/* Seletor de Velocidade (1x Normal / 2x Rápido) */}
        <div className="flex items-center gap-1 bg-zinc-900/90 p-0.5 rounded-lg border border-white/10 text-[11px] font-medium shrink-0">
          <button
            onClick={() => handleSpeedChange(1.0)}
            className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
              speedMultiplier === 1.0
                ? 'bg-violet-600/40 text-violet-200 border border-violet-500/50 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Velocidade Normal em Tempo Real (1x)"
          >
            1x
          </button>
          <button
            onClick={() => handleSpeedChange(2.0)}
            className={`px-2 py-0.5 rounded-md flex items-center gap-0.5 transition-colors cursor-pointer ${
              speedMultiplier === 2.0
                ? 'bg-violet-600/40 text-cyan-300 border border-cyan-500/50 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Velocidade Acelerada (2x)"
          >
            <Zap className="w-2.5 h-2.5" />
            <span>2x</span>
          </button>
        </div>

        <div className="w-[1px] h-4 bg-white/15 shrink-0" />

        {/* Botão Gravar (Play) */}
        <button
          onClick={startRecording}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-md shadow-emerald-600/30 transition-all cursor-pointer active:scale-95 shrink-0"
          title="Iniciar Gravação"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>Gravar</span>
        </button>

        {/* Botão Cancelar (X) */}
        <button
          onClick={handleClose}
          className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          title="Cancelar (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Estado RECORDING: Gravação ativa com contador, pause/resume e botão parar
  if (state === 'RECORDING') {
    return (
      <div className="w-full h-full flex items-center justify-between px-3 gap-2 whitespace-nowrap overflow-hidden bg-zinc-950/95 border border-zinc-700/90 rounded-xl shadow-2xl backdrop-blur-xl select-none">
        {/* Badge de Status: REC ou PAUSA */}
        <div className="flex items-center gap-1.5 text-xs font-mono font-semibold shrink-0">
          {isPaused ? (
            <>
              <Pause className="w-3.5 h-3.5 text-amber-400 fill-current" />
              <span className="text-amber-300">
                PAUSA {formatDuration(recordingDuration)} / {formatDuration(maxRecordingDuration)}
              </span>
            </>
          ) : (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping inline-block" />
              <span className="text-red-400">
                REC {formatDuration(recordingDuration)} / {formatDuration(maxRecordingDuration)}
              </span>
            </>
          )}
        </div>

        <div className="w-[1px] h-4 bg-white/15 shrink-0" />

        {/* Seletor de Velocidade (1x Normal / 2x Rápido) */}
        <div className="flex items-center gap-1 bg-zinc-900/90 p-0.5 rounded-lg border border-white/10 text-[11px] font-medium shrink-0">
          <button
            onClick={() => handleSpeedChange(1.0)}
            className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
              speedMultiplier === 1.0
                ? 'bg-violet-600/40 text-violet-200 border border-violet-500/50 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Velocidade Normal em Tempo Real (1x)"
          >
            1x
          </button>
          <button
            onClick={() => handleSpeedChange(2.0)}
            className={`px-2 py-0.5 rounded-md flex items-center gap-0.5 transition-colors cursor-pointer ${
              speedMultiplier === 2.0
                ? 'bg-violet-600/40 text-cyan-300 border border-cyan-500/50 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Velocidade Acelerada (2x)"
          >
            <Zap className="w-2.5 h-2.5" />
            <span>2x</span>
          </button>
        </div>

        <div className="w-[1px] h-4 bg-white/15 shrink-0" />

        {/* Botão Pausar / Retomar */}
        {isPaused ? (
          <button
            onClick={handleResume}
            className="flex items-center gap-1 shrink-0 px-2.5 py-1 rounded-lg bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 border border-amber-500/40 text-xs font-medium transition-all cursor-pointer active:scale-95"
            title="Retomar Gravação"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Retomar</span>
          </button>
        ) : (
          <button
            onClick={handlePause}
            className="flex items-center gap-1 shrink-0 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-medium transition-all cursor-pointer active:scale-95"
            title="Pausar Gravação"
          >
            <Pause className="w-3 h-3 fill-current" />
            <span>Pausar</span>
          </button>
        )}

        {/* Botão Concluir (Finalizar e Salvar) */}
        <button
          onClick={handleStop}
          className="flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium shadow-md shadow-emerald-600/30 transition-all cursor-pointer active:scale-95"
          title="Concluir e Salvar GIF (Esc)"
        >
          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Concluir</span>
        </button>
      </div>
    );
  }

  // Estado SELECTING: Overlay fullscreen com mira, banner e desenho de seleção
  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className="fixed inset-0 w-screen h-screen overflow-hidden select-none cursor-crosshair bg-black/25"
    >
      {/* Banner de Ajuda no Topo */}
      {overlayMode === 'ocr_snip' ? (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2 rounded-xl bg-zinc-950/90 border border-indigo-500/30 shadow-2xl backdrop-blur-md pointer-events-auto text-xs text-zinc-200 animate-in fade-in slide-in-from-top-3 duration-200">
          <span className="font-medium text-zinc-100 flex items-center gap-2">
            <ScanText className="w-4 h-4 text-indigo-400" />
            <span>Selecione o texto para extrair</span>
          </span>
          <span className="text-zinc-600">•</span>
          <span className="text-zinc-400 font-mono text-[11px]">[Esc] Cancelar</span>
        </div>
      ) : (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2 rounded-xl bg-zinc-950/90 border border-white/15 shadow-2xl backdrop-blur-md pointer-events-auto text-xs text-zinc-200 animate-in fade-in slide-in-from-top-3 duration-200">
          <span className="font-medium text-zinc-100 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            Arraste para selecionar a área do GIF
          </span>
          <span className="text-zinc-600">•</span>
          <button
            onClick={startFullScreenRecording}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-cyan-300 font-medium transition-colors cursor-pointer"
          >
            <Monitor className="w-3 h-3" />
            <span>Tela Inteira [F]</span>
          </button>
          <span className="text-zinc-600">•</span>
          <span className="text-zinc-400 font-mono text-[11px]">[Esc] Cancelar</span>
        </div>
      )}

      {/* Indicador de Processamento / Toast de Feedback */}
      {isProcessingSnip && !snipFeedback && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-950/95 border border-indigo-500/60 shadow-2xl backdrop-blur-md text-xs font-semibold text-indigo-200 animate-in fade-in zoom-in-95 duration-150">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-ping" />
          <span>Extraindo texto com OCR nativo...</span>
        </div>
      )}

      {snipFeedback && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-950/95 border border-emerald-500/60 shadow-2xl backdrop-blur-md text-xs font-semibold text-emerald-300 animate-in fade-in zoom-in-95 duration-150">
          <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
          <span>{snipFeedback}</span>
        </div>
      )}

      {/* Retângulo de Seleção / Área a Gravar */}
      {currentRect && (
        <div
          style={{
            left: `${currentRect.x}px`,
            top: `${currentRect.y}px`,
            width: `${currentRect.width}px`,
            height: `${currentRect.height}px`,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
          }}
          className={`absolute pointer-events-none transition-all duration-75 border-2 ${
            overlayMode === 'ocr_snip'
              ? 'border-indigo-400 bg-indigo-400/10'
              : 'border-cyan-400 bg-cyan-400/5'
          }`}
        >
          {/* Badge com as Dimensões da Seleção */}
          <div
            className={`absolute -bottom-7 right-0 px-2 py-0.5 rounded bg-zinc-950/90 border border-white/20 text-[10px] font-mono shadow-md ${
              overlayMode === 'ocr_snip' ? 'text-indigo-300' : 'text-cyan-300'
            }`}
          >
            {Math.round(currentRect.width)} × {Math.round(currentRect.height)} px
          </div>
        </div>
      )}
    </div>
  );
};
