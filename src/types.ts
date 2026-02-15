
export interface EngineConfig {
  id?: string;
  name: string;
  path: string;
  options: [string, string][];
  protocol?: string;
  logo_path?: string;
}

export interface AdjudicationConfig {
  resign_score: number | null;
  resign_move_count: number | null;
  draw_score: number | null;
  draw_move_number: number | null;
  draw_move_count: number | null;
  result_adjudication: boolean;
  syzygy_path: string | null;
}

export interface OpeningConfig {
  file: string | null;
  fen: string | null;
  depth: number | null;
  order: string | null;
  book_path: string | null;
}

export interface SprtSettings {
  enabled: boolean;
  h0Elo: number;
  h1Elo: number;
  drawRatio: number;
  alpha: number;
  beta: number;
}

export interface TournamentSettings {
  mode: 'Match' | 'RoundRobin' | 'Gauntlet' | 'Swiss' | 'Pyramid';
  gamesCount: number;
  swapSides: boolean;
  concurrency: number;
  timeControl: { baseMs: number; incMs: number };
  eventName: string;
  pgnPath: string;
  overwritePgn: boolean;
  variant: 'standard' | 'chess960';
  sprt: SprtSettings;
  disabledEngineIds: string[];
  ponder: boolean;
  moveOverheadMs: number;
}

export interface GameUpdate {
  fen: string;
  last_move: string | null;
  white_time: number;
  black_time: number;
  move_number: number;
  result: string | null;
  white_engine_idx: number;
  black_engine_idx: number;
  game_id: number;
}

export interface EngineStats {
  depth: number;
  score_cp: number | null;
  score_mate: number | null;
  nodes: number;
  nps: number;
  pv: string;
  engine_idx: number;
  game_id: number;
  tb_hits?: number;
  hash_full?: number;
}

export interface ScheduledGame {
  id: number;
  white_name: string;
  black_name: string;
  state: string;
  result: string | null;
}

export interface StandingsEntry {
  rank: number;
  engine_name: string;
  engine_id?: string;
  games_played: number;
  points: number;
  score_percent: number;
  wins: number;
  losses: number;
  draws: number;
  crashes: number;
  sb: number;
  elo: number;
}
