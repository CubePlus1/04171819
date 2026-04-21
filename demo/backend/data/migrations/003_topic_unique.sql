ALTER TABLE cards ADD COLUMN topic TEXT;

UPDATE cards
   SET topic = (
     SELECT s.topic
       FROM intent_signals s
      WHERE s.id = cards.intent_signal_id
   )
 WHERE topic IS NULL
   AND intent_signal_id IS NOT NULL;

UPDATE cards
   SET topic = NULL
 WHERE rowid IN (
   SELECT c.rowid
     FROM cards c
     JOIN (
       SELECT user_id, topic, MIN(rowid) AS keep_rowid
         FROM cards
        WHERE topic IS NOT NULL
        GROUP BY user_id, topic
       HAVING COUNT(*) > 1
     ) duplicates
       ON duplicates.user_id = c.user_id
      AND duplicates.topic = c.topic
    WHERE c.rowid != duplicates.keep_rowid
 );

CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_user_topic
  ON cards(user_id, topic)
  WHERE topic IS NOT NULL;

PRAGMA user_version = 3;
