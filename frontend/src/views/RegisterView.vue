<script setup lang="ts">
import Eye from '@lucide/vue/dist/esm/icons/eye.mjs'
import EyeOff from '@lucide/vue/dist/esm/icons/eye-off.mjs'
import { computed, reactive, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import { register, sendCode } from '../api/client'
import { safeRedirect, setCurrentUser } from '../auth'
import AuthPortal from '../components/AuthPortal.vue'

const MIN_PASSWORD_LENGTH = 8
const CODE_COOLDOWN_SECONDS = 60

const route = useRoute()
const router = useRouter()

interface RegisterForm {
  displayName: string
  password: string
  confirmation: string
  email: string
  verificationCode: string
}

const form = reactive<RegisterForm>({
  displayName: '',
  password: '',
  confirmation: '',
  email: '',
  verificationCode: '',
})

interface FieldErrors {
  displayName: string
  password: string
  confirmation: string
  email: string
  verificationCode: string
}

const errors = reactive<FieldErrors>({
  displayName: '',
  password: '',
  confirmation: '',
  email: '',
  verificationCode: '',
})

const submitting = ref(false)
const passwordVisible = ref(false)
const error = ref('')

// 验证码发送状态
const codeSent = ref(false)
const sendingCode = ref(false)
const cooldownSeconds = ref(0)
const codeHint = ref('')

const loginLink = computed(() => ({
  path: '/login',
  query: route.query.redirect ? { redirect: route.query.redirect } : {},
}))

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function validate(): boolean {
  errors.displayName = form.displayName ? '' : '请输入用户名'
  errors.confirmation = form.confirmation ? '' : '请再次输入密码'
  if (!form.password) errors.password = '请输入密码'
  else if (form.password.length < MIN_PASSWORD_LENGTH) errors.password = `密码至少 ${MIN_PASSWORD_LENGTH} 位`
  else errors.password = ''
  if (form.confirmation && form.password !== form.confirmation) errors.confirmation = '两次输入的密码不一致'

  if (!form.email) errors.email = '请输入邮箱'
  else if (!validateEmail(form.email)) errors.email = '邮箱格式不正确'
  else errors.email = ''

  if (!codeSent.value) errors.verificationCode = '请先发送验证码'
  else if (!form.verificationCode) errors.verificationCode = '请输入验证码'
  else errors.verificationCode = ''

  return !errors.displayName && !errors.password && !errors.confirmation && !errors.email && !errors.verificationCode
}

async function handleSendCode() {
  if (!form.email) {
    errors.email = '请先输入邮箱'
    return
  }
  if (!validateEmail(form.email)) {
    errors.email = '邮箱格式不正确'
    return
  }
  errors.email = ''

  sendingCode.value = true
  codeHint.value = ''
  try {
    await sendCode(form.email)
    codeSent.value = true
    codeHint.value = `验证码已发送至 ${form.email}，如未收到请检查垃圾邮箱`
    // 开始 60 秒倒计时
    cooldownSeconds.value = CODE_COOLDOWN_SECONDS
    const timer = setInterval(() => {
      cooldownSeconds.value--
      if (cooldownSeconds.value <= 0) {
        clearInterval(timer)
      }
    }, 1000)
  } catch (caught) {
    codeHint.value = caught instanceof Error ? caught.message : '发送失败，请稍后重试'
  } finally {
    sendingCode.value = false
  }
}

async function submit() {
  error.value = ''
  if (!validate()) return
  submitting.value = true
  try {
    setCurrentUser(await register({
      displayName: form.displayName,
      password: form.password,
      email: form.email,
      verificationCode: form.verificationCode,
    }))
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
        <p>填写信息并验证邮箱，即可进入 SLD-水果市场销售分析。</p>
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
      <div class="auth-field">
        <label for="register-email">邮箱</label>
        <div class="auth-input has-suffix-button">
          <input
            id="register-email"
            v-model.trim="form.email"
            type="email"
            autocomplete="email"
            maxlength="320"
            :aria-invalid="Boolean(errors.email)"
            :aria-describedby="errors.email ? 'register-email-error' : undefined"
            placeholder="用于接收验证码"
          />
          <button
            class="send-code-button"
            type="button"
            :disabled="sendingCode || cooldownSeconds > 0"
            @click="handleSendCode"
          >
            {{ sendingCode ? '发送中…' : cooldownSeconds > 0 ? `${cooldownSeconds}s` : '发送验证码' }}
          </button>
        </div>
        <small v-if="errors.email" id="register-email-error" class="field-error">{{ errors.email }}</small>
        <small v-if="codeHint && !errors.email" class="field-hint" :class="{ 'hint-success': codeSent }">{{ codeHint }}</small>
      </div>
      <div v-if="codeSent" class="auth-field">
        <label for="register-code">验证码</label>
        <div class="auth-input">
          <input
            id="register-code"
            v-model.trim="form.verificationCode"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            :aria-invalid="Boolean(errors.verificationCode)"
            :aria-describedby="errors.verificationCode ? 'register-code-error' : undefined"
            placeholder="输入 6 位验证码"
          />
        </div>
        <small v-if="errors.verificationCode" id="register-code-error" class="field-error">{{ errors.verificationCode }}</small>
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

<style scoped>
.auth-input.has-suffix-button {
  display: flex;
  gap: 8px;
}
.auth-input.has-suffix-button input {
  flex: 1;
}
.send-code-button {
  flex-shrink: 0;
  padding: 0 12px;
  height: 40px;
  border: 1px solid var(--color-border, #ccc);
  border-radius: 6px;
  background: var(--color-bg-secondary, #f5f5f5);
  color: var(--color-text, #333);
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}
.send-code-button:hover:not(:disabled) {
  background: var(--color-bg-tertiary, #e8e8e8);
}
.send-code-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.hint-success {
  color: var(--color-success, #22c55e);
}
</style>
