<script setup lang="ts">
import { reactive, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import { login } from '../api/client'
import { safeRedirect, setCurrentUser } from '../auth'

const route = useRoute()
const router = useRouter()
const form = reactive({ displayName: '', password: '' })
const submitting = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
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
  <main class="auth-page">
    <section class="auth-intro">
      <span class="brand-mark" aria-hidden="true">果</span>
      <h1>果级经营台</h1>
      <p>登录后查看水果销售和货柜数据。</p>
    </section>
    <form class="auth-form" @submit.prevent="submit">
      <header><h2>登录</h2><p>请输入你的用户名和密码。</p></header>
      <label>用户名<input v-model.trim="form.displayName" autocomplete="username" required maxlength="80"></label>
      <label>密码<input v-model="form.password" type="password" autocomplete="current-password" required></label>
      <p v-if="error" class="form-message error" role="alert">{{ error }}</p>
      <button class="primary-button" type="submit" :disabled="submitting">{{ submitting ? '正在登录' : '登录' }}</button>
      <p class="auth-switch">还没有账号？<RouterLink to="/register">创建账号</RouterLink></p>
    </form>
  </main>
</template>
