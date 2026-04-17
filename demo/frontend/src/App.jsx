import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import ProductPanel from './panels/ProductPanel.jsx';
import AgentPanel from './panels/AgentPanel.jsx';
import { useDemoStore } from './store/useDemoStore.js';
import { bootstrap, resetDemo } from './api/client.js';
import { connectWs } from './api/ws.js';

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

  // StrictMode 保护：开发模式下 effect 会跑两次，不要重复引导 / 创建两个 WS
  const bootedOnceRef = useRef(false);
  const wasConnectedOnceRef = useRef(false);
  const bootTokenRef = useRef(0);

  useEffect(() => {
    if (bootedOnceRef.current) return;
    bootedOnceRef.current = true;

    async function boot() {
      const token = ++bootTokenRef.current;
      try {
        const data = await bootstrap();
        if (token !== bootTokenRef.current) return; // 被新的 boot 超越，丢弃
        hydrate(data);
      } catch (err) {
        console.error('bootstrap failed', err);
      }
    }

    boot();

    const ws = connectWs({
      onOpen: () => {
        setConnected(true);
        // 之前连接过 → 现在是重连 → 重新拉一遍 bootstrap，保证错过的卡片被同步
        if (wasConnectedOnceRef.current) boot();
        wasConnectedOnceRef.current = true;
      },
      onClose: () => setConnected(false),
      onMessage: (msg) => {
        const p = msg.payload ?? {};
        switch (msg.type) {
          case 'workflow.begin':
            beginWorkflow(p.run_id);
            break;
          case 'workflow.step':
            applyStep(p);
            break;
          case 'workflow.end':
            endWorkflow({
              ok: p.ok,
              cardId: p.cardId,
              scriptId: p.scriptId,
              reason: p.reason,
              runId: p.run_id,
            });
            break;
          case 'card.generated':
            onCardGenerated(p.card, p.run_id);
            break;
          case 'demo.reset':
            resetStore();
            boot();
            break;
          default:
            break;
        }
      },
    });

    return () => {
      ws.close();
    };
  }, [hydrate, setConnected, beginWorkflow, applyStep, endWorkflow, onCardGenerated, resetStore]);

  async function handleReset() {
    // 单一事实来源：服务端广播 demo.reset → 客户端统一在 WS handler 里 reset + boot
    try {
      resetStore();
      await resetDemo();
    } catch (err) {
      console.error('reset failed', err);
    }
  }

  return (
    <div className="flex h-full w-full flex-col">
      <Header connected={connected} user={user} onReset={handleReset} />
      <main className="relative grid flex-1 min-h-0 grid-cols-12 gap-4 px-5 pb-5">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="col-span-7 min-h-0"
        >
          <ProductPanel />
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08 }}
          className="col-span-5 min-h-0"
        >
          <AgentPanel />
        </motion.section>
      </main>
    </div>
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
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-warmth" />
            {user.nickname}
          </span>
        )}
        <span className="pill">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              connected ? 'bg-emerald-400' : 'bg-stone-500'
            }`}
          />
          {connected ? 'WS 已连接' : 'WS 断开中'}
        </span>
        <button
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[12px] text-stone-200 hover:bg-white/10"
          onClick={onReset}
        >
          重置演示
        </button>
      </div>
    </header>
  );
}
