export function getStoredValue(
  key: string,
  defaultValue?: any,
  session = false
) {
  try {
    const item = (
      session ? window.sessionStorage : window.localStorage
    ).getItem(key)
    return item != null
      ? JSON.parse(item)
      : typeof defaultValue === 'function'
      ? defaultValue()
      : defaultValue
  } catch (error) {
    console.error(error)
    return typeof defaultValue === 'function' ? defaultValue() : defaultValue
  }
}

export function removedStoredValue(key: string, session = false) {
  try {
    ;(session ? window.sessionStorage : window.localStorage).removeItem(key)
  } catch (error) {
    console.error(error)
  }
}

export function setStoredValue(key: string, value: any, session = false) {
  try {
    ;(session ? window.sessionStorage : window.localStorage).setItem(
      key,
      JSON.stringify(value)
    )
  } catch (error) {
    console.error(error)
  }
}
