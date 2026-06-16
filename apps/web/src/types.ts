export interface Card {
  id: number
  address: string
  name: string | null
  avatar: string | null
  followers: number | null
}

export interface Daily {
  puzzleId: number
  date: string
  par: number
  snapshotId: number
  start: Card
  target: Card
}

export interface BoardResp {
  nodeId: number
  total: number
  cursor: number
  nextCursor: number | null
  following: Card[]
}

export interface SolveResp {
  valid: boolean
  reason?: string
  hops?: number
  par?: number
  beatPar?: boolean
  posted?: boolean
}

export interface EndlessResp {
  startId: number
  targetId: number
  par: number
  start: Card
  target: Card
}

export interface MePuzzle {
  meToken: string
  par: number
  start: Card
  target: Card
  following: Card[]
  followingTotal: number
  followingNextCursor: number | null
}

export interface LeaderRow {
  rank: number
  hops: number
  timeMs: number
  name: string | null
  avatar: string | null
  address: string
}

export interface SessionResp {
  address: string | null
  profile: Card | null
}
