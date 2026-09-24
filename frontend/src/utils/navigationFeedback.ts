export const NAVIGATION_START_EVENT = 'fruit-ana:navigation-start'
export const NAVIGATION_END_EVENT = 'fruit-ana:navigation-end'

export function reportNavigationStart(path: string, target: EventTarget = window): void {
  target.dispatchEvent(new CustomEvent(NAVIGATION_START_EVENT, { detail: { path } }))
}

export function reportNavigationEnd(target: EventTarget = window): void {
  target.dispatchEvent(new CustomEvent(NAVIGATION_END_EVENT))
}
