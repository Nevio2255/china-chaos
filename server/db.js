import Database from 'better-sqlite3';
import fs from 'fs'; import path from 'path';
const file=process.env.DATABASE_URL||'./data/china-chaos.db'; fs.mkdirSync(path.dirname(file),{recursive:true});
const db=new Database(file); db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS stats(id TEXT PRIMARY KEY,name TEXT,games INTEGER DEFAULT 0,wins INTEGER DEFAULT 0,points INTEGER DEFAULT 0,coins INTEGER DEFAULT 0,dragons INTEGER DEFAULT 0,pandas INTEGER DEFAULT 0,best INTEGER DEFAULT 0,best_combo INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS records(difficulty TEXT PRIMARY KEY,player_id TEXT,name TEXT,score INTEGER DEFAULT 0,created_at TEXT);`);
for(const sql of [`ALTER TABLE stats ADD COLUMN best_combo INTEGER DEFAULT 0`]){try{db.exec(sql)}catch{}}
const up=db.prepare(`INSERT INTO stats(id,name,games,wins,points,coins,dragons,pandas,best,best_combo) VALUES(@id,@name,1,@win,@score,@coins,@dragons,@pandas,@score,@bestCombo) ON CONFLICT(id) DO UPDATE SET name=@name,games=games+1,wins=wins+@win,points=points+@score,coins=coins+@coins,dragons=dragons+@dragons,pandas=pandas+@pandas,best=MAX(best,@score),best_combo=MAX(best_combo,@bestCombo)`);
export function recordGame(p,won,difficulty='normal'){up.run({id:p.id,name:p.name,win:won?1:0,score:p.score,coins:p.coins,dragons:p.dragons,pandas:p.pandas,bestCombo:p.bestCombo||0}); const old=db.prepare('SELECT * FROM records WHERE difficulty=?').get(difficulty); if(!old||p.score>old.score){db.prepare(`INSERT INTO records(difficulty,player_id,name,score,created_at) VALUES(?,?,?,?,?) ON CONFLICT(difficulty) DO UPDATE SET player_id=excluded.player_id,name=excluded.name,score=excluded.score,created_at=excluded.created_at`).run(difficulty,p.id,p.name,p.score,new Date().toISOString()); return {broken:true,old:old?.score||0,score:p.score,name:p.name,difficulty};} return {broken:false};}
export const getStats=id=>db.prepare('SELECT * FROM stats WHERE id=?').get(id);
export const top=(n=10)=>db.prepare('SELECT name,wins,games,points,best,best_combo FROM stats ORDER BY best DESC,points DESC LIMIT ?').all(n);
export const records=()=>db.prepare('SELECT * FROM records ORDER BY score DESC').all();
export const closeDb=()=>db.close();
