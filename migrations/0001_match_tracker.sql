-- Match Tracker v1. Run with: npx wrangler d1 migrations apply toolbelt-matches --remote
-- Raw logs are stored verbatim. Structured fields are indexed for statistics.
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  played_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('ptcgl','manual','simulator')),
  match_type TEXT NOT NULL CHECK (match_type IN ('ladder','testing','tournament','casual')),
  format TEXT NOT NULL CHECK (format IN ('bo1','bo3')),
  result TEXT NOT NULL CHECK (result IN ('win','loss','tie')),
  my_player TEXT NOT NULL DEFAULT '',
  opponent_player TEXT NOT NULL DEFAULT '',
  my_deck TEXT NOT NULL DEFAULT '',
  my_deck_version TEXT NOT NULL DEFAULT '',
  opponent_deck TEXT NOT NULL DEFAULT '',
  went_first INTEGER CHECK (went_first IN (0,1) OR went_first IS NULL),
  session_name TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  raw_log TEXT NOT NULL DEFAULT '',
  log_hash TEXT UNIQUE,
  deck_snapshot_json TEXT NOT NULL DEFAULT '',
  parsed_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_matches_played_at ON matches(played_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_matchup ON matches(my_deck, opponent_deck);
CREATE INDEX IF NOT EXISTS idx_matches_session ON matches(session_name);
