#!/usr/bin/env python3
from __future__ import annotations

import argparse
import contextlib
import json
import os
import re
import subprocess
import sys
import textwrap
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Callable


DEFAULT_WORKSPACE_ROOT = Path("/Users/sevencolor/code/0BKHDD")
DEFAULT_DOCS = [
    DEFAULT_WORKSPACE_ROOT / "predocs/2026-04-15-bytecamp-directions.md",
    DEFAULT_WORKSPACE_ROOT / "predocs/brainstorming/directions.md",
]
DEFAULT_OUTPUT_BASE = DEFAULT_WORKSPACE_ROOT / "py/output"
DEFAULT_TOTAL_CALLS = 100
DEFAULT_TIMEOUT_SECONDS = 30 * 60

SECTION_PATTERN = re.compile(r"^##\s+(.*)$", re.MULTILINE)
PROMPT_BLOCK_PATTERN = re.compile(r"```(?:text)?\n(.*?)```", re.DOTALL)
NUMERIC_HEADING_PATTERN = re.compile(r"^\d+\.\s*(.+?)\s*$")
DIRECTION_HEADING_PATTERN = re.compile(r"^方向\s*(\d+)\s*[：:]\s*(.+?)\s*$")

DIRECTION_PHASES = [
    "baseline_research",
    "assumption_challenge",
    "evolution",
    "final_pack",
]

SYNTHESIS_PHASES = [
    "track_landscape",
    "cross_direction_compare",
    "hybrid_generation",
    "final_recommendation",
]


@dataclass(frozen=True)
class Direction:
    source_key: str
    source_path: Path
    index: int
    heading: str
    title: str
    body: str
    research_prompt: str
    slug: str


@dataclass(frozen=True)
class Task:
    task_id: str
    kind: str
    phase: str
    sequence: int
    direction_slug: str | None = None


@dataclass(frozen=True)
class ExecutionOutcome:
    returncode: int
    started_at: str
    finished_at: str
    elapsed_seconds: float
    timed_out: bool


def extract_sections(markdown: str) -> list[tuple[str, str]]:
    matches = list(SECTION_PATTERN.finditer(markdown))
    sections: list[tuple[str, str]] = []
    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(markdown)
        heading = match.group(1).strip()
        body = markdown[start:end].strip()
        sections.append((heading, body))
    return sections


def _extract_title(heading: str) -> str | None:
    match = NUMERIC_HEADING_PATTERN.match(heading)
    if match:
        return match.group(1).strip()

    match = DIRECTION_HEADING_PATTERN.match(heading)
    if match:
        return match.group(2).strip()
    return None


def _normalize_title(title: str) -> str:
    return title.replace("（", "(").replace("）", ")").strip()


def _extract_prompt(body: str) -> str:
    match = PROMPT_BLOCK_PATTERN.search(body)
    if not match:
        return ""
    return match.group(1).strip()


def parse_directions(path: Path, source_key: str) -> list[Direction]:
    markdown = path.read_text(encoding="utf-8")
    directions: list[Direction] = []
    visible_index = 0

    for heading, body in extract_sections(markdown):
        title = _extract_title(heading)
        if not title:
            continue
        visible_index += 1
        directions.append(
            Direction(
                source_key=source_key,
                source_path=path,
                index=visible_index,
                heading=heading,
                title=_normalize_title(title),
                body=body,
                research_prompt=_extract_prompt(body),
                slug=f"{source_key}-{visible_index:02d}",
            )
        )
    return directions


def build_task_plan(directions: list[Direction], total_calls: int) -> list[Task]:
    if total_calls <= 0:
        return []

    synthesis_budget = len(SYNTHESIS_PHASES) if total_calls >= len(directions) + len(SYNTHESIS_PHASES) else 0
    direction_budget = total_calls - synthesis_budget
    tasks: list[Task] = []
    sequence = 1

    if directions:
        full_rounds, remainder = divmod(direction_budget, len(directions))
        rounds_to_use = min(full_rounds, len(DIRECTION_PHASES))

        for round_index in range(rounds_to_use):
            phase = DIRECTION_PHASES[round_index]
            for direction in directions:
                tasks.append(
                    Task(
                        task_id=f"{sequence:03d}-{direction.slug}-{phase}",
                        kind="direction",
                        phase=phase,
                        sequence=sequence,
                        direction_slug=direction.slug,
                    )
                )
                sequence += 1

        remaining_budget = direction_budget - len(tasks)
        if remaining_budget > 0:
            phase_index = min(rounds_to_use, len(DIRECTION_PHASES) - 1)
            phase = DIRECTION_PHASES[phase_index]
            for direction in directions[:remaining_budget]:
                tasks.append(
                    Task(
                        task_id=f"{sequence:03d}-{direction.slug}-{phase}",
                        kind="direction",
                        phase=phase,
                        sequence=sequence,
                        direction_slug=direction.slug,
                    )
                )
                sequence += 1

    for phase in SYNTHESIS_PHASES[:synthesis_budget]:
        tasks.append(
            Task(
                task_id=f"{sequence:03d}-synthesis-{phase}",
                kind="synthesis",
                phase=phase,
                sequence=sequence,
            )
        )
        sequence += 1

    return tasks[:total_calls]


def render_plan_summary(tasks: list[Task]) -> str:
    counter = Counter(task.kind for task in tasks)
    phase_counter = Counter(task.phase for task in tasks)
    lines = [
        f"total_calls={len(tasks)}",
        f"direction={counter.get('direction', 0)}",
        f"synthesis={counter.get('synthesis', 0)}",
    ]
    for phase, count in sorted(phase_counter.items()):
        lines.append(f"{phase}={count}")
    return "\n".join(lines)


def build_task_groups(tasks: list[Task]) -> list[list[Task]]:
    groups: list[list[Task]] = []
    current_group: list[Task] = []
    current_phase: str | None = None

    for task in tasks:
        if current_phase != task.phase:
            if current_group:
                groups.append(current_group)
            current_group = [task]
            current_phase = task.phase
        else:
            current_group.append(task)

    if current_group:
        groups.append(current_group)
    return groups


def build_progress_event(
    *,
    index: int,
    total: int,
    task: Task,
    status: str,
    detail: str | None = None,
    elapsed_seconds: float | None = None,
) -> dict[str, Any]:
    event: dict[str, Any] = {
        "timestamp": datetime.now().isoformat(),
        "index": index,
        "total": total,
        "task_id": task.task_id,
        "kind": task.kind,
        "phase": task.phase,
        "status": status,
    }
    if task.direction_slug:
        event["direction_slug"] = task.direction_slug
    if detail:
        event["detail"] = detail
    if elapsed_seconds is not None:
        event["elapsed_seconds"] = round(elapsed_seconds, 3)
    return event


def format_progress_line(
    *,
    index: int,
    total: int,
    task: Task,
    status: str,
    detail: str | None = None,
    elapsed_seconds: float | None = None,
) -> str:
    line = f"[{index}/{total}] {status.upper()} {task.task_id} ({task.kind}/{task.phase})"
    if task.direction_slug:
        line += f" [{task.direction_slug}]"
    if elapsed_seconds is not None:
        line += f" {elapsed_seconds:.1f}s"
    if detail:
        line += f" | {detail}"
    return line


def append_progress_event(run_dir: Path, event: dict[str, Any]) -> None:
    progress_path = run_dir / "logs" / "progress.jsonl"
    progress_path.parent.mkdir(parents=True, exist_ok=True)
    with progress_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, ensure_ascii=False) + "\n")


def build_proxy_env(
    *,
    base_env: dict[str, str] | None = None,
    http_proxy: str | None = None,
    https_proxy: str | None = None,
) -> dict[str, str]:
    env = dict(base_env or os.environ)
    http_value = (
        http_proxy
        or env.get("http_proxy")
        or env.get("HTTP_PROXY")
    )
    https_value = (
        https_proxy
        or env.get("https_proxy")
        or env.get("HTTPS_PROXY")
        or http_value
    )
    if http_value:
        env["http_proxy"] = http_value
        env["HTTP_PROXY"] = http_value
    if https_value:
        env["https_proxy"] = https_value
        env["HTTPS_PROXY"] = https_value
    return env


def safe_print(line: str, *, lock: threading.Lock | None = None) -> None:
    if lock is None:
        print(line, flush=True)
        return
    with lock:
        print(line, flush=True)


def write_live_line(
    handle: Any,
    *,
    stream_name: str,
    line: str,
    lock: threading.Lock,
) -> None:
    with lock:
        handle.write(f"[{stream_name}] {line}")
        handle.flush()


def direction_schema() -> dict[str, Any]:
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "additionalProperties": False,
        "required": [
            "task_id",
            "direction_slug",
            "direction_title",
            "source_key",
            "phase",
            "summary",
            "track_fit",
            "core_user_value",
            "mvp_scope",
            "data_plan",
            "technical_plan",
            "demo_flow",
            "feasibility",
            "risks",
            "downgrade_plan",
            "new_ideas",
            "evolution_notes",
            "references",
            "next_actions",
        ],
        "properties": {
            "task_id": {"type": "string"},
            "direction_slug": {"type": "string"},
            "direction_title": {"type": "string"},
            "source_key": {"type": "string"},
            "phase": {"type": "string"},
            "summary": {"type": "string"},
            "track_fit": {
                "type": "object",
                "additionalProperties": False,
                "required": ["best_track", "alt_tracks", "reason"],
                "properties": {
                    "best_track": {"type": "string"},
                    "alt_tracks": {"type": "array", "items": {"type": "string"}},
                    "reason": {"type": "string"},
                },
            },
            "core_user_value": {"type": "string"},
            "mvp_scope": {"type": "array", "items": {"type": "string"}},
            "data_plan": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["source", "confidence", "notes"],
                    "properties": {
                        "source": {"type": "string"},
                        "confidence": {"type": "string"},
                        "notes": {"type": "string"},
                    },
                },
            },
            "technical_plan": {"type": "array", "items": {"type": "string"}},
            "demo_flow": {"type": "array", "items": {"type": "string"}},
            "feasibility": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "delivery_40h",
                    "demo_wow",
                    "reuse_fit",
                    "data_availability",
                    "overall",
                    "rationale",
                ],
                "properties": {
                    "delivery_40h": {"type": "integer", "minimum": 1, "maximum": 10},
                    "demo_wow": {"type": "integer", "minimum": 1, "maximum": 10},
                    "reuse_fit": {"type": "integer", "minimum": 1, "maximum": 10},
                    "data_availability": {"type": "integer", "minimum": 1, "maximum": 10},
                    "overall": {"type": "integer", "minimum": 1, "maximum": 10},
                    "rationale": {"type": "string"},
                },
            },
            "risks": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["risk", "severity", "mitigation"],
                    "properties": {
                        "risk": {"type": "string"},
                        "severity": {"type": "string"},
                        "mitigation": {"type": "string"},
                    },
                },
            },
            "downgrade_plan": {"type": "array", "items": {"type": "string"}},
            "new_ideas": {"type": "array", "items": {"type": "string"}},
            "evolution_notes": {"type": "array", "items": {"type": "string"}},
            "references": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["title", "url", "reason"],
                    "properties": {
                        "title": {"type": "string"},
                        "url": {"type": "string"},
                        "reason": {"type": "string"},
                    },
                },
            },
            "next_actions": {"type": "array", "items": {"type": "string"}},
        },
    }


def synthesis_schema() -> dict[str, Any]:
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "additionalProperties": False,
        "required": [
            "task_id",
            "phase",
            "summary",
            "lane_insights",
            "ranking",
            "clusters",
            "hybrid_ideas",
            "portfolio_strategy",
            "references",
            "next_actions",
        ],
        "properties": {
            "task_id": {"type": "string"},
            "phase": {"type": "string"},
            "summary": {"type": "string"},
            "lane_insights": {"type": "array", "items": {"type": "string"}},
            "ranking": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["direction_slug", "direction_title", "score", "reason"],
                    "properties": {
                        "direction_slug": {"type": "string"},
                        "direction_title": {"type": "string"},
                        "score": {"type": "integer", "minimum": 1, "maximum": 10},
                        "reason": {"type": "string"},
                    },
                },
            },
            "clusters": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["name", "member_slugs", "thesis"],
                    "properties": {
                        "name": {"type": "string"},
                        "member_slugs": {"type": "array", "items": {"type": "string"}},
                        "thesis": {"type": "string"},
                    },
                },
            },
            "hybrid_ideas": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["name", "why_now", "based_on", "mvp"],
                    "properties": {
                        "name": {"type": "string"},
                        "why_now": {"type": "string"},
                        "based_on": {"type": "array", "items": {"type": "string"}},
                        "mvp": {"type": "array", "items": {"type": "string"}},
                    },
                },
            },
            "portfolio_strategy": {"type": "array", "items": {"type": "string"}},
            "references": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["title", "url", "reason"],
                    "properties": {
                        "title": {"type": "string"},
                        "url": {"type": "string"},
                        "reason": {"type": "string"},
                    },
                },
            },
            "next_actions": {"type": "array", "items": {"type": "string"}},
        },
    }


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def phase_goal_text(phase: str) -> str:
    goals = {
        "baseline_research": "先确认赛道匹配、MVP、数据获取路径、现有仓库复用点，并补当前可查到的外部资料。",
        "assumption_challenge": "专门挑错，击穿脆弱假设，找出最可能让项目在 40 小时内失败的点，并给更稳的缩圈版本。",
        "evolution": "基于前两轮结果提出更强版本、衍生版本、赛道改包装方案和新的想法，推动方向进化。",
        "final_pack": "收敛成最终方向包，给出可执行的 40 小时方案、展台 demo 脚本、核心技术栈和 kill criteria。",
        "track_landscape": "从赛道一到赛道四梳理评审关注点、平台约束、适合展示的作品形态和避坑点。",
        "cross_direction_compare": "横向比较所有方向，给出优先级、集群关系、重复方向合并建议。",
        "hybrid_generation": "基于已有方向演化出新的混合方案，要求更适合展台、更好做、更能复用现有仓库。",
        "final_recommendation": "输出最终总报告：最佳主推方向、备选、为什么、如何落地、接下来先做什么。",
    }
    return goals[phase]


def build_direction_prompt(
    task: Task,
    direction: Direction,
    prior_results: list[Path],
    all_direction_summaries: list[str],
) -> str:
    prior_lines = "\n".join(f"- {path}" for path in prior_results) or "- 无"
    peer_lines = "\n".join(f"- {line}" for line in all_direction_summaries)
    research_prompt = direction.research_prompt or "请自行围绕方向标题和正文做可行性调研。"
    return textwrap.dedent(
        f"""
        你是一个字节跳动 hackathon 方向研究员。当前日期是 {datetime.now().date().isoformat()}。

        任务约束：
        - 目标必须适配：纯软件、40 小时内能做出可演示 MVP、面向大学生展览、10 秒内能看懂价值。
        - 可以使用 web search 查找最新资料，但优先官方文档、官方平台、权威媒体、公开研究资料。
        - 对不确定的平台能力，不要直接假设可用，要写清楚降级方案。
        - 明确区分已确认事实、推断、建议。
        - 输出必须严格符合 JSON schema。

        当前任务：
        - task_id: {task.task_id}
        - phase: {task.phase}
        - phase_goal: {phase_goal_text(task.phase)}

        当前方向：
        - direction_slug: {direction.slug}
        - source_key: {direction.source_key}
        - source_path: {direction.source_path}
        - heading: {direction.heading}
        - title: {direction.title}

        原始方向正文：
        {direction.body}

        原始调研 prompt：
        {research_prompt}

        本方向之前已经产出的结果文件：
        {prior_lines}

        全部方向清单：
        {peer_lines}

        输出要求补充：
        - summary 要给出本轮结论。
        - mvp_scope 用 3 到 8 条。
        - data_plan 要覆盖最稳妥的数据来源。
        - references 必须尽量给当前轮真正使用到的资料链接；没有链接时留空数组，不要编造。
        - new_ideas 里写本轮新冒出来的方向变体、拼接思路或体验增强点。
        - evolution_notes 里写相对前一轮的变化。
        """
    ).strip()


def build_synthesis_prompt(
    task: Task,
    directions: list[Direction],
    direction_result_paths: list[Path],
    prior_synthesis_paths: list[Path],
) -> str:
    direction_list = "\n".join(f"- {direction.slug}: {direction.title}" for direction in directions)
    result_list = "\n".join(f"- {path}" for path in direction_result_paths) or "- 无"
    prior_list = "\n".join(f"- {path}" for path in prior_synthesis_paths) or "- 无"
    return textwrap.dedent(
        f"""
        你是一个字节跳动 hackathon 总策划研究员。当前日期是 {datetime.now().date().isoformat()}。

        任务约束：
        - 目标必须适配：纯软件、40 小时内能做出可演示 MVP、面向大学生展览、10 秒内可理解。
        - 可以使用 web search 查找最新资料，但优先官方资料与赛道规则。
        - 结论要落到“做什么最稳、为什么、怎么演示、怎么降级”。
        - 输出必须严格符合 JSON schema。

        当前任务：
        - task_id: {task.task_id}
        - phase: {task.phase}
        - phase_goal: {phase_goal_text(task.phase)}

        全部方向：
        {direction_list}

        可参考的方向结果文件：
        {result_list}

        之前的综合分析文件：
        {prior_list}

        输出要求补充：
        - ranking 按推荐优先级排序。
        - clusters 需要把相似方向合并成策略组。
        - hybrid_ideas 要提出新的组合方向，不能只是原方向改名。
        - lane_insights 聚焦赛道特点、评审视角、展示策略和数据约束。
        """
    ).strip()


def load_prior_result_paths(run_dir: Path, task: Task) -> tuple[list[Path], list[Path]]:
    results_dir = run_dir / "results"
    prior_direction_results: list[Path] = []
    prior_synthesis_results: list[Path] = []
    if not results_dir.exists():
        return prior_direction_results, prior_synthesis_results

    for path in sorted(results_dir.glob("*.json")):
        if path.name.startswith(task.task_id):
            continue
        if "-synthesis-" in path.name:
            prior_synthesis_results.append(path)
        elif task.direction_slug and f"-{task.direction_slug}-" in path.name:
            prior_direction_results.append(path)
    return prior_direction_results, prior_synthesis_results


def execute_codex(
    *,
    task: Task,
    workspace_root: Path,
    prompt_text: str,
    prompt_path: Path,
    output_path: Path,
    schema_path: Path,
    log_path: Path,
    search_enabled: bool,
    model: str | None,
    sandbox_mode: str,
    timeout_seconds: int,
    heartbeat_seconds: float,
    live_log_path: Path,
    proxy_env: dict[str, str] | None = None,
    on_heartbeat: Callable[[float], None] | None = None,
) -> ExecutionOutcome:
    command = ["codex"]
    if search_enabled:
        command.append("--search")
    command.extend(
        [
            "exec",
            "--skip-git-repo-check",
            "--ephemeral",
            "-s",
            sandbox_mode,
            "-C",
            str(workspace_root),
            "--output-schema",
            str(schema_path),
            "-o",
            str(output_path),
        ]
    )
    if model:
        command.extend(["-m", model])
    command.append("-")

    started_dt = datetime.now()
    process = subprocess.Popen(
        command,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        cwd=workspace_root,
        bufsize=1,
        env=proxy_env,
    )
    assert process.stdin is not None
    assert process.stdout is not None
    assert process.stderr is not None

    stdout_chunks: list[str] = []
    stderr_chunks: list[str] = []
    live_log_path.parent.mkdir(parents=True, exist_ok=True)
    stream_lock = threading.Lock()

    def pump_stream(stream: Any, sink: list[str], stream_name: str, live_handle: Any) -> None:
        with contextlib.closing(stream):
            for line in iter(stream.readline, ""):
                sink.append(line)
                write_live_line(
                    live_handle,
                    stream_name=stream_name,
                    line=line,
                    lock=stream_lock,
                )

    timed_out = False
    with live_log_path.open("a", encoding="utf-8") as live_handle:
        write_live_line(
            live_handle,
            stream_name="meta",
            line=f"command={' '.join(command)}\n",
            lock=stream_lock,
        )
        process.stdin.write(prompt_text)
        process.stdin.close()

        stdout_thread = threading.Thread(
            target=pump_stream,
            args=(process.stdout, stdout_chunks, "stdout", live_handle),
            daemon=True,
        )
        stderr_thread = threading.Thread(
            target=pump_stream,
            args=(process.stderr, stderr_chunks, "stderr", live_handle),
            daemon=True,
        )
        stdout_thread.start()
        stderr_thread.start()

        last_heartbeat = time.monotonic()
        while True:
            returncode = process.poll()
            now = time.monotonic()
            elapsed_seconds = (datetime.now() - started_dt).total_seconds()
            if returncode is not None:
                break
            if elapsed_seconds >= timeout_seconds:
                timed_out = True
                process.kill()
                break
            if heartbeat_seconds > 0 and now - last_heartbeat >= heartbeat_seconds:
                if on_heartbeat:
                    on_heartbeat(elapsed_seconds)
                write_live_line(
                    live_handle,
                    stream_name="heartbeat",
                    line=f"elapsed_seconds={elapsed_seconds:.1f}\n",
                    lock=stream_lock,
                )
                last_heartbeat = now
            time.sleep(0.5)

        stdout_thread.join(timeout=5)
        stderr_thread.join(timeout=5)
        process.wait(timeout=5)

    finished_dt = datetime.now()
    elapsed_seconds = (finished_dt - started_dt).total_seconds()
    started_at = started_dt.isoformat()
    finished_at = finished_dt.isoformat()
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text(
        json.dumps(
            {
                "task_id": task.task_id,
                "kind": task.kind,
                "phase": task.phase,
                "direction_slug": task.direction_slug,
                "prompt_path": str(prompt_path),
                "output_path": str(output_path),
                "schema_path": str(schema_path),
                "live_log_path": str(live_log_path),
                "search_enabled": search_enabled,
                "model": model,
                "sandbox_mode": sandbox_mode,
                "proxy_env": {
                    "http_proxy": (proxy_env or {}).get("http_proxy"),
                    "HTTP_PROXY": (proxy_env or {}).get("HTTP_PROXY"),
                    "https_proxy": (proxy_env or {}).get("https_proxy"),
                    "HTTPS_PROXY": (proxy_env or {}).get("HTTPS_PROXY"),
                },
                "command": command,
                "started_at": started_at,
                "finished_at": finished_at,
                "elapsed_seconds": round(elapsed_seconds, 3),
                "timed_out": timed_out,
                "returncode": process.returncode if process.returncode is not None else 124,
                "stdout": "".join(stdout_chunks),
                "stderr": "".join(stderr_chunks),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return ExecutionOutcome(
        returncode=process.returncode if process.returncode is not None else 124,
        started_at=started_at,
        finished_at=finished_at,
        elapsed_seconds=elapsed_seconds,
        timed_out=timed_out,
    )


def write_markdown_reports(run_dir: Path, directions: list[Direction], tasks: list[Task]) -> None:
    reports_dir = run_dir / "reports"
    results_dir = run_dir / "results"
    reports_dir.mkdir(parents=True, exist_ok=True)

    direction_lookup = {direction.slug: direction for direction in directions}
    final_direction_rows: list[dict[str, Any]] = []
    final_synthesis: dict[str, Any] | None = None

    for task in tasks:
        result_path = results_dir / f"{task.task_id}.json"
        if not result_path.exists():
            continue
        payload = read_json(result_path)
        if task.kind == "direction" and task.phase == "final_pack":
            final_direction_rows.append(payload)
        if task.kind == "synthesis" and task.phase == "final_recommendation":
            final_synthesis = payload

    lines = [
        "# Codex Idea Lab Run",
        "",
        f"- run_dir: `{run_dir}`",
        f"- total_tasks: {len(tasks)}",
        f"- parsed_directions: {len(directions)}",
        "",
        "## Final Direction Packs",
        "",
        "| slug | title | best_track | overall | summary |",
        "| --- | --- | --- | --- | --- |",
    ]
    for row in sorted(final_direction_rows, key=lambda item: item["direction_slug"]):
        lines.append(
            "| {slug} | {title} | {track} | {overall} | {summary} |".format(
                slug=row["direction_slug"],
                title=row["direction_title"].replace("|", "/"),
                track=row["track_fit"]["best_track"].replace("|", "/"),
                overall=row["feasibility"]["overall"],
                summary=row["summary"].replace("|", "/"),
            )
        )

    if final_synthesis:
        lines.extend(
            [
                "",
                "## Final Recommendation",
                "",
                final_synthesis["summary"],
                "",
                "### Ranking",
                "",
            ]
        )
        for item in final_synthesis["ranking"]:
            lines.append(
                f"1. `{item['direction_slug']}` {item['direction_title']} ({item['score']}/10): {item['reason']}"
            )
        lines.extend(
            [
                "",
                "### Hybrid Ideas",
                "",
            ]
        )
        for item in final_synthesis["hybrid_ideas"]:
            lines.append(f"- **{item['name']}**: {item['why_now']}")
            lines.append(f"  - based_on: {', '.join(item['based_on'])}")
            lines.append(f"  - mvp: {'; '.join(item['mvp'])}")

    (reports_dir / "master_report.md").write_text("\n".join(lines), encoding="utf-8")

    index_lines = [
        "# Direction Index",
        "",
        "| slug | source | title | source_path |",
        "| --- | --- | --- | --- |",
    ]
    for direction in directions:
        index_lines.append(
            f"| {direction.slug} | {direction.source_key} | {direction.title} | {direction.source_path} |"
        )
    (reports_dir / "directions_index.md").write_text("\n".join(index_lines), encoding="utf-8")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="用 Codex CLI 对多份方向文档做 100 轮研究、总结、进化和赛道分析。"
    )
    parser.add_argument("--workspace-root", type=Path, default=DEFAULT_WORKSPACE_ROOT)
    parser.add_argument("--docs", type=Path, nargs="+", default=DEFAULT_DOCS)
    parser.add_argument("--output-base", type=Path, default=DEFAULT_OUTPUT_BASE)
    parser.add_argument("--run-name", default=datetime.now().strftime("%Y%m%d-%H%M%S"))
    parser.add_argument("--calls", type=int, default=DEFAULT_TOTAL_CALLS)
    parser.add_argument("--model")
    parser.add_argument("--sandbox", default="read-only")
    parser.add_argument("--max-concurrency", type=int, default=3)
    parser.add_argument("--http-proxy")
    parser.add_argument("--https-proxy")
    parser.add_argument("--timeout-seconds", type=int, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument("--heartbeat-seconds", type=float, default=10.0)
    parser.add_argument("--sleep-seconds", type=float, default=0.0)
    parser.add_argument("--search", action="store_true", default=True)
    parser.add_argument("--no-search", action="store_false", dest="search")
    parser.add_argument("--plan-only", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--stop-on-error", action="store_true")
    return parser.parse_args(argv)


def ensure_paths(run_dir: Path) -> None:
    for name in ["prompts", "results", "logs", "schemas", "reports"]:
        (run_dir / name).mkdir(parents=True, exist_ok=True)
    (run_dir / "logs" / "live").mkdir(parents=True, exist_ok=True)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    directions: list[Direction] = []
    for doc in args.docs:
        if "brainstorming" in str(doc):
            source_key = "brainstorming"
        elif "bytecamp" in doc.name:
            source_key = "bytecamp"
        else:
            source_key = doc.stem
        directions.extend(parse_directions(doc, source_key=source_key))

    run_dir = args.output_base / args.run_name
    ensure_paths(run_dir)
    tasks = build_task_plan(directions=directions, total_calls=args.calls)

    manifest = {
        "workspace_root": str(args.workspace_root),
        "docs": [str(doc) for doc in args.docs],
        "run_dir": str(run_dir),
        "calls": args.calls,
        "max_concurrency": args.max_concurrency,
        "heartbeat_seconds": args.heartbeat_seconds,
        "http_proxy": args.http_proxy or os.environ.get("http_proxy") or os.environ.get("HTTP_PROXY"),
        "https_proxy": args.https_proxy or os.environ.get("https_proxy") or os.environ.get("HTTPS_PROXY"),
        "search": args.search,
        "sandbox": args.sandbox,
        "tasks": [asdict(task) for task in tasks],
        "directions": [
            {
                **asdict(direction),
                "source_path": str(direction.source_path),
            }
            for direction in directions
        ],
        "plan_summary": render_plan_summary(tasks),
    }
    write_json(run_dir / "manifest.json", manifest)

    if args.plan_only:
        print(render_plan_summary(tasks))
        print(f"run_dir={run_dir}")
        return 0

    direction_by_slug = {direction.slug: direction for direction in directions}
    proxy_env = build_proxy_env(
        http_proxy=args.http_proxy,
        https_proxy=args.https_proxy,
    )
    all_direction_summaries = [
        f"{direction.slug} | {direction.source_key} | {direction.title}"
        for direction in directions
    ]
    write_json(run_dir / "schemas/direction.schema.json", direction_schema())
    write_json(run_dir / "schemas/synthesis.schema.json", synthesis_schema())

    console_lock = threading.Lock()
    progress_lock = threading.Lock()
    total_tasks = len(tasks)
    task_indices = {task.task_id: index for index, task in enumerate(tasks, start=1)}

    def emit_event(task: Task, *, status: str, detail: str | None = None, elapsed_seconds: float | None = None) -> None:
        event = build_progress_event(
            index=task_indices[task.task_id],
            total=total_tasks,
            task=task,
            status=status,
            detail=detail,
            elapsed_seconds=elapsed_seconds,
        )
        with progress_lock:
            append_progress_event(run_dir, event)
        safe_print(
            format_progress_line(
                index=task_indices[task.task_id],
                total=total_tasks,
                task=task,
                status=status,
                detail=detail,
                elapsed_seconds=elapsed_seconds,
            ),
            lock=console_lock,
        )

    def run_task(task: Task) -> int:
        output_path = run_dir / "results" / f"{task.task_id}.json"
        prompt_path = run_dir / "prompts" / f"{task.task_id}.md"
        log_path = run_dir / "logs" / f"{task.task_id}.json"
        live_log_path = run_dir / "logs" / "live" / f"{task.task_id}.log"
        schema_path = (
            run_dir / "schemas/direction.schema.json"
            if task.kind == "direction"
            else run_dir / "schemas/synthesis.schema.json"
        )

        if output_path.exists() and not args.force:
            emit_event(task, status="skip", detail="existing result")
            return 0

        prior_direction_results, prior_synthesis_results = load_prior_result_paths(run_dir, task)
        if task.kind == "direction":
            direction = direction_by_slug[task.direction_slug or ""]
            prompt_text = build_direction_prompt(
                task=task,
                direction=direction,
                prior_results=prior_direction_results,
                all_direction_summaries=all_direction_summaries,
            )
        else:
            result_paths = sorted((run_dir / "results").glob("*.json"))
            prompt_text = build_synthesis_prompt(
                task=task,
                directions=directions,
                direction_result_paths=[path for path in result_paths if "-synthesis-" not in path.name],
                prior_synthesis_paths=prior_synthesis_results,
            )

        prompt_path.write_text(prompt_text, encoding="utf-8")
        emit_event(
            task,
            status="start",
            detail=f"dispatching codex exec; live_log={live_log_path}",
        )

        outcome = execute_codex(
            task=task,
            workspace_root=args.workspace_root,
            prompt_text=prompt_text,
            prompt_path=prompt_path,
            output_path=output_path,
            schema_path=schema_path,
            log_path=log_path,
            search_enabled=args.search,
            model=args.model,
            sandbox_mode=args.sandbox,
            timeout_seconds=args.timeout_seconds,
            heartbeat_seconds=args.heartbeat_seconds,
            live_log_path=live_log_path,
            proxy_env=proxy_env,
            on_heartbeat=lambda elapsed: emit_event(
                task,
                status="heartbeat",
                detail=f"still running; live_log={live_log_path}",
                elapsed_seconds=elapsed,
            ),
        )
        returncode = outcome.returncode
        validation_detail = "validated json output"
        if outcome.timed_out:
            returncode = 124
            validation_detail = "timed out"
        elif returncode == 0:
            if not output_path.exists():
                returncode = 97
                validation_detail = "missing output file"
            else:
                try:
                    read_json(output_path)
                except json.JSONDecodeError:
                    returncode = 98
                    validation_detail = "invalid json output"

        finish_status = "done" if returncode == 0 else "failed"
        emit_event(
            task,
            status=finish_status,
            detail=f"returncode={returncode}; {validation_detail}",
            elapsed_seconds=outcome.elapsed_seconds,
        )
        if args.sleep_seconds > 0:
            time.sleep(args.sleep_seconds)
        return returncode

    for group in build_task_groups(tasks):
        group_error = 0
        max_workers = max(1, min(args.max_concurrency, len(group)))
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(run_task, task): task for task in group}
            for future in as_completed(futures):
                returncode = future.result()
                if returncode != 0 and group_error == 0:
                    group_error = returncode
        if group_error != 0 and args.stop_on_error:
            safe_print(f"task group failed with returncode={group_error}", lock=console_lock)
            return group_error

    write_markdown_reports(run_dir=run_dir, directions=directions, tasks=tasks)
    print(f"run_dir={run_dir}")
    print(f"master_report={run_dir / 'reports/master_report.md'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
