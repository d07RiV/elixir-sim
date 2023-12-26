import { MutableNumber, numberAdd, numberCreate, numberValue } from './number'
import { generateEffectOptions } from './sim'

export type ElixirGrade = 'epic' | 'legendary'

export type SageState = {
  disabled: boolean
  order: number
  chaos: number
}

export type EffectState = {
  id: number
  chance: MutableNumber
  critical: MutableNumber
  points: number
  sealed: boolean
}

export type StepContext = {
  modifiers: number[]
  pickedSage: number
  pickedTarget: number
  effectsModified: number
  pointsAdded: number
  effectPool: number[]
  modifierApplied: boolean
}

export type ElixirState = {
  grade: ElixirGrade
  charClass: number
  step: number
  sages: SageState[]
  effects: EffectState[]
  goldModifier: MutableNumber
  rerolls: number
  context: StepContext
  goldSpent: number
}

export function createElixir(
  grade: ElixirGrade,
  charClass: number
): ElixirState {
  const state: ElixirState = {
    grade,
    charClass,
    step: 1,
    sages: [
      { disabled: false, order: 0, chaos: 0 },
      { disabled: false, order: 0, chaos: 0 },
      { disabled: false, order: 0, chaos: 0 }
    ],
    effects: [],
    goldModifier: numberCreate(0),
    rerolls: 2,
    context: undefined!,
    goldSpent: 0
  }
  state.context = createStepContext(generateEffectOptions(state))
  return state
}

export function createElixirEffect(id: number): EffectState {
  return {
    id,
    chance: numberCreate(2000),
    critical: numberCreate(1000),
    points: 0,
    sealed: false
  }
}

export function createStepContext(modifiers: number[]): StepContext {
  return {
    modifiers,
    pickedSage: -1,
    pickedTarget: -1,
    effectsModified: 1,
    pointsAdded: 1,
    effectPool: [0, 1, 2, 3, 4],
    modifierApplied: false
  }
}

export type ElixirGradeDefinition = {
  maxLevel: number
  pointsPerLevel: number[]
  maxPoints: number
  goldPerStep: number
  catalystsPerStep: number
  steps: number
  name: string
  itemName: string
}

export const elixirGrades: Record<ElixirGrade, ElixirGradeDefinition> = {
  epic: {
    maxLevel: 4,
    maxPoints: 9,
    pointsPerLevel: [3, 6, 8, 9],
    goldPerStep: 40,
    catalystsPerStep: 1,
    steps: 12,
    name: 'tip.name.enum_itemgrade_epic',
    itemName: 'tip.name.item_66160200'
  },
  legendary: {
    maxLevel: 5,
    maxPoints: 10,
    pointsPerLevel: [3, 6, 8, 9, 10],
    goldPerStep: 280,
    catalystsPerStep: 5,
    steps: 14,
    name: 'tip.name.enum_itemgrade_legend',
    itemName: 'tip.name.item_66160300'
  }
}

type BodyPart = {
  uiString: string
  tooltipString: string
  itemString: string
}

export const bodyParts: Record<number, BodyPart> = {
  0: {
    uiString: 'sys.elixir.ui_part_type_common',
    tooltipString: 'sys.elixir.tooltip_enhance_part_type_common',
    itemString: 'sys.elixir.tooltip_part_type_common'
  },
  1: {
    uiString: 'sys.elixir.ui_part_type_head',
    tooltipString: 'sys.elixir.tooltip_enhance_part_type_head',
    itemString: 'sys.elixir.tooltip_part_type_head'
  },
  2: {
    uiString: 'sys.elixir.ui_part_type_upperbody',
    tooltipString: 'sys.elixir.tooltip_enhance_part_type_upperbody',
    itemString: 'sys.elixir.tooltip_part_type_upperbody'
  },
  3: {
    uiString: 'sys.elixir.ui_part_type_lowerbody',
    tooltipString: 'sys.elixir.tooltip_enhance_part_type_lowerbody',
    itemString: 'sys.elixir.tooltip_part_type_lowerbody'
  },
  4: {
    uiString: 'sys.elixir.ui_part_type_hand',
    tooltipString: 'sys.elixir.tooltip_enhance_part_type_hand',
    itemString: 'sys.elixir.tooltip_part_type_hand'
  },
  5: {
    uiString: 'sys.elixir.ui_part_type_shoulder',
    tooltipString: 'sys.elixir.tooltip_enhance_part_type_shoulder',
    itemString: 'sys.elixir.tooltip_part_type_shoulder'
  }
}

export function stateUpdateChances(state: ElixirState) {
  const { maxPoints } = elixirGrades[state.grade]
  let sealedChance = 0
  let unsealedCount = 0
  for (const fx of state.effects) {
    if (fx.sealed || fx.points >= maxPoints) {
      sealedChance += numberValue(fx.chance)
    } else {
      unsealedCount += 1
    }
  }
  if (!sealedChance || !unsealedCount) return state
  state = { ...state }
  state.effects = state.effects.map((fx) => {
    if (fx.sealed || fx.points >= maxPoints) {
      return { ...fx, chance: numberCreate(0) }
    } else {
      return {
        ...fx,
        chance: numberAdd(fx.chance, sealedChance / unsealedCount)
      }
    }
  })
  return state
}

export function effectLevel(points: number, grade: ElixirGrade) {
  const gradeInfo = elixirGrades[grade]
  let level = gradeInfo.maxLevel
  while (level > 0 && points < gradeInfo.pointsPerLevel[level - 1]) {
    level -= 1
  }
  return level
}
