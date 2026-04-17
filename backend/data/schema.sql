-- 蹲到了 Demo · SQLite schema
-- 单演示用户 + 博主 + 信号 + 博主新动作 + 已生成卡片

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  nickname     TEXT NOT NULL,
  avatar       TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS creators (
  id           TEXT PRIMARY KEY,
  handle       TEXT NOT NULL,
  display      TEXT NOT NULL,
  avatar       TEXT,
  bio          TEXT
);

-- 用户过去的意图信号：某天在某条视频下 蹲 / 收藏 / 稍后再看 / 搜索
CREATE TABLE IF NOT EXISTS intent_signals (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT NOT NULL,
  creator_id      TEXT NOT NULL,
  video_id        TEXT NOT NULL,
  video_title     TEXT NOT NULL,
  signal_type     TEXT NOT NULL CHECK (signal_type IN (
    'comment_intent','watch_later','unfinished_save',
    'unsatisfied_search','passive_interest'
  )),
  raw_text        TEXT,
  topic           TEXT NOT NULL,
  occurred_at     TEXT NOT NULL,
  fulfilled       INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id)    REFERENCES users(id),
  FOREIGN KEY (creator_id) REFERENCES creators(id)
);

CREATE INDEX IF NOT EXISTS idx_intent_signals_user_topic
  ON intent_signals(user_id, topic, fulfilled, occurred_at);

-- 博主新动作：发链接 / 更新下一集 / 更完系列
CREATE TABLE IF NOT EXISTS creator_actions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id      TEXT NOT NULL,
  action_type     TEXT NOT NULL CHECK (action_type IN (
    'post_link','post_sequel','series_completed','reply_tutorial'
  )),
  payload_json    TEXT NOT NULL,
  topic           TEXT NOT NULL,
  occurred_at     TEXT NOT NULL,
  FOREIGN KEY (creator_id) REFERENCES creators(id)
);

CREATE INDEX IF NOT EXISTS idx_creator_actions_topic
  ON creator_actions(topic, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_creator_actions_type_time
  ON creator_actions(action_type, occurred_at DESC);

-- 已触发并展示给用户的履约卡片
CREATE TABLE IF NOT EXISTS cards (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL,
  script_id        TEXT NOT NULL CHECK (script_id IN ('A','B','C')),
  intent_signal_id INTEGER,
  creator_action_id INTEGER,
  pages_json       TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id)           REFERENCES users(id),
  FOREIGN KEY (intent_signal_id)  REFERENCES intent_signals(id),
  FOREIGN KEY (creator_action_id) REFERENCES creator_actions(id)
);

CREATE INDEX IF NOT EXISTS idx_cards_user_created
  ON cards(user_id, created_at DESC);

-- 防御层：一张 intent_signal 最多履约一次
CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_unique_signal
  ON cards(intent_signal_id);
