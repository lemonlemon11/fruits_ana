// 让 `tsc --noEmit` 能识别单文件组件导入，避免为类型检查额外引入 vue-tsc。
declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
