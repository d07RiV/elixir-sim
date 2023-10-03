export type MutableNumber = {
  base: number
  modifiers: {
    value: number
    steps: number
  }[]
}

export const numberCreate = (value: number): MutableNumber => ({
  base: value,
  modifiers: []
})

export const numberValue = (number: MutableNumber) =>
  number.modifiers.reduce((sum, mod) => sum + mod.value, number.base)

export function numberAdd(
  number: MutableNumber,
  value: number,
  steps?: number
): MutableNumber {
  if (steps === 0 || !value) {
    return number
  } else if (steps === undefined || steps >= 99) {
    return { base: number.base + value, modifiers: number.modifiers }
  } else {
    return {
      base: number.base,
      modifiers: [...number.modifiers, { value, steps }]
    }
  }
}

export function numberAdvance(number: MutableNumber): MutableNumber {
  if (!number.modifiers.length) return number
  const result: MutableNumber = {
    base: number.base,
    modifiers: []
  }
  for (const mod of number.modifiers) {
    if (mod.steps > 1) {
      result.modifiers.push({
        value: mod.value,
        steps: mod.steps - 1
      })
    }
  }
  return result
}
