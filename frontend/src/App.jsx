import { useEffect, useRef, useState } from 'react';
import { motion, MotionConfig } from 'framer-motion';
import ProductPanel from './panels/ProductPanel.jsx';
import AgentPanel from './panels/AgentPanel.jsx';
import Toast from './components/Toast.jsx';
import { useDemoStore } from './store/useDemoStore.js';
import { bootstrap, resetDemo } from './api/client.js';
import { connectWs } from './api/ws.js';
import { WS_EVENTS } from '@shared/contracts.js';

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(mql.matches);
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, []);
  return reduced;
}

export default function App() {
  const hydrate = useDemoStore((s) => s.hydrate);
  const setConnected = useDemoStore((s) => s.setConnected);
  const beginWorkflow = useDemoStore((s) => s.beginWorkflow);
  const applyStep = useDemoStore((s) => s.applyStep);
  const endWorkflow = useDemoStore((s) => s.endWorkflow);
  const onCardGenerated = useDemoStore((s) => s.onCardGenerated);
  const resetStore = useDemoStore((s) => s.reset);
  const connected = useDemoStore((s) => s.connected);
  const user = useDemoStore((s) => s.user);

  const [bootState, setBootState] = useState({ status: 'loading', error: null });
  const [toast, setToast] = useState(null);
  const reducedMotion = usePrefersReducedMotion();

  const bootedOnceRef = useRef(false);
  const wasConnectedOnceRef = useRef(false);
  const bootTokenRef = useRef(0);
  const bootRef = useRef(null);

  useEffect(() => {
    if (bootedOnceRef.current) return;
    bootedOnceRef.current = true;

    async function boot() {
      const token = ++bootTokenRef.current;
      setBootState((s) => (s.status === 'ready' ? s : { status: 'loading', error: null }));
      try {
        const data = await bootstrap();
        if (token !== bootTokenRef.current) return;
        hydrate(data);
        setBootState({ status: 'ready', error: null });
      } catch (err) {
        console.error('bootstrap failed', err);
        if (token !== bootTokenRef.current) return;
        setBootState({ status: 'error', error: err.message || 'unknown' });
      }
    }
    bootRef.current = boot;
    boot();

    const ws = connectWs({
      onOpen: () => {
        setConnected(true);
        if (wasConnectedOnceRef.current) boot();
        wasConnectedOnceRef.current = true;
      },
      onClose: () => setConnected(false),
      onMessage: (msg) => {
        const p = msg.payload ?? {};
        switch (msg.type) {
          case WS_EVENTS.WORKFLOW_BEGIN:
            beginWorkflow(p.run_id);
            break;
          case WS_EVENTS.WORKFLOW_STEP:
            applyStep(p);
            break;
          case WS_EVENTS.WORKFLOW_END:
            endWorkflow({
              ok: p.ok,
              cardId: p.cardId,
              scriptId: p.scriptId,
              reason: p.reason,
              runId: p.run_id,
            });
            break;
          case WS_EVENTS.CARD_GENERATED:
            onCardGenerated(p.card, p.run_id);
            break;
          case WS_EVENTS.DEMO_RESET:
            resetStore();
            boot();
            break;
          default:
            break;
        }
      },
    });

    return () => ws.close();
  }, [hydrate, setConnected, beginWorkflow, applyStep, endWorkflow, onCardGenerated, resetStore]);

  async function handleReset() {
    try {
      resetStore();
      await resetDemo();
    } catch (err) {
      console.error('reset failed', err);
      setToast('重置失败，请检查后端连通');
    }
  }

  function handleRetryBoot() {
    bootRef.current?.();
  }

  return (
    <MotionConfig reducedMotion={reducedMotion ? 'always' : 'never'}>
      <div className="flex h-full w-full flex-col">
        <Header connected={connected} user={user} onReset={handleReset} />

        {bootState.status === 'error' && (
          <ErrorBanner message={bootState.error} onRetry={handleRetryBoot} />
        )}

        <main className="relative grid flex-1 min-h-0 grid-cols-12 gap-4 px-5 pb-5">
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="col-span-7 min-h-0"
          >
            <ProductPanel bootStatus={bootState.status} onAction={(label) => setToast(label)} />
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.08 }}
            className="col-span-5 min-h-0"
          >
            <AgentPanel onToast={setToast} />
          </motion.section>
        </main>

        <Toast message={toast} onDismiss={() => setToast(null)} />
      </div>
    </MotionConfig>
  );
}

function Header({ connected, user, onReset }) {
  return (
    <header className="flex items-center justify-between px-6 pt-5 pb-3 no-select">
      <div className="flex items-center gap-3">
        <div className="relative h-7 w-7 rounded-full bg-gradient-to-br from-ember to-kiss shadow-card">
          <span className="absolute inset-0 rounded-full bg-ember/20 blur-md" />
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-[0.18em] text-stone-100">
            蹲到了 · DUNDAO
          </div>
          <div className="text-[11px] text-stone-400">
            字节 Hackathon · 赛道三｜履约型内容 · 过去 × 此刻的桥
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {user && (
          <span className="pill">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-warmth" aria-hidden="true" />
            {user.nickname}
          </span>
        )}
        <span className="pill" role="status" aria-live="polite">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              connected ? 'bg-emerald-400' : 'bg-stone-400'
            }`}
            aria-hidden="true"
          />
          {connected ? 'WS 已连接' : 'WS 断开中'}
        </span>
        <button
          className="focus-ring rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[12px] text-stone-200 hover:bg-white/10"
          onClick={onReset}
        >
          重置演示
        </button>
      </div>
    </header>
  );
}

function ErrorBanner({ message, onRetry }) {
  return (
    <div
      role="alert"
      className="mx-6 mb-2 flex items-center justify-between gap-3 rounded-xl border border-red-500/40 bg-red-900/30 px-4 py-2 text-[13px] text-red-100"
    >
      <div>
        <span className="font-medium">无法连接到后端</span>
        <span className="ml-2 text-red-200/80">{message}</span>
      </div>
      <button
        onClick={onRetry}
        className="focus-ring rounded-full bg-red-500/30 px-3 py-1 text-[12px] hover:bg-red-500/40"
      >
        重试
      </button>
    </div>
  );
}
