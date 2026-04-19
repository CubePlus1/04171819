import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, MotionConfig } from 'framer-motion';
import ProductPanel from './panels/ProductPanel.jsx';
import AgentPanel from './panels/AgentPanel.jsx';
import Toast from './components/Toast.jsx';
import ThemeSwitcher from './themes/ThemeSwitcher.jsx';
import { THEMES } from './themes/tokens.js';
import { useTheme } from './themes/useTheme.js';
import { useDemoStore } from './store/useDemoStore.js';
import { bootstrap, resetDemo, getClientId } from './api/client.js';
import { connectWs } from './api/ws.js';
import { WS_EVENTS } from '@shared/contracts.js';

// 确保 clientId 在 WS 消息到达前已生成
getClientId();

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

// Mobile（<md）下单列展示 · 右侧 AgentPanel 驱动 pipeline 所以不能 unmount
// 用 hidden md:block 让它继续跑 · 视口里看不到
// 完整枚举每个 variant · Tailwind JIT 只扫源代码里字面量出现过的 class
const SPLIT_TO_GRID = {
  '7-5': { left: 'col-span-12 md:col-span-7', right: 'hidden md:block md:col-span-5' },
  '6-6': { left: 'col-span-12 md:col-span-6', right: 'hidden md:block md:col-span-6' },
  '8-4': { left: 'col-span-12 md:col-span-8', right: 'hidden md:block md:col-span-4' },
  '5-7': { left: 'col-span-12 md:col-span-5', right: 'hidden md:block md:col-span-7' },
};

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

  const { current: theme, switchTheme, cycleTheme } = useTheme(THEMES);

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
        const myClient = getClientId();
        const isMine = !p.client_id || p.client_id === myClient;
        switch (msg.type) {
          case WS_EVENTS.WORKFLOW_BEGIN:
            if (isMine) beginWorkflow(p.run_id);
            break;
          case WS_EVENTS.WORKFLOW_STEP:
            if (isMine) applyStep(p);
            break;
          case WS_EVENTS.WORKFLOW_END:
            if (isMine) {
              endWorkflow({
                ok: p.ok,
                cardId: p.cardId,
                scriptId: p.scriptId,
                reason: p.reason,
                runId: p.run_id,
              });
            }
            break;
          case WS_EVENTS.CARD_GENERATED:
            onCardGenerated(p.card, isMine);
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

  // 键盘快切：[ 上一款，] 下一款，T 打开切换器
  useEffect(() => {
    function onKey(e) {
      // 忽略输入框里的按键
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === '[') { cycleTheme(-1); setToast(`风格：${findName(-1)}`); }
      if (e.key === ']') { cycleTheme(+1); setToast(`风格：${findName(+1)}`); }
    }
    function findName(dir) {
      const idx = THEMES.findIndex((x) => x.id === theme.id);
      return THEMES[(idx + dir + THEMES.length) % THEMES.length].name;
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [theme.id, cycleTheme]);

  const handleReset = useCallback(async () => {
    try {
      resetStore();
      await resetDemo();
    } catch (err) {
      console.error('reset failed', err);
      setToast('重置失败，请检查后端连通');
    }
  }, [resetStore]);

  const handleRetryBoot = useCallback(() => bootRef.current?.(), []);

  const split = SPLIT_TO_GRID[theme.layout?.split_ratio ?? '7-5'];

  return (
    <MotionConfig reducedMotion={reducedMotion ? 'always' : 'never'}>
      <div className="flex h-full w-full flex-col">
        <Header
          connected={connected}
          user={user}
          onReset={handleReset}
          themes={THEMES}
          theme={theme}
          onPickTheme={(id) => { switchTheme(id); setToast(`风格：${THEMES.find((t)=>t.id===id)?.name}`); }}
        />

        {bootState.status === 'error' && (
          <ErrorBanner message={bootState.error} onRetry={handleRetryBoot} />
        )}

        <main className="relative grid flex-1 min-h-0 grid-cols-12 gap-4 px-3 pb-3 md:px-5 md:pb-5">
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className={`${split.left} min-h-0`}
          >
            <ProductPanel bootStatus={bootState.status} onAction={(label) => setToast(label)} />
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.08 }}
            className={`${split.right} min-h-0`}
          >
            <AgentPanel onToast={setToast} />
          </motion.section>
        </main>

        <Toast message={toast} onDismiss={() => setToast(null)} />
      </div>
    </MotionConfig>
  );
}

function Header({ connected, user, onReset, themes, theme, onPickTheme }) {
  return (
    <header className="relative flex items-center justify-between px-4 pt-4 pb-3 md:px-6 md:pt-5 no-select bg-[color:var(--color-stage)]/90 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <div className="relative h-7 w-7 rounded-full bg-gradient-to-br from-ember to-kiss shadow-card">
          <span className="absolute inset-0 rounded-full bg-ember/20 blur-md" />
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-[0.18em] text-[var(--color-text)]">
            蹲到了 · DUNDAO
          </div>
          <div className="text-[11px] font-medium text-[var(--color-text-muted)]">
            逆风如解意 · 替你守到兑现
          </div>
        </div>
      </div>

      {/* 展台控件组 · 手机扫码只为 "看 demo" · md 以下整组隐藏 */}
      <div className="hidden items-center gap-3 md:flex">
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
        <ThemeSwitcher themes={themes} current={theme} onPick={onPickTheme} />
        <button
          className="focus-ring rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[12px] text-[var(--color-text)] hover:bg-white/10"
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
