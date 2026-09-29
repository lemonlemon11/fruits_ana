<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElInput } from 'element-plus'
import 'element-plus/es/components/input/style/css'
import AuthPortal from '../components/AuthPortal.vue'

const API_ROOT = '/api'

const step = ref<'email' | 'code' | 'password' | 'done'>('email')
const email = ref('')
const verificationCode = ref('')
const resetToken = ref('')
const error = ref('')
const sending = ref(false)
const verifying = ref(false)
const resetting = ref(false)
const cooldownSeconds = ref(0)
const codeHint = ref('')

const form = reactive({
  password: '',
  confirmation: '',
})

const CODE_COOLDOWN_SECONDS = 60
const router = useRouter()

function validateEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

async function handleSendCode() {
  if (!email.value) { error.value = '请输入邮箱'; return }
  if (!validateEmail(email.value)) { error.value = '邮箱格式不正确'; return }
  error.value = ''
  sending.value = true
  codeHint.value = ''
  try {
    const resp = await fetch(`${API_ROOT}/auth/forgot-password/send-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value }),
    })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data.detail || '发送失败')
    codeHint.value = `验证码已发送至 ${email.value}，如未收到请检查垃圾邮箱`
    step.value = 'code'
    cooldownSeconds.value = CODE_COOLDOWN_SECONDS
    const timer = setInterval(() => {
      cooldownSeconds.value--
      if (cooldownSeconds.value <= 0) clearInterval(timer)
    }, 1000)
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '发送失败，请稍后重试'
  } finally {
    sending.value = false
  }
}

async function handleVerifyCode() {
  if (!verificationCode.value) { error.value = '请输入验证码'; return }
  error.value = ''
  verifying.value = true
  try {
    const resp = await fetch(`${API_ROOT}/auth/forgot-password/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value, verification_code: verificationCode.value }),
    })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data.detail || '验证失败')
    resetToken.value = data.reset_token
    step.value = 'password'
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '验证失败'
  } finally {
    verifying.value = false
  }
}

async function handleReset() {
  error.value = ''
  if (!form.password) { error.value = '请输入新密码'; return }
  if (form.password.length < 8) { error.value = '密码至少 8 位'; return }
  if (!form.confirmation) { error.value = '请再次输入新密码'; return }
  if (form.password !== form.confirmation) { error.value = '两次输入的密码不一致'; return }
  resetting.value = true
  try {
    const resp = await fetch(`${API_ROOT}/auth/forgot-password/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value, reset_token: resetToken.value, password: form.password }),
    })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data.detail || '重置失败')
    step.value = 'done'
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '重置失败'
  } finally {
    resetting.value = false
  }
}

function goLogin() {
  router.replace('/login')
}
</script>

<template>
  <AuthPortal>
    <div class="auth-form">
      <header>
        <h2>重置密码</h2>
        <p v-if="step === 'email'">输入注册时使用的邮箱，我们将发送验证码。</p>
        <p v-else-if="step === 'code'">输入邮箱中收到的 6 位验证码。</p>
        <p v-else-if="step === 'password'">设置新密码。</p>
        <p v-else>密码已重置成功。</p>
      </header>

      <!-- Step 1: 输入邮箱 -->
      <template v-if="step === 'email'">
        <div class="auth-field">
          <label for="fp-email">注册邮箱</label>
          <div class="auth-input has-suffix-button">
            <ElInput id="fp-email" v-model.trim="email" class="auth-email-input" autocomplete="email" maxlength="320" placeholder="输入注册邮箱" />
            <button class="send-code-button" type="button" :disabled="sending" @click="handleSendCode">
              {{ sending ? '发送中…' : '发送验证码' }}
            </button>
          </div>
        </div>
        <p v-if="error" class="form-message error" role="alert">{{ error }}</p>
        <p class="auth-switch"><button class="link-button" @click="goLogin">返回登录</button></p>
      </template>

      <!-- Step 2: 验证码 -->
      <template v-if="step === 'code'">
        <div class="auth-field">
          <label for="fp-code">验证码</label>
          <ElInput id="fp-code" v-model.trim="verificationCode" class="auth-input" autocomplete="one-time-code" maxlength="6" placeholder="输入 6 位验证码" />
          <small v-if="codeHint" class="field-hint hint-success">{{ codeHint }}</small>
        </div>
        <p v-if="error" class="form-message error" role="alert">{{ error }}</p>
        <button class="primary-button auth-submit" :disabled="verifying" @click="handleVerifyCode">
          {{ verifying ? '验证中…' : '验证' }}
        </button>
        <p class="auth-switch">
          <button class="link-button" @click="step = 'email'; error = ''">返回上一步</button>
          <span style="margin: 0 .5rem; color: var(--muted)">·</span>
          <button class="link-button" :disabled="cooldownSeconds > 0" @click="handleSendCode">{{ cooldownSeconds > 0 ? `${cooldownSeconds}s` : '重新发送' }}</button>
        </p>
      </template>

      <!-- Step 3: 设置新密码 -->
      <template v-if="step === 'password'">
        <div class="auth-field">
          <label for="fp-password">新密码</label>
          <ElInput id="fp-password" v-model="form.password" type="password" show-password class="auth-input" autocomplete="new-password" placeholder="至少 8 位" />
          <small class="field-hint">至少 8 位字符</small>
        </div>
        <div class="auth-field">
          <label for="fp-confirmation">再次输入新密码</label>
          <ElInput id="fp-confirmation" v-model="form.confirmation" type="password" show-password class="auth-input" autocomplete="new-password" />
        </div>
        <p v-if="error" class="form-message error" role="alert">{{ error }}</p>
        <button class="primary-button auth-submit" :disabled="resetting" @click="handleReset">
          {{ resetting ? '重置中…' : '重置密码' }}
        </button>
        <p class="auth-switch"><button class="link-button" @click="step = 'code'; error = ''">返回上一步</button></p>
      </template>

      <!-- Step 4: 完成 -->
      <template v-if="step === 'done'">
        <p class="form-message success" role="alert">密码已重置，请使用新密码登录。</p>
        <button class="primary-button auth-submit" @click="goLogin">去登录</button>
      </template>
    </div>
  </AuthPortal>
</template>

<style scoped>
.auth-input.has-suffix-button {
  display: flex;
  gap: 8px;
}
.auth-input.has-suffix-button .auth-email-input {
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
}
.send-code-button:hover:not(:disabled) {
  background: var(--color-bg-tertiary, #e8e8e8);
}
.send-code-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.hint-success {
  color: #22c55e;
}
.auth-form header {
  margin-bottom: 1.5rem;
}
.form-message.success {
  color: #22c55e;
  text-align: center;
  padding: .75rem 0;
}
.link-button {
  border: none;
  background: none;
  color: var(--primary, #17663f);
  cursor: pointer;
  padding: 0;
  font: inherit;
  text-decoration: underline;
}
.link-button:hover {
  opacity: .8;
}
.auth-switch {
  text-align: center;
  margin-top: 1rem;
  color: var(--muted);
  font-size: .875rem;
}
.auth-input.has-toggle {
  display: flex;
  align-items: center;
}
.auth-input.has-toggle input {
  flex: 1;
}
.password-toggle {
  border: none;
  background: none;
  padding: 0 8px;
  cursor: pointer;
  color: var(--muted);
  display: flex;
}
.password-toggle:hover {
  color: var(--ink);
}
</style>
