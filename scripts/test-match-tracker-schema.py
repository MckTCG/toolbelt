from pathlib import Path
import sqlite3
sql = (Path(__file__).resolve().parent.parent / 'migrations/0001_match_tracker.sql').read_text()
db=sqlite3.connect(':memory:')
db.executescript(sql)
cols={r[1] for r in db.execute('PRAGMA table_info(matches)').fetchall()}
assert {'raw_log','log_hash','my_deck','my_deck_version','result','parsed_json','deck_snapshot_json'}.issubset(cols)
row=('00000000-0000-4000-8000-000000000001','2026-11-21T00:00:00Z','2026-11-21','ptcgl','testing','bo1','win','A','B','Pory-Hon','v3','Dragapult',1,'test','note','RAW CONTENT','hash-one','','{}')
sql_insert='INSERT INTO matches VALUES ('+','.join(['?']*len(row))+')'
db.execute(sql_insert,row)
assert db.execute('SELECT raw_log FROM matches').fetchone()[0]=='RAW CONTENT'
try:
    db.execute(sql_insert,('00000000-0000-4000-8000-000000000002',)+row[1:])
    raise AssertionError('Duplicate log hash unexpectedly accepted')
except sqlite3.IntegrityError:
    pass
print('D1 SQLite migration and unique raw-log hash verified.')
