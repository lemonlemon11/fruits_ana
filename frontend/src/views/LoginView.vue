<script setup lang="ts">
import Eye from '@lucide/vue/dist/esm/icons/eye.mjs'
import EyeOff from '@lucide/vue/dist/esm/icons/eye-off.mjs'
import { computed, reactive, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import { login } from '../api/client'
import { safeRedirect, setCurrentUser } from '../auth'
import AuthPortal from '../components/AuthPortal.vue'

const route = useRoute()
const router = useRouter()
const form = reactive({ displayName: '', password: '', rememberMe: false })
const errors = reactive({ displayName: '', password: '' })
const submitting = ref(false)
const passwordVisible = ref(false)
const error = ref('')

const registerLink = computed(() => ({
  path: '/register',
  query: route.query.redirect ? { redirect: route.query.redirect } : {},
}))

function validate(): boolean {
  errors.displayName = form.displayName ? '' : '请输入用户名'
  errors.password = form.password ? '' : '请输入密码'
  return !errors.displayName && !errors.password
}

async function submit() {
  error.value = ''
  if (!validate()) return
  submitting.value = true
  try {
    setCurrentUser(await login(form))
    await router.replace(safeRedirect(route.query.redirect))
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '登录失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthPortal>
    <form class="auth-form" novalidate @submit.prevent="submit">
      <header>
        <h2>欢迎回来</h2>
        <p>登录账号，继续查看你的水果经营数据。</p>
      </header>
      <div class="auth-field">
        <label for="login-username">用户名</label>
        <div class="auth-input">
          <input
            id="login-username"
            v-model.trim="form.displayName"
            type="text"
            autocomplete="username"
            maxlength="80"
            :aria-invalid="Boolean(errors.displayName)"
            :aria-describedby="errors.displayName ? 'login-username-error' : undefined"
            autofocus
          />
        </div>
        <small v-if="errors.displayName" id="login-username-error" class="field-error">{{ errors.displayName }}</small>
      </div>
      <div class="auth-field">
        <label for="login-password">密码</label>
        <div class="auth-input has-toggle">
          <input
            id="login-password"
            v-model="form.password"
            :type="passwordVisible ? 'text' : 'password'"
            autocomplete="current-password"
            :aria-invalid="Boolean(errors.password)"
            :aria-describedby="errors.password ? 'login-password-error' : undefined"
          />
          <button
            class="password-toggle"
            type="button"
            :aria-label="passwordVisible ? '隐藏密码' : '显示密码'"
            :aria-pressed="passwordVisible"
            @click="passwordVisible = !passwordVisible"
          >
            <EyeOff v-if="passwordVisible" :size="18" aria-hidden="true" />
            <Eye v-else :size="18" aria-hidden="true" />
          </button>
        </div>
        <small v-if="errors.password" id="login-password-error" class="field-error">{{ errors.password }}</small>
      </div>
      <label class="auth-remember">
        <input v-model="form.rememberMe" type="checkbox" :disabled="submitting">
        <span>30 天内免登录</span>
      </label>
      <p v-if="error" class="form-message error" role="alert">{{ error }}</p>
      <button class="primary-button auth-submit" type="submit" :disabled="submitting">
        {{ submitting ? '正在登录' : '登录经营台' }}
      </button>
      <p class="auth-switch">还没有账号？<RouterLink :to="registerLink">创建账号</RouterLink></p>
      <p class="auth-note">经营数据仅对本人可见，请妥善保管账号。</p>
    </form>
  </AuthPortal>
</template>
