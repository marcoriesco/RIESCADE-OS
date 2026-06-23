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
  image?: string
  video?: string
  marquee?: string
  thumbnail?: string
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
}
