export interface System {
  name: string
  fullname: string
  path: string
  extension: string
  command: string
  platform: string
  theme: string
  hardware?: string
  group?: string
  emulators: Emulator[]
  gamecount?: number
  logo?: string
  art?: string
}

export interface Emulator {
  name: string
  cores: string[]
}

export interface Game {
  id: string
  name: string
  desc?: string
  video?: string
  marquee?: string
  rating?: number
  releasedate?: string
  developer?: string
  publisher?: string
  genre?: string
  players?: string
  favorite?: boolean
  hidden?: boolean
  kidgame?: boolean
  playcount?: number
  lastplayed?: string
  path: string
  system: string
  emulator?: string
  core?: string
  isCollectionFolder?: boolean
  cheevosId?: string
  cheevosHash?: string
  fanart?: string
  mix?: string
  manual?: string
  gamefamily?: string
  arcadesystem?: string
  languages?: string
  region?: string
  lang?: string
  cover?: string
  cover2d?: string
  cover3d?: string
  coverback?: string
  logo?: string
  screenshot?: string
  title?: string
  sortname?: string
  tags?: string
  crc32?: string
  md5?: string
  gametime?: number
  scrapName?: string
  scrapDate?: string
  gameCount?: number
}

