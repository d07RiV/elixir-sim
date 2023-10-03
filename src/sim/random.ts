export const clamp0 = (value: number, max: number) =>
  Math.min(max, Math.max(0, value))

export function weighedRandom(weights: number[]) {
  const total = weights.reduce((sum, v) => sum + v, 0)
  let pick = Math.random() * total
  for (let i = 0; i < weights.length; ++i) {
    pick -= weights[i]
    if (pick < 0) return i
  }
  return 0
}

export function pickRandom<T extends unknown>(values: T[]) {
  return values[Math.floor(Math.random() * values.length)]
}

export function* permutations<T extends unknown>(list: T[]) {
  function* subperm(list: T[], prefix: T[]): Generator<T[]> {
    if (list.length <= 1) {
      yield [...prefix, ...list]
    } else {
      for (let i = 0; i < list.length; ++i) {
        const next = list.slice()
        next.splice(i, 1)
        yield* subperm(next, [...prefix, list[i]])
      }
    }
  }
  yield* subperm(list, [])
}

export function distributions(points: number, buckets: number[]) {
  const result: number[] = buckets.map(() => 0)
  for (let i = 0; i < points; ++i) {
    const indices: number[] = []
    result.forEach((v, i) => {
      if (v < buckets[i]) indices.push(i)
    })
    const index = pickRandom(indices)
    result[index] += 1
  }
  return result
}
