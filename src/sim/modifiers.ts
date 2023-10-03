import Data from './data'
import { numberAdd, numberValue } from './number'
import { clamp0, distributions, permutations } from './random'
import { stateEffectOptions } from './sim'
import { EffectState, ElixirState, createElixir, elixirGrades } from './state'

export type ActionDefinition = {
  type: number
  targetType: number
  targetCondition: number
  targetCount: number
  ratio: number
  valueA: number
  valueB: number
  maintain: number
}

export type ElixirModifier = {
  valid: (state: ElixirState, target: number, mod: ActionDefinition) => boolean
  apply: (
    state: ElixirState,
    targets: number[],
    mod: ActionDefinition
  ) => {
    state: ElixirState
    weight: number
  }[]
}

const elixirModifiers: Record<number, ElixirModifier> = {}

function defaultValid(
  state: ElixirState,
  target: number,
  mod: ActionDefinition
) {
  const fx = state.effects[target]
  const { maxPoints } = elixirGrades[state.grade]
  return !fx.sealed && fx.points < maxPoints
}

// Modify target chance by ValueA for Maintain steps
elixirModifiers[1] = {
  valid: defaultValid,
  apply(state, targets, mod) {
    state = { ...state }
    let increase = 0
    const remain: EffectState[] = []
    let remainTotal = 0
    state.effects = state.effects.map((fx, i) => {
      if (fx.sealed) return fx
      const chance = numberValue(fx.chance)
      if (targets.includes(i)) {
        const delta = clamp0(chance + mod.valueA, 10000) - chance
        increase += delta
        return {
          ...fx,
          chance: numberAdd(fx.chance, delta, mod.maintain)
        }
      } else {
        fx = { ...fx }
        remainTotal += chance
        remain.push(fx)
        return fx
      }
    })
    for (const fx of remain) {
      const chance = numberValue(fx.chance)
      fx.chance = numberAdd(
        fx.chance,
        (-increase * chance) / remainTotal,
        mod.maintain
      )
    }
    return [{ state, weight: 1 }]
  }
}

// Modify target crit by ValueA for Maintain steps
elixirModifiers[2] = {
  valid: defaultValid,
  apply(state, targets, mod) {
    state = { ...state }
    state.effects = state.effects.map((fx, i) => {
      if (fx.sealed || !targets.includes(i)) return fx
      const critical = numberValue(fx.critical)
      const delta = clamp0(critical + mod.valueA, 10000) - critical
      return {
        ...fx,
        critical: numberAdd(fx.critical, delta, mod.maintain)
      }
    })
    return [{ state, weight: 1 }]
  }
}

// Add ValueA points to target with Ratio chance
elixirModifiers[3] = {
  valid: defaultValid,
  apply(state, targets, mod) {
    const newState = { ...state }
    newState.effects = state.effects.map((fx, i) => {
      if (fx.sealed || !targets.includes(i)) return fx
      return {
        ...fx,
        points: clamp0(
          fx.points + mod.valueA,
          elixirGrades[state.grade].maxPoints
        )
      }
    })
    return [
      { state, weight: 10000 - mod.ratio },
      { state: newState, weight: mod.ratio }
    ]
  }
}

// Add ValueA-ValueB points to target
elixirModifiers[4] = {
  valid: defaultValid,
  apply(state, targets, mod) {
    const valueMin = Math.min(mod.valueA, mod.valueB)
    const valueMax = Math.max(mod.valueA, mod.valueB)
    const deltas = [...Array(valueMax - valueMin + 1)].map(
      (_, i) => i + valueMin
    )
    return deltas.map((delta) => {
      const newState = { ...state }
      newState.effects = state.effects.map((fx, i) => {
        if (fx.sealed || !targets.includes(i)) return fx
        return {
          ...fx,
          points: clamp0(fx.points + delta, elixirGrades[state.grade].maxPoints)
        }
      })
      return {
        state: newState,
        weight: 1
      }
    })
  }
}

// Modify step counter by ValueA
elixirModifiers[5] = {
  valid: (state, target, mod) => true,
  apply(state, targets, mod) {
    state = { ...state }
    state.step += mod.valueA
    return [{ state, weight: 1 }]
  }
}

// Shuffle effect progression
elixirModifiers[6] = {
  valid(state, targets, mod) {
    const { maxPoints } = elixirGrades[state.grade]
    return state.effects.some((fx) => !fx.sealed && fx.points < maxPoints)
  },
  apply(state, targets, mod) {
    const { maxPoints } = elixirGrades[state.grade]
    const points = state.effects
      .filter((fx) => !fx.sealed && fx.points < maxPoints)
      .map((fx) => fx.points)
    return [...permutations(points)].map((points) => {
      const newState = { ...state }
      newState.effects = state.effects.map((fx) => {
        if (fx.sealed || fx.points >= maxPoints) return fx
        return { ...fx, points: points.shift()! }
      })
      return { state: newState, weight: 1 }
    })
  }
}

// Add ValueA points to target (replace step action)
elixirModifiers[7] = {
  valid: defaultValid,
  apply(state, targets, mod) {
    state = { ...state }
    state.context = {
      ...state.context,
      effectPool: targets,
      effectsModified: targets.length,
      pointsAdded: mod.valueA
    }
    return [{ state, weight: 1 }]
  }
}

// Unseal random effect, seal random effect
elixirModifiers[8] = {
  valid: (state, target, mod) => state.effects.some((fx) => fx.sealed),
  apply(state, targets, mod) {
    const sealedIndices: number[] = []
    const unsealedIndices: number[] = []
    state.effects.forEach((fx, index) => {
      if (fx.sealed) sealedIndices.push(index)
      else unsealedIndices.push(index)
    })
    return sealedIndices.flatMap((unsealIndex) =>
      unsealedIndices.map((sealIndex) => {
        const newState = { ...state }
        newState.effects = state.effects.slice()
        newState.effects[unsealIndex] = {
          ...state.effects[unsealIndex],
          chance: state.effects[sealIndex].chance,
          sealed: false
        }
        newState.effects[sealIndex] = {
          ...state.effects[sealIndex],
          chance: state.effects[unsealIndex].chance,
          sealed: true
        }
        return {
          state: newState,
          weight: 1
        }
      })
    )
  }
}

// Modify target effect
elixirModifiers[9] = {
  valid: (state, target, mod) => true,
  apply(state, targets, mod) {
    state = { ...state }
    state.effects = state.effects.slice()
    const effect = state.effects.splice(targets[0], 1)[0]
    const options = stateEffectOptions(state)
    return options.map((id) => {
      const newState = { ...state }
      newState.effects = state.effects.slice()
      newState.effects.splice(targets[0], 0, {
        ...effect,
        id
      })
      return { state: newState, weight: Data.effects[id].weight }
    })
  }
}

// Seal target
elixirModifiers[10] = {
  valid(state, target, mod) {
    if (state.effects[target].sealed) return false
    const unsealed = state.effects.filter((fx) => !fx.sealed)
    return unsealed.length > 2
  },
  apply(state, targets, mod) {
    state = { ...state }
    state.effects = state.effects.slice()
    for (const index of targets) {
      state.effects[index] = { ...state.effects[index], sealed: true }
    }
    return [{ state, weight: 1 }]
  }
}

// Add ValueA rerolls
elixirModifiers[11] = {
  valid: (state, target, mod) => true,
  apply(state, targets, mod) {
    state = {
      ...state,
      rerolls: state.rerolls + mod.valueA
    }
    return [{ state, weight: 1 }]
  }
}

// Modify gold cost for Maintain steps
elixirModifiers[12] = {
  valid: (state, target, mod) => true,
  apply(state, targets, mod) {
    state = { ...state }
    state.goldModifier = numberAdd(state.goldModifier, mod.valueA, mod.maintain)
    return [{ state, weight: 1 }]
  }
}

// Reset elixir
elixirModifiers[13] = {
  valid: (state, target, mod) => true,
  apply(state, targets, mod) {
    return [{ state: createElixir(state.grade, state.charClass), weight: 1 }]
  }
}

// Points added per step
elixirModifiers[14] = {
  valid: (state, target, mod) => true,
  apply(state, targets, mod) {
    state = { ...state }
    state.context = {
      ...state.context,
      pointsAdded: mod.valueA
    }
    return [{ state, weight: 1 }]
  }
}

// Effects modified per step
elixirModifiers[15] = {
  valid: (state, target, mod) => true,
  apply(state, targets, mod) {
    state = { ...state }
    state.context = {
      ...state.context,
      effectsModified: mod.valueA
    }
    return [{ state, weight: 1 }]
  }
}

// Replace points of target by ValueA-ValueB
elixirModifiers[16] = {
  valid(state, target, mod) {
    const fx = state.effects[target]
    return !fx.sealed && fx.points < mod.valueB
  },
  apply(state, targets, mod) {
    const valueMin = Math.min(mod.valueA, mod.valueB)
    const valueMax = Math.max(mod.valueA, mod.valueB)
    const points = [...Array(valueMax - valueMin + 1)].map(
      (_, i) => i + valueMin
    )
    return points.map((points) => {
      const newState = { ...state }
      newState.effects = state.effects.map((fx, i) => {
        if (fx.sealed || !targets.includes(i)) return fx
        return {
          ...fx,
          points: clamp0(points, elixirGrades[state.grade].maxPoints)
        }
      })
      return {
        state: newState,
        weight: 1
      }
    })
  }
}

// Shuffle points between effects
elixirModifiers[17] = {
  valid(state, target, mod) {
    const { maxPoints } = elixirGrades[state.grade]
    return state.effects.some((fx) => !fx.sealed && fx.points < maxPoints)
  },
  apply(state, targets, mod) {
    const { maxPoints } = elixirGrades[state.grade]
    const effects = state.effects.filter(
      (fx) => !fx.sealed && fx.points < maxPoints
    )
    const total = effects.reduce((sum, fx) => sum + fx.points, 0)
    const points = distributions(
      total,
      effects.map(() => maxPoints)
    )
    const newState = { ...state }
    newState.effects = state.effects.map((fx) => {
      if (fx.sealed || fx.points >= maxPoints) return fx
      return { ...fx, points: points.shift()! }
    })
    return [{ state: newState, weight: 1 }]
  }
}

// Remove points from target and distribute between other effects
elixirModifiers[18] = {
  valid(state, target, mod) {
    const { maxPoints } = elixirGrades[state.grade]
    const fx = state.effects[target]
    return !fx.sealed && fx.points > 0 && fx.points < maxPoints
  },
  apply(state, targets, mod) {
    const { maxPoints } = elixirGrades[state.grade]
    const dest: EffectState[] = []
    let total = 0
    const newState = { ...state }
    newState.effects = state.effects.map((fx, i) => {
      if (fx.sealed || fx.points >= maxPoints) return fx
      if (targets.includes(i)) {
        total += fx.points
        return { ...fx, points: 0 }
      } else {
        fx = { ...fx }
        dest.push(fx)
        return fx
      }
    })
    const points = distributions(
      total,
      dest.map((fx) => maxPoints - fx.points)
    )
    dest.forEach((fx, i) => (fx.points += points[i]))
    return [{ state: newState, weight: 1 }]
  }
}

// Move effect progress 1 row up or down (ValueA=1 => down)
elixirModifiers[19] = {
  valid(state, target, mod) {
    const { maxPoints } = elixirGrades[state.grade]
    return state.effects.every((fx) => !fx.sealed && fx.points < maxPoints)
  },
  apply(state, targets, mod) {
    const newState = { ...state }
    newState.effects = state.effects.map((fx, i) => {
      const index =
        (i + state.effects.length + (mod.valueA ? -1 : 1)) %
        state.effects.length
      return { ...fx, points: state.effects[index].points }
    })
    return [{ state: newState, weight: 1 }]
  }
}

// Swap points of effect #ValueA and #ValueB
elixirModifiers[20] = {
  valid(state, target, mod) {
    const fxA = state.effects[mod.valueA]
    const fxB = state.effects[mod.valueB]
    if (fxA.sealed) return false
    if (fxB.sealed) return false
    return fxA.points !== fxB.points
  },
  apply(state, targets, mod) {
    const newState = { ...state }
    newState.effects = state.effects.slice()
    newState.effects[mod.valueA] = {
      ...state.effects[mod.valueA],
      points: state.effects[mod.valueB].points
    }
    newState.effects[mod.valueB] = {
      ...state.effects[mod.valueB],
      points: state.effects[mod.valueA].points
    }
    return [{ state: newState, weight: 1 }]
  }
}

function effectsWithPoints(effects: EffectState[], points: number) {
  const result: number[] = []
  effects.forEach((fx, i) => {
    if (fx.points === points) result.push(i)
  })
  return result
}

// Swap points of highest and lowest effects
elixirModifiers[23] = {
  valid(state, target, mod) {
    const { maxPoints } = elixirGrades[state.grade]
    const points = state.effects
      .filter((fx) => !fx.sealed)
      .map((fx) => fx.points)
    const minValue = Math.min(...points)
    const maxValue = Math.max(...points)
    return minValue !== maxValue && maxValue < maxPoints
  },
  apply(state, targets, mod) {
    const points = state.effects
      .filter((fx) => !fx.sealed)
      .map((fx) => fx.points)
    const minValue = Math.min(...points)
    const maxValue = Math.max(...points)
    const minIndices = effectsWithPoints(state.effects, minValue)
    const maxIndices = effectsWithPoints(state.effects, maxValue)
    return minIndices.flatMap((minIndex) =>
      maxIndices.map((maxIndex) => {
        const newState = { ...state }
        newState.effects = state.effects.slice()
        newState.effects[minIndex] = {
          ...state.effects[minIndex],
          points: state.effects[maxIndex].points
        }
        newState.effects[maxIndex] = {
          ...state.effects[maxIndex],
          points: state.effects[minIndex].points
        }
        return { state: newState, weight: 1 }
      })
    )
  }
}

// Disable sage #ValueA
elixirModifiers[24] = {
  valid: (state, target, mod) => true,
  apply(state, targets, mod) {
    state = { ...state }
    state.sages = state.sages.slice()
    state.sages[mod.valueA - 1] = {
      disabled: true,
      order: 0,
      chaos: 0
    }
    return [{ state, weight: 1 }]
  }
}

// Highest effect +ValueA; target effect +ValueB [if target exists]
elixirModifiers[25] = {
  valid(state, target, mod) {
    const { maxPoints } = elixirGrades[state.grade]
    const points = state.effects
      .filter((fx) => !fx.sealed)
      .map((fx) => fx.points)
    const maxValue = Math.max(...points)
    if (target >= 0) {
      const fx = state.effects[target]
      return maxValue < maxPoints && !fx.sealed && fx.points !== maxValue
    } else {
      return maxValue < maxPoints
    }
  },
  apply(state, targets, mod) {
    const { maxPoints } = elixirGrades[state.grade]
    const points = state.effects
      .filter((fx) => !fx.sealed)
      .map((fx) => fx.points)
    const maxValue = Math.max(...points)
    const maxIndices = effectsWithPoints(state.effects, maxValue)
    return maxIndices.map((index) => {
      const newState = { ...state }
      newState.effects = state.effects.slice()
      newState.effects[index] = {
        ...state.effects[index],
        points: clamp0(state.effects[index].points + mod.valueA, maxPoints)
      }
      for (const i of targets) {
        newState.effects[i] = {
          ...state.effects[i],
          points: clamp0(state.effects[i].points + mod.valueB, maxPoints)
        }
      }
      return { state: newState, weight: 1 }
    })
  }
}

// Lowest effect +ValueA; target effect +ValueB [if target exists]
elixirModifiers[26] = {
  valid(state, target, mod) {
    const { maxPoints } = elixirGrades[state.grade]
    const points = state.effects
      .filter((fx) => !fx.sealed)
      .map((fx) => fx.points)
    const minValue = Math.min(...points)
    if (target >= 0) {
      const fx = state.effects[target]
      return !fx.sealed && fx.points < maxPoints && fx.points !== minValue
    } else {
      return minValue < maxPoints
    }
  },
  apply(state, targets, mod) {
    const { maxPoints } = elixirGrades[state.grade]
    const points = state.effects
      .filter((fx) => !fx.sealed)
      .map((fx) => fx.points)
    const minValue = Math.min(...points)
    const minIndices = effectsWithPoints(state.effects, minValue)
    return minIndices.map((index) => {
      const newState = { ...state }
      newState.effects = state.effects.slice()
      newState.effects[index] = {
        ...state.effects[index],
        points: clamp0(state.effects[index].points + mod.valueA, maxPoints)
      }
      for (const i of targets) {
        newState.effects[i] = {
          ...state.effects[i],
          points: clamp0(state.effects[i].points + mod.valueB, maxPoints)
        }
      }
      return { state: newState, weight: 1 }
    })
  }
}

// Remove points from lowest effect and distribute between other effects
elixirModifiers[27] = {
  valid(state, target, mod) {
    const { maxPoints } = elixirGrades[state.grade]
    const points = state.effects
      .filter((fx) => !fx.sealed)
      .map((fx) => fx.points)
    const minValue = Math.min(...points)
    return minValue > 0 && minValue < maxPoints
  },
  apply(state, targets, mod) {
    const points = state.effects
      .filter((fx) => !fx.sealed)
      .map((fx) => fx.points)
    const minValue = Math.min(...points)
    const minIndices = effectsWithPoints(state.effects, minValue)
    return minIndices.flatMap((index) => {
      return elixirModifiers[18].apply(state, [index], mod)
    })
  }
}

// Remove points from highest effect and distribute between other effects
elixirModifiers[28] = {
  valid(state, target, mod) {
    const { maxPoints } = elixirGrades[state.grade]
    const points = state.effects
      .filter((fx) => !fx.sealed)
      .map((fx) => fx.points)
    const maxValue = Math.max(...points)
    return maxValue > 0 && maxValue < maxPoints
  },
  apply(state, targets, mod) {
    const points = state.effects
      .filter((fx) => !fx.sealed)
      .map((fx) => fx.points)
    const maxValue = Math.max(...points)
    const maxIndices = effectsWithPoints(state.effects, maxValue)
    return maxIndices.flatMap((index) => {
      return elixirModifiers[18].apply(state, [index], mod)
    })
  }
}

// Highest effect -1, swap with lowest effect
elixirModifiers[29] = {
  valid(state, target, mod) {
    const { maxPoints } = elixirGrades[state.grade]
    const points = state.effects
      .filter((fx) => !fx.sealed)
      .map((fx) => fx.points)
    const minValue = Math.min(...points)
    const maxValue = Math.max(...points)
    return minValue < maxValue - 1 && maxValue < maxPoints
  },
  apply(state, targets, mod) {
    const points = state.effects
      .filter((fx) => !fx.sealed)
      .map((fx) => fx.points)
    const minValue = Math.min(...points)
    const maxValue = Math.max(...points)
    const minIndices = effectsWithPoints(state.effects, minValue)
    const maxIndices = effectsWithPoints(state.effects, maxValue)
    return minIndices.flatMap((minIndex) =>
      maxIndices.map((maxIndex) => {
        const newState = { ...state }
        newState.effects = state.effects.slice()
        newState.effects[minIndex] = {
          ...state.effects[minIndex],
          points: Math.max(0, state.effects[maxIndex].points - 1)
        }
        newState.effects[maxIndex] = {
          ...state.effects[maxIndex],
          points: state.effects[minIndex].points
        }
        return { state: newState, weight: 1 }
      })
    )
  }
}

// Effect #ValueA -1, swap with effect #ValueB
elixirModifiers[30] = {
  valid(state, target, mod) {
    const { maxPoints } = elixirGrades[state.grade]
    const points = state.effects
      .filter((fx) => !fx.sealed)
      .map((fx) => fx.points)
    const maxValue = Math.max(...points)
    const fxA = state.effects[mod.valueA]
    const fxB = state.effects[mod.valueB]
    return (
      !fxA.sealed &&
      !fxB.sealed &&
      fxA.points === maxValue &&
      fxB.points < fxA.points - 1 &&
      maxValue < maxPoints
    )
  },
  apply(state, targets, mod) {
    const newState = { ...state }
    newState.effects = state.effects.slice()
    newState.effects[mod.valueB] = {
      ...state.effects[mod.valueB],
      points: Math.max(0, state.effects[mod.valueA].points - 1)
    }
    newState.effects[mod.valueA] = {
      ...state.effects[mod.valueA],
      points: state.effects[mod.valueB].points
    }
    return [{ state: newState, weight: 1 }]
  }
}

export { elixirModifiers }
