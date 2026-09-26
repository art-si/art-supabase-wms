<template>
  <ArtDrawer ref="drawerRef" size="lg" :show-footer="false">
    <div v-if="plan" class="space-y-5">
      <ArtEntitySummary
        icon="ri:survey-line"
        eyebrow="COUNT SHEET"
        :title="plan.documentNo"
        :description="`${plan.warehouse?.warehouseName || '仓库'} · ${plan.scopeConstructionNo || '全部施工号'}`"
      />
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="rounded-xl bg-[var(--el-fill-color-light)] p-4">
          <small class="text-[var(--el-text-color-secondary)]">应盘批次</small>
          <strong class="mt-1 block text-xl tabular-nums">{{ lines.length }}</strong>
        </div>
        <div class="rounded-xl bg-[var(--el-fill-color-light)] p-4">
          <small class="text-[var(--el-text-color-secondary)]">已实盘</small>
          <strong class="mt-1 block text-xl tabular-nums">{{ countedCount }}</strong>
        </div>
        <div class="rounded-xl bg-[var(--el-fill-color-light)] p-4">
          <small class="text-[var(--el-text-color-secondary)]">净差异</small>
          <strong class="mt-1 block text-xl tabular-nums">{{ varianceLabel }}</strong>
        </div>
      </div>
      <ElAlert v-if="plan.status === 'counting'" type="info" :closable="false" show-icon>
        全部批次录入实盘后才能确认。确认时再次比对期初库存，库存已变化则整单拒绝记账。
      </ElAlert>
      <div v-if="plan.status === 'counting'" class="flex justify-end">
        <ElButton
          v-auth="'WmsCount:Post'"
          type="primary"
          :loading="posting"
          :disabled="loading || loadError || !lines.length || countedCount !== lines.length"
          @click="post"
        >
          确认盘盈盘亏
        </ElButton>
      </div>
      <ArtSectionCard
        title="盘点表"
        subtitle="一个库存批次对应一行；项目施工号随来源库存保留。"
        :loading="loading"
        :error="loadError ? '盘点表加载失败，请重试' : null"
        :empty="!loading && !loadError && lines.length === 0"
        empty-title="暂无盘点行"
        @retry="loadLines"
      >
        <ul class="divide-y divide-[var(--el-border-color-light)]">
          <li
            v-for="item in lines"
            :key="item.id"
            class="flex min-w-0 flex-wrap items-center gap-3 py-4"
          >
            <div class="min-w-0 flex-1">
              <strong class="block truncate" :title="item.material?.materialName || '物料'">
                {{ item.material?.materialName || '物料' }}
              </strong>
              <p class="mt-1 text-xs text-[var(--el-text-color-secondary)]">
                {{ item.batch?.batchNo || item.batchId }} · {{ projectName(item.projectId) }}
                {{ item.constructionNo ? ` / ${item.constructionNo}` : '' }}
              </p>
              <p
                v-if="item.material?.serialManagementEnabled || item.expectedSerialIds.length > 0"
                class="mt-1 text-xs text-[var(--el-text-color-secondary)]"
              >
                SN {{ item.expectedSerialIds.length }} 件 · 新增 {{ item.newSerialNos.length }} 件
              </p>
            </div>
            <div class="grid shrink-0 grid-cols-2 gap-x-4 text-right text-xs tabular-nums">
              <span class="text-[var(--el-text-color-secondary)]">账面</span>
              <span class="text-[var(--el-text-color-secondary)]">实盘</span>
              <strong class="mt-1 text-sm">{{ item.expectedQuantity }}</strong>
              <strong class="mt-1 text-sm">{{ item.countedQuantity ?? '待录入' }}</strong>
            </div>
            <ElButton
              v-if="plan.status === 'counting'"
              v-auth="'WmsCount:Count'"
              size="small"
              @click="openLine(item)"
            >
              {{ item.countedQuantity === null ? '录入' : '复核' }}
            </ElButton>
            <ElTag
              v-else
              size="small"
              :type="item.countedQuantity === item.expectedQuantity ? 'info' : 'warning'"
            >
              {{ item.countedQuantity === item.expectedQuantity ? '相符' : '已记差异' }}
            </ElTag>
          </li>
        </ul>
      </ArtSectionCard>
    </div>
    <CountLineDialog ref="lineRef" @success="loadLines" />
  </ArtDrawer>
</template>

<script setup lang="ts">
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import {
    fetchWmsCountLines,
    postWmsCountPlan,
    type WmsCountLine,
    type WmsCountPlan,
    type WmsProject
  } from '@wms/api'
  import CountLineDialog from './count-line-dialog.vue'

  interface Context {
    plan: WmsCountPlan
    projects: WmsProject[]
  }
  const emit = defineEmits<{ success: [] }>()
  const { confirmAction } = useArtFeedback()
  const drawerRef = ref<ArtDrawerExpose<Context>>()
  const lineRef = ref<InstanceType<typeof CountLineDialog>>()
  const plan = shallowRef<WmsCountPlan>()
  const projects = ref<WmsProject[]>([])
  const lines = ref<WmsCountLine[]>([])
  const loading = ref(false)
  const loadError = ref(false)
  const posting = ref(false)
  const countedCount = computed(
    () => lines.value.filter((row) => row.countedQuantity !== null).length
  )
  const varianceLabel = computed(() => {
    const difference = lines.value.reduce(
      (total, row) => total + (row.countedQuantity ?? row.expectedQuantity) - row.expectedQuantity,
      0
    )
    return difference > 0 ? `+${difference}` : String(difference)
  })
  function projectName(id: string | null): string {
    return id ? projects.value.find((row) => row.id === id)?.projectName || '历史项目' : '公共库存'
  }
  async function loadLines(): Promise<void> {
    if (!plan.value) return
    loading.value = true
    loadError.value = false
    try {
      lines.value = await fetchWmsCountLines(plan.value.id)
    } catch {
      loadError.value = true
    } finally {
      loading.value = false
    }
  }
  function openLine(row: WmsCountLine): void {
    void lineRef.value?.handleOpen(row)
  }
  async function post(): Promise<void> {
    if (!plan.value || posting.value) return
    try {
      await confirmAction(
        `确认盘点单 ${plan.value.documentNo} 的全部差异？确认后将生成盘盈盘亏流水，实盘结果不可再改。`,
        '确认盘点差异',
        { type: 'warning', confirmButtonText: '确认记账', cancelButtonText: '继续复核' }
      )
      posting.value = true
      await postWmsCountPlan(plan.value.id)
      plan.value = { ...plan.value, status: 'posted' }
      await loadLines()
      emit('success')
    } catch {
      // 取消确认与 API 错误由对应组件处理。
    } finally {
      posting.value = false
    }
  }
  async function handleOpen(data: Context): Promise<void> {
    plan.value = data.plan
    projects.value = data.projects
    lines.value = []
    loadError.value = false
    await drawerRef.value?.handleOpen(data, {
      title: '盘点表',
      subtitle: '实盘录入、差异复核与记账',
      onOpen: async () => loadLines()
    })
  }
  defineExpose({ handleOpen })
</script>
