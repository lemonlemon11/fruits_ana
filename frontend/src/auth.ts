import { ref } from 'vue'

import { ApiError, getCurrentUser, type AuthUser } from './api/client'

export const currentUser = ref<AuthUser | null>(null)
export const authReady = ref(false)

let restorePromise: Promise<AuthUser | null> | null = null

export function setCurrentUser(user: AuthUser | null): void {
  currentUser.value = user
  authReady.value = true
}

export function restoreSession(): Promise<AuthUser | null> {
  if (authReady.value) return Promise.resolve(currentUser.value)
  if (restorePromise) return restorePromise
  restorePromise = getCurrentUser()
    .then((user) => {
      setCurrentUser(user)
      return user
    })
    .catch((error: unknown) => {
      if (!(error instanceof ApiError) || error.status !== 401) throw error
      setCurrentUser(null)
      return null
    })
    .finally(() => { restorePromise = null })
  return restorePromise
}

export function safeRedirect(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/overview'
}
