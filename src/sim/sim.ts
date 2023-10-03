import Data from './data'
import { ActionDefinition, elixirModifiers } from './modifiers'
import { numberAdvance, numberValue } from './number'
import { clamp0, weighedRandom } from './random'
import {
  EffectState,
  ElixirState,
  createElixirEffect,
  createStepContext,
  elixirGrades,
  stateUpdateChances
} from './state'

export function stateEffectOptions(state: ElixirState) {
  const partTypes = new Set<number>()
  const effects = new Set<number>()
  for (const fx of state.effects) {
    const effect = Data.effects[fx.id]
    if (effect.partType) partTypes.add(effect.partType)
    effects.add(fx.id)
  }
  return Object.keys(Data.effects)
    .map(Number)
    .filter((id) => {
      const effect = Data.effects[id]
      if (effects.has(id)) return false
      if (effect.classFilter && effect.classFilter !== state.charClass)
        return false
      if (effect.partType && partTypes.has(effect.partType)) return false
      return true
    })
}

export function generateEffectOptions(state: ElixirState) {
  const options = stateEffectOptions(state)
  const weights = options.map((id) => Data.effects[id].weight)
  return [0, 1, 2].map(() => {
    const index = weighedRandom(weights)
    const id = options[index]
    options.splice(index, 1)
    weights.splice(index, 1)
    return id
  })
}

function sageStatus(state: ElixirState, slot: number) {
  const sage = state.sages[slot]
  if (sage.disabled) return 2

  let result = 0
  if (sage.order === 3) result = 3
  if (sage.chaos === 6) result = 6

  const remainSteps = elixirGrades[state.grade].steps - state.step + 1
  const unsealed = state.effects.filter((fx) => !fx.sealed).length
  if (unsealed - 2 >= remainSteps) result += 1

  return result
}

function filterEffects(state: ElixirState, func: (fx: EffectState) => boolean) {
  return state.effects.map((_, i) => i).filter((i) => func(state.effects[i]))
}

function effectTargets(state: ElixirState, mod: ActionDefinition) {
  switch (mod.targetType) {
    case 0:
      return [-1]
    case 1:
      return [0, 1, 2, 3, 4]
    case 2:
      return [mod.targetCondition - 1]
    case 4:
      const minPoints = Math.min(
        ...state.effects.filter((fx) => !fx.sealed).map((fx) => fx.points)
      )
      return filterEffects(state, (fx) => fx.points === minPoints)
    case 5:
      const maxPoints = Math.max(
        ...state.effects.filter((fx) => !fx.sealed).map((fx) => fx.points)
      )
      return filterEffects(state, (fx) => fx.points === maxPoints)
    case 6:
      return [0, 1, 2, 3, 4]
    case 9:
      return filterEffects(state, (fx) => fx.points <= mod.targetCondition)
    case 10:
      return [0, 2, 4]
    case 11:
      return [1, 3]
    default:
      return []
  }
}

export function validModifiersForSlot(state: ElixirState, slot: number) {
  const attrType = sageStatus(state, slot)

  return Object.keys(Data.modifiers)
    .map(Number)
    .filter((id) => {
      const mod = Data.modifiers[id]
      if (mod.slotType !== 3 && mod.slotType !== slot) return false
      if (mod.attrType !== attrType) return false
      if (mod.rangeStart && state.step < mod.rangeStart) return false
      if (mod.rangeEnd && state.step > mod.rangeEnd) return false
      for (const action of mod.actions) {
        const func = elixirModifiers[action.type]
        if (!func) return false
        const targets = effectTargets(state, action).filter((target) =>
          func.valid(state, target, action)
        )
        if (!targets.length) return false
      }
      return true
    })
}

export function generateModifiers(state: ElixirState) {
  const used = new Set<number>()
  return [0, 1, 2].map((slot) => {
    const mods = validModifiersForSlot(state, slot).filter(
      (id) => !used.has(id)
    )
    if (!mods.length)
      throw Error(
        `no modifiers for slot ${slot}\nstate:\n${JSON.stringify(
          state,
          undefined,
          2
        )}`
      )
    const index = weighedRandom(mods.map((id) => Data.modifiers[id].weight))
    used.add(mods[index])
    return mods[index]
  })
}

export function stateAddEffect(state: ElixirState) {
  const id = state.context.modifiers[state.context.pickedSage]
  state = { ...state }
  state.effects = state.effects.slice()
  state.effects.push(createElixirEffect(id))
  if (state.effects.length >= 5) {
    state.context = createStepContext(generateModifiers(state))
  } else {
    state.context = createStepContext(generateEffectOptions(state))
  }
  return state
}

export function stateSelectSage(state: ElixirState, index: number) {
  state = { ...state }
  state.context = {
    ...state.context,
    pickedSage: index,
    pickedTarget: -1
  }
  return state
}

export function stateSelectTarget(state: ElixirState, index: number) {
  state = { ...state }
  state.context = {
    ...state.context,
    pickedTarget: index
  }
  return state
}

export type AffectedTargets = {
  targets: number[]
  targetCount: number
  pick: boolean
}

export function modifierAffectedTargets(state: ElixirState): AffectedTargets {
  const id = state.context.modifiers[state.context.pickedSage]
  const mod = Data.modifiers[id]
  const result: AffectedTargets = {
    targets: [],
    targetCount: 0,
    pick: false
  }
  if (state.effects.length < 5) return result
  if (!mod) return result
  for (const action of mod.actions) {
    const func = elixirModifiers[action.type]
    if (!func) continue
    const targets = effectTargets(state, action).filter((target) =>
      func.valid(state, target, action)
    )
    if (action.targetType === 6) {
      return {
        targets,
        targetCount: 1,
        pick: true
      }
    }
    result.targets.push(...targets)
    result.targetCount += action.targetCount
  }
  return result
}

export function stateApplyModifier(state: ElixirState) {
  const id = state.context.modifiers[state.context.pickedSage]
  const mod = Data.modifiers[id]
  if (!mod) return state
  for (const action of mod.actions) {
    const func = elixirModifiers[action.type]
    if (!func) continue
    const curState = state
    const pickedTargets: number[] = []
    if (action.targetType === 6) {
      pickedTargets.push(state.context.pickedTarget)
    } else {
      const targets = effectTargets(state, action).filter((target) =>
        func.valid(curState, target, action)
      )
      for (let i = 0; i < action.targetCount && targets.length; ++i) {
        const index = Math.floor(Math.random() * targets.length)
        pickedTargets.push(targets[index])
        targets.splice(index, 1)
      }
    }
    const results = func.apply(state, pickedTargets, action)
    const index = weighedRandom(results.map((r) => r.weight))
    state = results[index].state
  }
  state = { ...state }
  state.context = {
    ...state.context,
    modifierApplied: true
  }
  return stateUpdateChances(state)
}

export function statePreviewModifier(state: ElixirState) {
  if (state.context.modifierApplied || state.context.pickedSage < 0)
    return undefined
  const id = state.context.modifiers[state.context.pickedSage]
  if (state.effects.length < 5) {
    return stateAddEffect(state)
  }
  const mod = Data.modifiers[id]
  if (!mod) return undefined
  for (const action of mod.actions) {
    const func = elixirModifiers[action.type]
    if (!func) continue
    const curState = state
    const pickedTargets: number[] = []
    if (action.targetType === 6) {
      if (state.context.pickedTarget < 0) return undefined
      pickedTargets.push(state.context.pickedTarget)
    } else {
      const targets = effectTargets(state, action).filter((target) =>
        func.valid(curState, target, action)
      )
      if (action.targetCount === targets.length) {
        pickedTargets.push(...targets)
      } else {
        return undefined
      }
    }
    const results = func.apply(state, pickedTargets, action)
    if (results.length !== 1) return undefined
    state = results[0].state
  }
  state = { ...state }
  state.context = {
    ...state.context,
    modifierApplied: true
  }
  return stateUpdateChances(state)
}

export function stateTransmute(state: ElixirState) {
  const { maxPoints, steps } = elixirGrades[state.grade]
  const effectPool = state.context.effectPool.filter(
    (i) => !state.effects[i].sealed && state.effects[i].points < maxPoints
  )
  state = { ...state }
  const effectPoints = state.effects.map((fx) => fx.points)
  const effectChances = state.effects.map((fx) => numberValue(fx.chance))
  for (let i = 0; i < state.context.effectsModified; ++i) {
    const poolIndex = weighedRandom(effectPool.map((i) => effectChances[i]))
    const index = effectPool[poolIndex]
    effectPool.splice(poolIndex, 1)

    const critical = numberValue(state.effects[index].critical)
    effectPoints[index] +=
      state.context.pointsAdded + (Math.random() * 10000 < critical ? 1 : 0)
  }

  state.effects = state.effects.map((fx, index) => ({
    ...fx,
    points: clamp0(effectPoints[index], maxPoints),
    chance: numberAdvance(fx.chance),
    critical: numberAdvance(fx.critical)
  }))

  state.step += 1
  state.goldModifier = numberAdvance(state.goldModifier)

  state = stateUpdateChances(state)

  state.sages = state.sages.map((sage, index) => {
    if (sage.disabled) return sage
    sage = { ...sage }
    if (index === state.context.pickedSage) {
      sage.order = sage.order >= 3 ? 1 : sage.order + 1
      sage.chaos = 0
    } else {
      sage.chaos = sage.chaos >= 6 ? 1 : sage.chaos + 1
      sage.order = 0
    }
    return sage
  })

  if (state.step <= steps) {
    state.context = createStepContext(generateModifiers(state))
  }
  return state
}

export function stateRerollOptions(state: ElixirState) {
  if (!state.rerolls) return state
  state = { ...state }
  state.rerolls -= 1
  if (state.effects.length >= 5) {
    state.context = createStepContext(generateModifiers(state))
  } else {
    state.context = createStepContext(generateEffectOptions(state))
  }
  return state
}
