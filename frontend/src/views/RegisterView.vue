<script setup lang="ts">
import Eye from '@lucide/vue/dist/esm/icons/eye.mjs'
import EyeOff from '@lucide/vue/dist/esm/icons/eye-off.mjs'
import { computed, reactive, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import { register } from '../api/client'
import { safeRedirect, setCurrentUser } from '../auth'
import AuthPortal from '../components/AuthPortal.vue'

const MIN_PASSWORD_LENGTH = 8

const route = useRoute()
const router = useRouter()
const form = reactive({ displayName: '', password: '', confirmation: '' })
const errors = reactive({ displayName: '', password: '', confirmation: '' })
const submitting = ref(false)
const passwordVisible = ref(false)
const error = ref('')

const loginLink = computed(() => ({
  path: '/login',
  query: route.query.redirect ? { redirect: route.query.redirect } : {},
}))

function validate(): boolean {
  errors.displayName = form.displayName ? '' : '请输入用户名'
  errors.confirmation = form.confirmation ? '' : '请再次输入密码'
  if (!form.password) errors.password = '请输入密码'
  else if (form.password.length < MIN_PASSWORD_LENGTH) errors.password = `密码至少 ${MIN_PASSWORD_LENGTH} 位`
  else errors.password = ''
  if (form.confirmation && form.password !== form.confirmation) errors.confirmation = '两次输入的密码不一致'
  return !errors.displayName && !errors.password && !errors.confirmation
}

async function submit() {
  error.value = ''
  if (!validate()) return
  submitting.value = true
  try {
    setCurrentUser(await register(form))
    await router.replace(safeRedirect(route.query.redirect))
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '注册失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthPortal>
    <form class="auth-form" novalidate @submit.prevent="submit">
      <header>
        <h2>创建账号</h2>
        <p>填写用户名和密码，即可进入 SLD-水果市场销售分析。</p>
      </header>
      <div class="auth-field">
        <label for="register-username">用户名</label>
        <div class="auth-input">
          <input
            id="register-username"
            v-model.trim="form.displayName"
            type="text"
            autocomplete="username"
            maxlength="80"
            :aria-invalid="Boolean(errors.displayName)"
            :aria-describedby="errors.displayName ? 'register-username-error' : undefined"
            autofocus
          />
        </div>
        <small v-if="errors.displayName" id="register-username-error" class="field-error">{{ errors.displayName }}</small>
      </div>
      <div class="auth-field">
        <label for="register-password">密码</label>
        <div class="auth-input has-toggle">
          <input
            id="register-password"
            v-model="form.password"
            :type="passwordVisible ? 'text' : 'password'"
            autocomplete="new-password"
            :aria-invalid="Boolean(errors.password)"
            :aria-describedby="errors.password ? 'register-password-error' : 'register-password-hint'"
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
        <small v-if="errors.password" id="register-password-error" class="field-error">{{ errors.password }}</small>
        <small v-else id="register-password-hint" class="field-hint">至少输入 8 位字符</small>
      </div>
      <div class="auth-field">
        <label for="register-confirmation">再次输入密码</label>
        <div class="auth-input">
          <input
            id="register-confirmation"
            v-model="form.confirmation"
            :type="passwordVisible ? 'text' : 'password'"
            autocomplete="new-password"
            :aria-invalid="Boolean(errors.confirmation)"
            :aria-describedby="errors.confirmation ? 'register-confirmation-error' : undefined"
          />
        </div>
        <small v-if="errors.confirmation" id="register-confirmation-error" class="field-error">{{ errors.confirmation }}</small>
      </div>
      <p v-if="error" class="form-message error" role="alert">{{ error }}</p>
      <button class="primary-button auth-submit" type="submit" :disabled="submitting">
        {{ submitting ? '正在创建' : '创建账号' }}
      </button>
      <p class="auth-switch">已有账号？<RouterLink :to="loginLink">返回登录</RouterLink></p>
      <p class="auth-note">密码仅保存加密结果，经营数据仅对本人可见。</p>
    </form>
  </AuthPortal>
</template>
