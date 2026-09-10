<script setup lang="ts">
import { reactive, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import { register } from '../api/client'
import { setCurrentUser } from '../auth'

const router = useRouter()
const form = reactive({ displayName: '', password: '', confirmation: '' })
const submitting = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  if (form.password !== form.confirmation) {
    error.value = '两次输入的密码不一致'
    return
  }
  submitting.value = true
  try {
    setCurrentUser(await register(form))
    await router.replace('/overview')
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '注册失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="auth-page">
    <section class="auth-intro">
      <span class="brand-mark" aria-hidden="true">果</span>
      <h1>创建账号</h1>
      <p>注册后即可进入果级经营台。</p>
    </section>
    <form class="auth-form" @submit.prevent="submit">
      <header><h2>注册</h2><p>请填写下面三项内容。</p></header>
      <label>用户名<input v-model.trim="form.displayName" autocomplete="username" required maxlength="80"></label>
      <label>密码<input v-model="form.password" type="password" autocomplete="new-password" required minlength="8"><small>至少输入 8 位</small></label>
      <label>再次输入密码<input v-model="form.confirmation" type="password" autocomplete="new-password" required minlength="8"></label>
      <p v-if="error" class="form-message error" role="alert">{{ error }}</p>
      <button class="primary-button" type="submit" :disabled="submitting">{{ submitting ? '正在创建' : '创建账号' }}</button>
      <p class="auth-switch">已有账号？<RouterLink to="/login">返回登录</RouterLink></p>
    </form>
  </main>
</template>
