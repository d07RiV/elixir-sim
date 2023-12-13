import fs from 'fs'
import Data from './data'
import { ActionDefinition, elixirModifiers } from './modifiers'
import { numberAdvance, numberCreate, numberValue } from './number'
import { clamp0, normalizeWeights, pickOutcomes } from './random'
import {
  effectTargets,
  modifierAffectedTargets,
  validModifiersForSlot
} from './sim'
import {
  ElixirGrade,
  ElixirState,
  SageState,
  createStepContext,
  effectLevel,
  elixirGrades,
  stateUpdateChances
} from './state'

const maxRerolls = 5

const sageSize0 = 3 * 3 * 6 * 6
const sageSize1a = 6 * 6
const sageSize1b = 3 * 6
const sageSize1 = sageSize1a + 2 * sageSize1b
const sageSize2a = 6
const sageSize2b = 3
const sageSize2 = sageSize2a + sageSize2b
const sageSize3 = 1

const sageOrigin = [1]
sageOrigin[1] = sageOrigin[0] + sageSize0
sageOrigin[2] = sageOrigin[1] + sageSize1
sageOrigin[3] = sageOrigin[2] + sageSize1
sageOrigin[4] = sageOrigin[3] + sageSize2
sageOrigin[5] = sageOrigin[4] + sageSize1
sageOrigin[6] = sageOrigin[5] + sageSize2
sageOrigin[7] = sageOrigin[6] + sageSize2
sageOrigin[8] = sageOrigin[7] + sageSize3

const sageSize = sageOrigin[8]

const clamp = (i: number, min: number, max: number) =>
  Math.max(min, Math.min(max, i))

// This needs to be ordered such that states with same seals & index are in order of descending 'order'

function encodeSages(sages: SageState[]) {
  const disableMask = sages.reduce(
    (sum, s, i) => sum | ((s.disabled ? 1 : 0) << i),
    0
  )
  const enabled = sages.filter((s) => !s.disabled)
  const index = enabled.findIndex((s) => s.order > 0)
  const order = index < 0 ? 0 : 3 - clamp(enabled[index].order, 1, 3)
  const other = enabled.filter((s, i) => i !== index)
  const chaos = other.reduce(
    (sum, s, i) => sum + (clamp(s.chaos, 1, 6) - 1) * Math.pow(6, i),
    order * Math.pow(6, other.length)
  )
  switch (disableMask) {
    case 0:
      if (index < 0) return 0
      return sageOrigin[0] + index + 3 * chaos
    case 1:
    case 2:
    case 4:
      if (index < 0) {
        return sageOrigin[disableMask] + chaos
      } else {
        return sageOrigin[disableMask] + sageSize1a + index + 2 * chaos
      }
    case 3:
    case 5:
    case 6:
      if (index < 0) {
        return sageOrigin[disableMask] + chaos
      } else {
        return sageOrigin[disableMask] + sageSize2a + chaos
      }
    default:
      return sageOrigin[7]
  }
}

function decodeSages(key: number) {
  let mask = 0
  while (key >= sageOrigin[mask + 1]) mask += 1
  const sages = [0, 1, 2].map<SageState>((i) => ({
    disabled: mask & (1 << i) ? true : false,
    chaos: 0,
    order: 0
  }))
  if (!key) return sages
  key -= sageOrigin[mask]
  function read(m: number) {
    const v = key % m
    key = Math.floor(key / m)
    return v
  }
  let index = -1
  switch (mask) {
    case 0:
      index = read(3)
      break
    case 1:
    case 2:
    case 4:
      if (key >= sageSize1a) {
        key -= sageSize1a
        index = read(2)
      }
      break
    case 3:
    case 5:
    case 6:
      if (key >= sageSize2a) {
        key -= sageSize2a
        index = 0
      }
      break
  }
  let orderSage: SageState | undefined
  for (const s of sages) {
    if (s.disabled) continue
    if (index-- === 0) {
      orderSage = s
    } else {
      s.chaos = read(6) + 1
    }
  }
  if (orderSage) {
    orderSage.order = 3 - read(3)
  }
  return sages
}

function stateSize(grade: ElixirGrade) {
  const elixirGrade = elixirGrades[grade]
  return (
    sageSize *
    Math.pow(elixirGrade.maxPoints + 1, 2) *
    elixirGrade.steps *
    4 *
    (maxRerolls + 1)
  )
}

type OptimizerConfig = {
  grade: ElixirGrade
  charClass: number
  line1: number
  line2: number
  score: (a: number, b: number) => number
}

function encodeState(state: ElixirState, config: OptimizerConfig) {
  const elixirGrade = elixirGrades[state.grade]
  let result = 0
  let mult = 1
  function write(v: number, m: number) {
    result += v * mult
    mult *= m
  }
  write(encodeSages(state.sages), sageSize)
  write(
    clamp(state.effects[config.line1].points, 0, elixirGrade.maxPoints),
    elixirGrade.maxPoints + 1
  )
  write(
    clamp(state.effects[config.line2].points, 0, elixirGrade.maxPoints),
    elixirGrade.maxPoints + 1
  )
  const seals = state.effects.filter((e) => e.sealed).length
  write(clamp(seals, 0, 3), 4)
  write(clamp(maxRerolls - state.rerolls, 0, maxRerolls), maxRerolls + 1)
  write(clamp(state.step, 1, elixirGrade.steps) - 1, elixirGrade.steps)
  return result
}

function decodeState(key: number, config: OptimizerConfig) {
  function read(m: number) {
    const v = key % m
    key = Math.floor(key / m)
    return v
  }

  const { steps, maxPoints } = elixirGrades[config.grade]

  const state: ElixirState = {
    grade: config.grade,
    charClass: config.charClass,
    step: 0,
    sages: undefined!,
    effects: [0, 1, 2, 3, 4].map(() => ({
      id: 0,
      chance: numberCreate(2000),
      critical: numberCreate(1000),
      points: 0,
      sealed: false
    })),
    goldModifier: numberCreate(0),
    rerolls: 0,
    context: createStepContext([]),
    goldSpent: 0
  }

  state.sages = decodeSages(read(sageSize))
  state.effects[config.line1].points = read(maxPoints + 1)
  state.effects[config.line2].points = read(maxPoints + 1)
  let seals = read(4)
  let sealsLeft = seals
  seals += state.effects.filter((fx) => fx.points >= maxPoints).length
  state.effects.forEach((fx, i) => {
    if (i !== config.line1 && i !== config.line2) {
      if (sealsLeft-- > 0) {
        fx.sealed = true
        fx.chance.base = 0
        return
      }
    }
    if (fx.points >= maxPoints) {
      fx.chance.base = 0
    } else {
      fx.chance.base += (2000 * seals) / (5 - seals)
    }
  })
  state.rerolls = maxRerolls - read(maxRerolls + 1)
  state.step = read(steps) + 1

  return state
}

type OptimizerResult = {
  score: number
  chance1: number
  crit1: number
  chance2: number
  crit2: number
}

class ResultStorage {
  buffer: ArrayBuffer
  private view: DataView
  private lowWrite = Infinity

  constructor(size: number, private scale: number = 1) {
    this.buffer = new ArrayBuffer(size * 8)
    this.view = new DataView(this.buffer)
  }

  store(id: number, data: OptimizerResult) {
    const { view, scale } = this
    const offset = id * 8
    view.setFloat32(offset, data.score, true)
    view.setUint8(
      offset + 4,
      clamp(Math.round((data.chance1 * 255) / scale), 0, 255)
    )
    view.setUint8(
      offset + 5,
      clamp(Math.round((data.crit1 * 255) / scale), 0, 255)
    )
    view.setUint8(
      offset + 6,
      clamp(Math.round((data.chance2 * 255) / scale), 0, 255)
    )
    view.setUint8(
      offset + 7,
      clamp(Math.round((data.crit2 * 255) / scale), 0, 255)
    )
    this.lowWrite = Math.min(this.lowWrite, id)
  }

  load(id: number): OptimizerResult {
    if (id < this.lowWrite) throw Error(`uninitialized storage read`)
    const { view, scale } = this
    const offset = id * 8
    return {
      score: view.getFloat32(offset, true),
      chance1: (view.getUint8(offset + 4) * scale) / 255,
      crit1: (view.getUint8(offset + 5) * scale) / 255,
      chance2: (view.getUint8(offset + 6) * scale) / 255,
      crit2: (view.getUint8(offset + 7) * scale) / 255
    }
  }
}

const blankResult: OptimizerResult = {
  score: 0,
  chance1: 0,
  crit1: 0,
  chance2: 0,
  crit2: 0
}

function addResult(dst: OptimizerResult, src: OptimizerResult, w: number) {
  dst.score += src.score * w
  dst.chance1 += src.chance1 * w
  dst.crit1 += src.crit1 * w
  dst.chance2 += src.chance2 * w
  dst.crit2 += src.crit2 * w
}

function evaluateState(
  state: ElixirState,
  storage: ResultStorage,
  config: OptimizerConfig
) {
  const { steps, maxPoints } = elixirGrades[state.grade]
  const e1 = state.effects[config.line1]
  const e2 = state.effects[config.line2]
  if (state.step > steps) {
    return {
      score: config.score(
        effectLevel(e1.points, state.grade),
        effectLevel(e2.points, state.grade)
      ),
      chance1: 0,
      crit1: 0,
      chance2: 0,
      crit2: 0
    }
  }
  if (e1.sealed || e2.sealed) {
    return blankResult
  }

  const key = encodeState(state, config)
  const result = { ...storage.load(key) }
  const sealed = state.effects.filter(
    (fx) => fx.sealed || fx.points >= maxPoints
  ).length
  const canonicalChance =
    sealed >= 5 ? 2000 : 2000 + (2000 * sealed) / (5 - sealed)
  const chance1 = numberValue(e1.chance)
  const crit1 = numberValue(e1.critical)
  const chance2 = numberValue(e2.chance)
  const crit2 = numberValue(e2.critical)
  if (e1.points < maxPoints) {
    result.score += (result.chance1 * (chance1 - canonicalChance)) / 10000
    result.score += (result.crit1 * (crit1 - 1000)) / 10000
  }
  if (e2.points < maxPoints) {
    result.score += (result.chance2 * (chance2 - canonicalChance)) / 10000
    result.score += (result.crit2 * (crit2 - 1000)) / 10000
  }
  return result
}

function evaluateTransmute(
  state: ElixirState,
  storage: ResultStorage,
  config: OptimizerConfig
) {
  const { maxPoints } = elixirGrades[state.grade]

  const effectPool = state.context.effectPool.filter(
    (i) => !state.effects[i].sealed && state.effects[i].points < maxPoints
  )

  const newState = { ...state }
  newState.step += 1
  newState.effects = state.effects.map((fx) => ({
    ...fx,
    chance: numberAdvance(fx.chance),
    critical: numberAdvance(fx.critical)
  }))

  function applyPicks(state: ElixirState, indices: number[]) {
    if (!indices.length) return evaluateState(state, storage, config)
    const index = indices[0]
    const otherIndices = indices.slice(1)
    state = { ...state }
    state.effects = state.effects.slice()
    const fx = { ...state.effects[index] }
    state.effects[index] = fx
    fx.points = clamp0(fx.points + state.context.pointsAdded, maxPoints)
    const s0 = applyPicks(state, otherIndices)
    fx.points = clamp0(fx.points + 1, maxPoints)
    const s1 = applyPicks(state, otherIndices)

    const crit = numberValue(fx.critical) / 10000

    const result = { ...blankResult }
    addResult(result, s0, 1 - crit)
    addResult(result, s1, crit)
    if (index === config.line1) {
      result.crit1 += s1.score - s0.score
    } else if (index === config.line2) {
      result.crit2 += s1.score - s0.score
    }
    return result
  }

  const effectChance = state.effects.map((fx) => numberValue(fx.chance) / 10000)
  const otherSum = effectChance
    .filter((c, i) => i !== config.line1 && i !== config.line2)
    .reduce((sum, c) => sum + c, 0)

  const picks = pickOutcomes(
    effectPool.map((i) => effectChance[i]),
    Math.min(effectPool.length, state.context.effectsModified)
  )
  const pickSum = picks.reduce((sum, v) => sum + v.weight, 0)
  if (!effectPool.length || !pickSum) {
    return evaluateState(newState, storage, config)
  }
  const result = { ...blankResult }
  for (const p of picks) {
    if (!p.weight) continue
    const indices = p.indices.map((i) => effectPool[i])
    const filtered = indices.filter(
      (i) => i === config.line1 || i === config.line2
    )
    const weight = p.weight / pickSum
    let dWdP1 = 0
    let dWdP2 = 0
    for (let i of indices) {
      if (i === config.line1) {
        dWdP1 += weight / effectChance[i]
      } else if (i === config.line2) {
        dWdP2 += weight / effectChance[i]
      } else {
        dWdP1 -= weight / otherSum
        dWdP2 -= weight / otherSum
      }
    }
    const src = applyPicks(newState, filtered)
    addResult(result, src, weight)
    result.chance1 += src.score * dWdP1
    result.chance2 += src.score * dWdP2
  }
  return result
}

function evaluateModifier(
  state: ElixirState,
  storage: ResultStorage,
  config: OptimizerConfig
) {
  const id = state.context.modifiers[state.context.pickedSage]
  const mod = Data.modifiers[id]
  if (!mod) return blankResult

  function evaluateActions(
    state: ElixirState,
    actions: ActionDefinition[]
  ): OptimizerResult {
    if (!actions.length) {
      return evaluateTransmute(state, storage, config)
    }
    const action = actions[0]
    const otherActions = actions.slice(1)

    const func = elixirModifiers[action.type]
    if (!func) return evaluateActions(state, otherActions)
    if (func.optimizeIgnore) return blankResult
    const pickedTargets: {
      indices: number[]
      weight: number
    }[] = []
    if (action.targetType === 6) {
      pickedTargets.push({
        indices: [state.context.pickedTarget],
        weight: 1
      })
    } else {
      const targets = effectTargets(state, action).filter(
        (target) => target >= 0 && func.valid(state, target, action)
      )
      pickedTargets.push(
        ...pickOutcomes(
          targets.map(() => 1),
          Math.min(targets.length, action.targetCount)
        ).map((outcome) => ({
          indices: outcome.indices.map((i) => targets[i]),
          weight: outcome.weight
        }))
      )
    }
    normalizeWeights(pickedTargets)

    const result = { ...blankResult }
    for (const t of pickedTargets) {
      const results = func.apply(state, t.indices, action)
      normalizeWeights(results)
      for (const r of results) {
        addResult(
          result,
          evaluateActions(stateUpdateChances(r.state), otherActions),
          r.weight * t.weight
        )
      }
    }
    if (isNaN(result.score)) debugger
    return result
  }
  return evaluateActions(state, mod.actions)
}

function evaluateStep(
  state: ElixirState,
  storage: ResultStorage,
  config: OptimizerConfig
) {
  const modifiers = [0, 1, 2].map((i) => validModifiersForSlot(state, i))
  const results: {
    result: OptimizerResult
    weight: number
    slot: number
  }[] = []
  for (let slot = 0; slot < 3; ++slot) {
    const weightSum = modifiers[slot].reduce(
      (sum, id) => sum + Data.modifiers[id].weight,
      0
    )
    const newState = { ...state }
    newState.context = {
      ...state.context,
      modifiers: [],
      pickedSage: slot
    }
    newState.sages = state.sages.map((sage, index) => {
      if (sage.disabled) return sage
      sage = { ...sage }
      if (index === slot) {
        sage.order = sage.order >= 3 ? 1 : sage.order + 1
        sage.chaos = 0
      } else {
        sage.chaos = sage.chaos >= 6 ? 1 : sage.chaos + 1
        sage.order = 0
      }
      return sage
    })
    for (const id of modifiers[slot]) {
      const mod = Data.modifiers[id]
      newState.context.modifiers[slot] = id
      const targets = modifierAffectedTargets(newState)
      if (targets.pick) {
        let result = blankResult
        for (const t of targets.targets) {
          newState.context.pickedTarget = t
          const res = evaluateModifier(newState, storage, config)
          if (res.score > result.score) result = res
        }
        results.push({
          result,
          weight: mod.weight / weightSum,
          slot
        })
      } else {
        results.push({
          result: evaluateModifier(newState, storage, config),
          weight: mod.weight / weightSum,
          slot
        })
      }
    }
  }
  if (state.rerolls) {
    const newState = { ...state }
    newState.rerolls -= 1
    results.push({
      result: evaluateState(newState, storage, config),
      weight: 0,
      slot: -1
    })
  }
  results.sort((a, b) => a.result.score - b.result.score)
  const slotWeight = [0, 0, 0]
  const total = { ...blankResult }
  for (const { result, weight, slot } of results) {
    if (slot < 0) {
      Object.assign(total, blankResult)
      addResult(total, result, slotWeight[0] * slotWeight[1] * slotWeight[2])
      continue
    }
    const a = (slot + 1) % 3
    const b = (slot + 2) % 3
    addResult(total, result, weight * slotWeight[a] * slotWeight[b])
    slotWeight[slot] += weight
  }
  return total
}

function createOptimizer(config: OptimizerConfig) {
  const elixirGrade = elixirGrades[config.grade]
  const maxScore = config.score(elixirGrade.maxLevel, elixirGrade.maxLevel)
  const size = stateSize(config.grade)
  const storage = new ResultStorage(stateSize(config.grade), maxScore)

  for (let key = size - 1; key >= 0; --key) {
    const state = decodeState(key, config)
    // if (
    //   state.step === 14 &&
    //   state.effects[config.line1].points === 9 &&
    //   state.effects[config.line2].points === 10 &&
    //   !state.sages[0].disabled &&
    //   !state.sages[1].disabled &&
    //   !state.sages[2].disabled &&
    //   state.effects[2].sealed &&
    //   state.effects[3].sealed &&
    //   state.effects[4].sealed &&
    //   state.rerolls === 2
    // ) {
    //   debugger
    // }
    const score = evaluateStep(state, storage, config)
    if (isNaN(score.score)) debugger
    storage.store(key, score)

    if (!(key % 1000)) {
      console.log(`processed ${size - key} / ${size}`)
    }
  }

  return storage
}

Object.assign(
  Data,
  JSON.parse(fs.readFileSync('./public/elixir.en.json', 'utf8'))
)

const opt = createOptimizer({
  charClass: 102,
  grade: 'legendary',
  line1: 0,
  line2: 1,
  score(a, b) {
    return a >= 5 && b >= 5 ? 1 : 0
  }
})

fs.writeFileSync('optimizer.5.5.dat', Buffer.from(opt.buffer))
