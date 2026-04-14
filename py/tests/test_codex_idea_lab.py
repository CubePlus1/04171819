import tempfile
import unittest
from pathlib import Path

from codex_idea_lab import (
    Direction,
    Task,
    build_progress_event,
    build_proxy_env,
    build_task_groups,
    build_task_plan,
    extract_sections,
    format_progress_line,
    parse_args,
    parse_directions,
    render_plan_summary,
)


BYTECAMP_DOC = Path("/Users/sevencolor/code/0BKHDD/predocs/2026-04-15-bytecamp-directions.md")
BRAINSTORM_DOC = Path("/Users/sevencolor/code/0BKHDD/predocs/brainstorming/directions.md")


class ExtractSectionsTest(unittest.TestCase):
    def test_extract_sections_keeps_heading_bodies_together(self) -> None:
        markdown = """# Title

## 1. Alpha
line a

## 2. Beta
line b
"""
        sections = extract_sections(markdown)
        self.assertEqual(
            sections,
            [
                ("1. Alpha", "line a"),
                ("2. Beta", "line b"),
            ],
        )


class ParseDirectionsTest(unittest.TestCase):
    def test_parse_directions_supports_both_heading_styles(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "directions.md"
            path.write_text(
                """# Demo

## 1. 学习搭子
方向说明

```text
prompt 1
```

## 总览对比
这不是方向

## 方向 2：人格冒险
方向说明 2

```text
prompt 2
```
""",
                encoding="utf-8",
            )
            directions = parse_directions(path, source_key="demo")

        self.assertEqual(len(directions), 2)
        self.assertEqual(directions[0].title, "学习搭子")
        self.assertEqual(directions[0].research_prompt, "prompt 1")
        self.assertEqual(directions[1].title, "人格冒险")
        self.assertEqual(directions[1].research_prompt, "prompt 2")


class TaskPlanTest(unittest.TestCase):
    def test_build_task_plan_uses_100_calls_for_24_directions(self) -> None:
        directions = [
            Direction(
                source_key="demo",
                source_path=Path("/tmp/demo.md"),
                index=index + 1,
                heading=f"{index + 1}. 标题 {index + 1}",
                title=f"标题 {index + 1}",
                body="body",
                research_prompt="prompt",
                slug=f"demo-{index + 1:02d}",
            )
            for index in range(24)
        ]
        tasks = build_task_plan(directions=directions, total_calls=100)

        self.assertEqual(len(tasks), 100)
        direction_tasks = [task for task in tasks if task.kind == "direction"]
        synthesis_tasks = [task for task in tasks if task.kind == "synthesis"]
        self.assertEqual(len(direction_tasks), 96)
        self.assertEqual(len(synthesis_tasks), 4)

        counts = {}
        for task in direction_tasks:
            counts[task.direction_slug] = counts.get(task.direction_slug, 0) + 1
        self.assertTrue(all(count == 4 for count in counts.values()))

    def test_render_plan_summary_mentions_synthesis(self) -> None:
        directions = [
            Direction(
                source_key="demo",
                source_path=Path("/tmp/demo.md"),
                index=1,
                heading="1. 标题 1",
                title="标题 1",
                body="body",
                research_prompt="prompt",
                slug="demo-01",
            )
        ]
        tasks = build_task_plan(directions=directions, total_calls=5)
        summary = render_plan_summary(tasks)
        self.assertIn("direction", summary)
        self.assertIn("synthesis", summary)

    def test_build_task_groups_keeps_phase_barriers(self) -> None:
        directions = [
            Direction(
                source_key="demo",
                source_path=Path("/tmp/demo.md"),
                index=index + 1,
                heading=f"{index + 1}. 标题 {index + 1}",
                title=f"标题 {index + 1}",
                body="body",
                research_prompt="prompt",
                slug=f"demo-{index + 1:02d}",
            )
            for index in range(2)
        ]
        tasks = build_task_plan(directions=directions, total_calls=10)
        groups = build_task_groups(tasks)

        self.assertEqual(
            [group[0].phase for group in groups],
            list(dict.fromkeys(task.phase for task in tasks)),
        )
        self.assertTrue(all(len({task.phase for task in group}) == 1 for group in groups))

    def test_parse_args_defaults_max_concurrency_to_3(self) -> None:
        args = parse_args(["--calls", "1"])
        self.assertEqual(args.max_concurrency, 3)


class ProgressTest(unittest.TestCase):
    def test_format_progress_line_includes_status_task_and_elapsed(self) -> None:
        task = Task(
            task_id="001-demo-01-baseline_research",
            kind="direction",
            phase="baseline_research",
            sequence=1,
            direction_slug="demo-01",
        )
        line = format_progress_line(
            index=3,
            total=100,
            task=task,
            status="done",
            elapsed_seconds=12.34,
            detail="returncode=0",
        )
        self.assertIn("[3/100]", line)
        self.assertIn("DONE", line)
        self.assertIn(task.task_id, line)
        self.assertIn("12.3s", line)
        self.assertIn("returncode=0", line)

    def test_build_progress_event_captures_task_metadata(self) -> None:
        task = Task(
            task_id="001-demo-01-baseline_research",
            kind="direction",
            phase="baseline_research",
            sequence=1,
            direction_slug="demo-01",
        )
        event = build_progress_event(
            index=1,
            total=100,
            task=task,
            status="start",
            detail="begin",
        )
        self.assertEqual(event["index"], 1)
        self.assertEqual(event["total"], 100)
        self.assertEqual(event["task_id"], task.task_id)
        self.assertEqual(event["kind"], "direction")
        self.assertEqual(event["phase"], "baseline_research")
        self.assertEqual(event["direction_slug"], "demo-01")
        self.assertEqual(event["status"], "start")
        self.assertEqual(event["detail"], "begin")


class ProxyEnvTest(unittest.TestCase):
    def test_build_proxy_env_mirrors_lowercase_to_uppercase(self) -> None:
        env = build_proxy_env(
            base_env={"PATH": "/bin", "http_proxy": "http://127.0.0.1:7897"},
        )
        self.assertEqual(env["http_proxy"], "http://127.0.0.1:7897")
        self.assertEqual(env["HTTP_PROXY"], "http://127.0.0.1:7897")
        self.assertEqual(env["https_proxy"], "http://127.0.0.1:7897")
        self.assertEqual(env["HTTPS_PROXY"], "http://127.0.0.1:7897")

    def test_build_proxy_env_prefers_explicit_args(self) -> None:
        env = build_proxy_env(
            base_env={"http_proxy": "http://old:1", "https_proxy": "http://old:2"},
            http_proxy="http://127.0.0.1:7897",
            https_proxy="http://127.0.0.1:7898",
        )
        self.assertEqual(env["http_proxy"], "http://127.0.0.1:7897")
        self.assertEqual(env["HTTP_PROXY"], "http://127.0.0.1:7897")
        self.assertEqual(env["https_proxy"], "http://127.0.0.1:7898")
        self.assertEqual(env["HTTPS_PROXY"], "http://127.0.0.1:7898")

    def test_parse_args_accepts_proxy_flags(self) -> None:
        args = parse_args(
            [
                "--calls",
                "1",
                "--http-proxy",
                "http://127.0.0.1:7897",
                "--https-proxy",
                "http://127.0.0.1:7897",
            ]
        )
        self.assertEqual(args.http_proxy, "http://127.0.0.1:7897")
        self.assertEqual(args.https_proxy, "http://127.0.0.1:7897")


@unittest.skipUnless(BYTECAMP_DOC.exists() and BRAINSTORM_DOC.exists(), "target docs not present")
class ActualDocsTest(unittest.TestCase):
    def test_actual_docs_produce_24_directions(self) -> None:
        bytecamp = parse_directions(BYTECAMP_DOC, source_key="bytecamp")
        brainstorm = parse_directions(BRAINSTORM_DOC, source_key="brainstorming")
        self.assertEqual(len(bytecamp), 12)
        self.assertEqual(len(brainstorm), 12)
        self.assertEqual(len(bytecamp) + len(brainstorm), 24)


if __name__ == "__main__":
    unittest.main()
