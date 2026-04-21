ALTER TABLE intent_signals ADD COLUMN aid INTEGER;
ALTER TABLE intent_signals ADD COLUMN rpid INTEGER;
ALTER TABLE intent_signals ADD COLUMN parent_rpid INTEGER;
ALTER TABLE intent_signals ADD COLUMN source TEXT DEFAULT 'mock';

CREATE UNIQUE INDEX IF NOT EXISTS idx_intent_rpid
  ON intent_signals(rpid)
  WHERE rpid IS NOT NULL;

ALTER TABLE creator_actions ADD COLUMN rpid INTEGER;
ALTER TABLE creator_actions ADD COLUMN replying_to_rpid INTEGER;
ALTER TABLE creator_actions ADD COLUMN is_answer INTEGER DEFAULT 0;
ALTER TABLE creator_actions ADD COLUMN confidence REAL DEFAULT 0;
ALTER TABLE creator_actions ADD COLUMN judge_reason TEXT;
ALTER TABLE creator_actions ADD COLUMN source TEXT DEFAULT 'mock';

CREATE UNIQUE INDEX IF NOT EXISTS idx_action_rpid
  ON creator_actions(rpid)
  WHERE rpid IS NOT NULL;

PRAGMA user_version = 2;
