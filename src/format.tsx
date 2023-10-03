import React, { ReactNode } from 'react'

type FormatCallback = (idx: number, fallback: string) => string
export function format(str: string, ...args: string[] | [FormatCallback]) {
  const getter: FormatCallback =
    typeof args[0] === 'function'
      ? args[0]
      : (idx: number, fallback: string) =>
          idx in args ? (args[idx] as string) : fallback

  return str.replace(
    /{(\d+)(?::(.*?))?}(?:\|plural\((.*?)\))?/g,
    (m, idx, options, plural) => {
      const value = getter(parseInt(idx), m)
      if (plural) {
        const args = plural.split(',')
        return parseInt(value) > 1 ? args[1] : args[0]
      } else if (options) {
        return options.split('|')[parseInt(value) - 1]
      }
      return value
    }
  )
}

export function keyedList(list: ReactNode[]): ReactNode[] {
  return list.map((value, key) => {
    if (React.isValidElement(value)) {
      return React.cloneElement(value, { key })
    } else {
      return value
    }
  })
}

type StringCallback = (text: string) => ReactNode
type FormatReactCallback = (idx: number) => ReactNode

export function formatReact(
  str: string,
  ...args: ReactNode[] | [FormatReactCallback]
): ReactNode[] {
  const getter: FormatReactCallback =
    typeof args[0] === 'function'
      ? args[0]
      : (idx: number) => args[idx] as ReactNode

  return keyedList(
    str.split(/({\d+(?::.*?)?}(?:\|plural\(.*?\))?)/).map((piece) => {
      const m = piece.match(/^{(\d+)(?::(.*?))?}(?:\|plural\((.*)\))?$/)
      if (!m) return piece
      const value = getter(parseInt(m[1]))
      const numeric =
        typeof value === 'string' || typeof value === 'number'
          ? Number(value)
          : 1
      if (m[3]) {
        const args = m[3].split(',')
        return numeric > 1 ? args[1] : args[0]
      } else if (m[2]) {
        return m[2].split('|')[numeric - 1]
      }
      return value
    })
  )
}

export function replaceHtml(
  text: string,
  Element: React.ComponentType<{
    tag: string
    attributes: Record<string, string>
    children: ReactNode
  }>,
  textFunc: StringCallback
) {
  type StackEntry = {
    tag: string
    attributes: Record<string, string>
    children: ReactNode[]
  }

  const stack: StackEntry[] = [
    {
      tag: '',
      attributes: {},
      children: []
    }
  ]
  function pop() {
    const top = stack.pop()!
    const elem = (
      <Element
        tag={top.tag}
        attributes={top.attributes}
        children={keyedList(top.children)}
      />
    )
    stack[stack.length - 1].children.push(elem)
  }
  for (const part of text.split(/(<[^>]*>)/)) {
    let m
    if ((m = part.match(/^<(\w+)(?:\s(.*)|=(.*))?>$/))) {
      const entry: StackEntry = {
        tag: m[1].toLowerCase(),
        attributes: {},
        children: []
      }
      for (const [, key, value] of m[2]?.matchAll(
        /(\w+)\s*=\s*['"](.*?)['"]/g
      ) || []) {
        entry.attributes[key.toLowerCase()] = value
      }
      if (m[3]) entry.attributes.argument = m[3]
      stack.push(entry)
      if (entry.tag === 'br') {
        pop()
      }
    } else if ((m = part.match(/^<\/(\w+)\s*>$/))) {
      const tag = m[1].toLowerCase()
      while (stack.length > 1 && stack[stack.length - 1].tag !== tag) {
        pop()
      }
      if (stack.length > 1) {
        pop()
      }
    } else if (part) {
      stack[stack.length - 1].children.push(textFunc ? textFunc(part) : part)
    }
  }
  while (stack.length > 1) {
    pop()
  }
  return keyedList(stack[0].children)
}

export function replaceReact(
  text: string,
  regex: RegExp,
  func: (substring: string, ...args: any[]) => ReactNode,
  textFunc?: StringCallback
) {
  const result: ReactNode[] = []
  function add(element: any) {
    if (React.isValidElement(element)) {
      result.push(React.cloneElement(element, { key: result.length }))
    } else if (element != null) {
      result.push(element)
    }
  }
  textFunc = textFunc || ((text) => text)
  let prev = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(text))) {
    if (match.index > prev) {
      result.push(textFunc(text.substring(prev, match.index)))
    }
    const element = func(
      match[0],
      ...match.slice(1),
      match.index,
      text,
      match.groups
    )
    if (Array.isArray(element)) {
      for (const e of element) {
        add(e)
      }
    } else {
      add(element)
    }
    prev = match.index + match[0].length
    if (!regex.global && !regex.sticky) break
  }
  if (prev < text.length) {
    result.push(textFunc(text.substring(prev)))
  }
  return result
}

export function formatHtml(
  text: string,
  ...args: ReactNode[] | [FormatReactCallback]
) {
  if (!text) return null
  function replaceArgs(text: string) {
    return formatReact(text, ...args)
  }
  function replaceBreaks(text: string) {
    return replaceReact(
      text,
      /\n|&nbsp;/g,
      (txt) => {
        if (txt === '\n') return <br />
        if (txt === '&nbsp;') return '\u00a0'
      },
      replaceArgs
    )
  }

  function TagElement({
    tag,
    attributes,
    children
  }: {
    tag: string
    attributes: Record<string, string>
    children: ReactNode
  }) {
    if (tag === 'font') {
      const attr: React.CSSProperties = {}
      if (attributes.color) {
        attr.color = attributes.color.replace(
          /#\w{2}(\w{6})/,
          (m, c) => `#${c}`
        )
      }
      return <span style={attr}>{children}</span>
    } else if (tag === 'br') {
      return <br />
    } else {
      return <>{children}</>
    }
  }
  return replaceHtml(text, TagElement, replaceBreaks)
}
