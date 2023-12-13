//import rawData from '../assets/elixir.json'
import { ActionDefinition } from './modifiers'

export type ModifierDefinition = {
  weight: number
  rangeStart: number
  rangeEnd: number
  desc1: string
  desc2: string
  desc3: string
  tooltip: string
  slotType: number
  attrType: number
  applyMax: number
  actions: ActionDefinition[]
}

export type EffectDefinition = {
  classFilter: number
  partType: number
  title: string
  descLv0: string
  descLv1: string
  descLv2: string
  descLv3: string
  descLv4: string
  descLv5: string
  weight: number
  set: number
  effects: {
    type: number
    stat: number
    levels: {
      index: number
      value: number
    }[]
  }[]
}

export type EffectSetDefinition = {
  levelSum: number
  activateHighestLevelOnly: boolean
  name: string
  desc: string
  effects: {
    type: number
    stat: number
    index: number
    value: number
  }[]
}

type GameData = {
  describeEffects?: boolean
  modifiers: Record<number, ModifierDefinition>
  effects: Record<number, EffectDefinition>
  sets: Record<number, EffectSetDefinition[]>
  classes: Record<
    number,
    {
      baseClass: number
      name: string
    }
  >
  strings: Record<string, string>
}

export type Region = 'ru' | 'en'
export const DefaultRegion: Region = 'en'

const Data = {} as GameData

export default Data

export async function loadData(lang: Region) {
  const data = await fetch(
    process.env.PUBLIC_URL + `/elixir.${lang}.json`
  ).then((r) => r.json())
  Object.assign(Data, data)
}
