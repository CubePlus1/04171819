import { useState } from 'react';

const MAX = 140;

export default function CommentInput({ onSubmit, disabled }) {
  const [text, setText] = useState('');

  async function submit(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    await onSubmit?.(trimmed);
    setText('');
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="text-[11px] uppercase tracking-[0.18em] text-stone-500">评委亲手输入</div>
      <div className="flex items-stretch gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 focus-within:border-ember/50">
        <input
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX))}
          disabled={disabled}
          placeholder="把你心里的「蹲」打出来，比如：蹲后续 爷爷真帅"
          className="flex-1 bg-transparent text-[14px] text-stone-100 placeholder:text-stone-500 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="rounded-lg bg-ember px-3 py-1 text-[13px] font-medium text-white shadow-card disabled:cursor-not-allowed disabled:opacity-50"
        >
          触发
        </button>
      </div>
      <div className="flex justify-end text-[10px] text-stone-500">{text.length}/{MAX}</div>
    </form>
  );
}
