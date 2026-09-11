import type { Component } from 'vue'

declare module '@lucide/vue/dist/esm/icons/*' {
  const icon: Component
  export default icon
}
