export interface AuthUser {
  id: string
  email: string
  name: string
  role: string
}

export function useAuth() {
  const user = useState<AuthUser | null>('auth-user', () => null)
  const requestFetch = useRequestFetch()

  async function fetchUser() {
    try {
      user.value = await requestFetch<AuthUser>('/api/auth/me')
    }
    catch {
      user.value = null
    }
    return user.value
  }

  async function login(email: string, password: string) {
    user.value = await $fetch<AuthUser>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    return user.value
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    user.value = null
    await navigateTo('/login')
  }

  return { user, fetchUser, login, logout }
}
