import AgentStep from './AgentStep.jsx';
import { useDemoStore } from '../store/useDemoStore.js';

export default function AgentWorkflow() {
  const steps = useDemoStore((s) => s.steps);
  const running = useDemoStore((s) => s.running);
  const lastReason = useDemoStore((s) => s.lastReason);

  // 用于 screen reader 的当前进度一句话
  const activeStep = steps.find((s) => s.status === 'active');
  const liveMsg = running
    ? `AI 工作流进行中：第 ${activeStep?.step ?? '?'} 步 · ${activeStep?.name ?? ''}`
    : lastReason
      ? `AI 工作流已结束：${lastReason}`
      : 'AI 工作流待命';

  return (
    <section aria-labelledby="workflow-heading" className="flex flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span id="workflow-heading" className="pill bg-hintB/15 text-hintB">
            AI 工作后台
          </span>
          <span className="text-[12px] text-stone-400">前台英雄 · 不是黑盒</span>
        </div>
        <div className="text-[11px] text-stone-400" aria-hidden="true">
          {running ? '管线运行中...' : lastReason ? `已结束 · ${lastReason}` : '等待输入'}
        </div>
      </div>

      <span className="sr-only" role="status" aria-live="polite">{liveMsg}</span>

      <ol className="list-none p-0 m-0">
        {steps.map((step, idx) => (
          <li key={step.step} className="list-none">
            <AgentStep step={step} index={idx} isLast={idx === steps.length - 1} />
          </li>
        ))}
      </ol>
    </section>
  );
}
