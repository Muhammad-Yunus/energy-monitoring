export default defineNuxtRouteMiddleware(async (to) => {
  const { user, fetchUser } = useAuth()

  if (!user.value) {
    await fetchUser()
  }

  if (to.path === '/login') {
    if (user.value) {
      return navigateTo('/')
    }
    return
  }

  if (!user.value) {
    return navigateTo('/login')
  }
})
