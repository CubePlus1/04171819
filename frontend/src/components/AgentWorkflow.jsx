import AgentStep from './AgentStep.jsx';
import { useDemoStore } from '../store/useDemoStore.js';

export default function AgentWorkflow() {
  const steps = useDemoStore((s) => s.steps);
  const running = useDemoStore((s) => s.running);
  const lastReason = useDemoStore((s) => s.lastReason);

  return (
    <div className="flex flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="pill bg-hintB/15 text-hintB">AI 工作后台</span>
          <span className="text-[12px] text-stone-400">前台英雄 · 不是黑盒</span>
        </div>
        <div className="text-[11px] text-stone-500">
          {running ? '管线运行中...' : lastReason ? `已结束 · ${lastReason}` : '等待输入'}
        </div>
      </div>

      <div>
        {steps.map((step, idx) => (
          <AgentStep
            key={step.step}
            step={step}
            index={idx}
            isLast={idx === steps.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
