<template>
  <div class="business-workspace-page art-full-height min-w-0 space-y-4">
    <BusinessWorkspaceHeader
      eyebrow="WAREHOUSE OPERATIONS"
      title="仓储运营工作台"
      description="统一处理收料、库存、项目供货与 SN 追溯，沿着 SCM 到 MES 的业务链路查看仓内实绩。"
      icon="ri:store-3-line"
      density="compact"
      :tags="[
        { label: '单一库存底座', type: 'primary' },
        { label: '项目施工号', type: 'success' },
        { label: '批次 · 垛包 · SN', type: 'info' }
      ]"
      :metrics="metrics"
      refreshable
      :refresh-loading="loading"
      @refresh="loadStats"
    />
    <ElAlert v-if="loadError" type="warning" :closable="false" show-icon>
      仓储概览加载失败，业务页面仍可使用。
      <ElButton link type="primary" @click="loadStats">重新加载</ElButton>
    </ElAlert>

    <div class="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.8fr)]">
      <ArtSectionCard title="仓内作业" subtitle="根据当前任务进入收料、库存、追溯或项目复盘。">
        <div class="grid gap-3 sm:grid-cols-2">
          <RouterLink
            v-for="entry in visibleEntries"
            :key="entry.path"
            :to="entry.path"
            class="group flex min-w-0 items-start gap-3 rounded-xl border border-[var(--el-border-color-light)] bg-[var(--el-fill-color-lighter)] p-4 transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-[var(--el-color-primary-light-5)] hover:bg-[var(--el-color-primary-light-9)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--el-color-primary)]"
          >
            <span
              class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--el-color-primary-light-9)] text-[var(--el-color-primary)]"
              aria-hidden="true"
            >
              <ArtSvgIcon :icon="entry.icon" />
            </span>
            <span class="min-w-0 flex-1">
              <strong class="block text-sm">{{ entry.title }}</strong>
              <small class="mt-1 block text-xs leading-5 text-[var(--el-text-color-secondary)]">
                {{ entry.description }}
              </small>
            </span>
            <ArtSvgIcon
              icon="ri:arrow-right-up-line"
              class="shrink-0 text-[var(--el-text-color-placeholder)] group-hover:text-[var(--el-color-primary)]"
              aria-hidden="true"
            />
          </RouterLink>
        </div>
      </ArtSectionCard>
      <ArtSectionCard title="跨域作业链路" subtitle="已有单据和主数据在 WMS 汇入同一库存台账。">
        <ol class="space-y-4">
          <li v-for="(stage, index) in stages" :key="stage.title" class="flex min-w-0 gap-3">
            <span
              class="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--el-color-primary-light-9)] text-xs font-semibold text-[var(--el-color-primary)]"
            >
              {{ String(index + 1).padStart(2, '0') }}
            </span>
            <div class="min-w-0 border-b border-[var(--el-border-color-light)] pb-4 last:border-0">
              <strong class="block text-sm">{{ stage.title }}</strong>
              <p class="mt-1 text-xs leading-5 text-[var(--el-text-color-secondary)]">
                {{ stage.description }}
              </p>
            </div>
          </li>
        </ol>
      </ArtSectionCard>
    </div>

    <ArtSectionCard
      title="一套底座，适配三类业务"
      subtitle="仓库、库位、批次、单据和权限共享；项目、板材与 SN 维度按业务启用。"
    >
      <div class="grid gap-3 lg:grid-cols-3">
        <article
          v-for="scenario in scenarios"
          :key="scenario.title"
          class="min-w-0 rounded-xl border border-[var(--el-border-color-light)] p-4"
        >
          <div class="flex items-center gap-2">
            <ArtSvgIcon :icon="scenario.icon" class="text-xl text-[var(--el-color-primary)]" />
            <strong>{{ scenario.title }}</strong>
          </div>
          <p class="mt-2 text-sm leading-6 text-[var(--el-text-color-secondary)]">
            {{ scenario.description }}
          </p>
          <div class="mt-3 flex flex-wrap gap-1.5">
            <ElTag v-for="tag in scenario.tags" :key="tag" size="small" effect="plain" round>
              {{ tag }}
            </ElTag>
          </div>
        </article>
      </div>
    </ArtSectionCard>
  </div>
</template>

<script setup lang="ts">
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import { fetchWmsWorkbenchStats, type WmsWorkbenchStats } from '@wms/api'

  defineOptions({ name: 'WmsWorkbench' })
  const { hasAuth } = useAuth()
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const stats = shallowRef<WmsWorkbenchStats>()
  const loading = ref(false)
  const loadError = ref(false)
  let requestId = 0
  const metrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '在库批次',
      value: stats.value?.stockBatchCount ?? '—',
      description: '当前范围有库存的批次',
      icon: 'ri:archive-stack-line',
      tone: 'primary',
      loading: loading.value
    },
    {
      label: '序列号',
      value: stats.value?.serialCount ?? '—',
      description: '主机与关键件身份记录',
      icon: 'ri:qr-scan-2-line',
      tone: 'success',
      loading: loading.value
    },
    {
      label: '有效预留',
      value: stats.value?.activeReservationCount ?? '—',
      description: '工单已锁定的库存',
      icon: 'ri:lock-2-line',
      tone: 'warning',
      loading: loading.value
    },
    {
      label: '待确认收料',
      value: stats.value?.draftInboundCount ?? '—',
      description: 'SCM 下推的收料入库草稿',
      icon: 'ri:inbox-archive-line',
      tone: 'info',
      loading: loading.value
    }
  ])
  const entries = [
    {
      title: '收料入库',
      description: '核对收料通知并确认采购入库。',
      icon: 'ri:inbox-archive-line',
      path: '/wms/receipt-issue/receipt-inbound',
      permission: 'WmsReceiptInbound:View'
    },
    {
      title: '即时库存',
      description: '查批次、垛包、库位及项目占用。',
      icon: 'ri:archive-stack-line',
      path: '/wms/inventory-trace/stock',
      permission: 'WmsStock:View'
    },
    {
      title: '库存作业',
      description: '办理扫码入库、出库、工单领料及直接调拨。',
      icon: 'ri:swap-box-line',
      path: '/wms/receipt-issue/stock-operation',
      permission: 'WmsStockOperation:View'
    },
    {
      title: '销售退货入库',
      description: '按原发货记录办理板材或 SN 主机退货。',
      icon: 'ri:arrow-go-back-line',
      path: '/wms/receipt-issue/sales-return',
      permission: 'WmsSalesReturn:View'
    },
    {
      title: '直接调拨',
      description: '同仓库存组织与库位一步变更，追溯直接调拨单。',
      icon: 'ri:swap-box-line',
      path: '/wms/transfer-adjustment/direct-transfer',
      permission: 'WmsDirectTransfer:View'
    },
    {
      title: '分步调拨',
      description: '异地仓库调出、在途跟踪和入库确认。',
      icon: 'ri:truck-line',
      path: '/wms/transfer-adjustment/transfer',
      permission: 'WmsTransfer:View'
    },
    {
      title: '库存盘点',
      description: '按仓库、项目和施工号盘点批次与 SN。',
      icon: 'ri:survey-line',
      path: '/wms/transfer-adjustment/count',
      permission: 'WmsCount:View'
    },
    {
      title: '库存调整',
      description: '办理仓位、物料、批次、状态、单位与属性转换。',
      icon: 'ri:exchange-box-line',
      path: '/wms/transfer-adjustment/adjustment',
      permission: 'WmsAdjustment:View'
    },
    {
      title: '库存组装',
      description: '多批次组件领用与成品批次入库追溯。',
      icon: 'ri:apps-2-add-line',
      path: '/wms/transfer-adjustment/assembly',
      permission: 'WmsAssembly:View'
    },
    {
      title: '项目施工号',
      description: '维护标段和交付范围的库存归属。',
      icon: 'ri:building-2-line',
      path: '/wms/project-warehouse/project-section',
      permission: 'WmsProjectSection:View'
    },
    {
      title: '序列号追溯',
      description: '查看主机与关键件 SN 父子关系。',
      icon: 'ri:qr-scan-2-line',
      path: '/wms/inventory-trace/serial-trace',
      permission: 'WmsSerialTrace:View'
    },
    {
      title: '库存流水',
      description: '追溯收、发、调拨与项目变更。',
      icon: 'ri:file-list-3-line',
      path: '/wms/inventory-trace/inventory-ledger',
      permission: 'WmsInventoryLedger:View'
    },
    {
      title: '项目仓储复盘',
      description: '按施工号查看库存、工单与供货。',
      icon: 'ri:bar-chart-box-line',
      path: '/wms/project-warehouse/project-report',
      permission: 'WmsProjectReport:View'
    }
  ]
  const visibleEntries = computed(() => entries.filter((entry) => hasAuth(entry.permission)))
  const stages = [
    {
      title: 'SCM 采购与收料',
      description: '采购明细下推收料入库草稿；施工号随单据进入库存批次。'
    },
    {
      title: 'MES 工单与发料',
      description: '项目工单下达时按批次预留原料，领料只能消耗允许的项目库存。'
    },
    { title: 'WMS 收发存与追溯', description: '成品垛包、主子件 SN、调拨和出库统一写入库存流水。' }
  ]
  const scenarios = [
    {
      title: '板材加工',
      icon: 'ri:layout-grid-line',
      description: '长宽厚、面积、工单动态参数与垛包同批次保存。',
      tags: ['聚氨酯板', '岩棉板', '排包']
    },
    {
      title: '装配制造',
      icon: 'ri:settings-3-line',
      description: '关键焊接件与主机一物一码，追溯父子 SN 和项目归属。',
      tags: ['关键件 SN', '主机 SN', '装配']
    },
    {
      title: '工程项目供货',
      icon: 'ri:building-line',
      description: '项目与施工号隔离预留、出入库和供货，保留完整变更历史。',
      tags: ['施工号', '项目调拨', '项目复盘']
    }
  ]

  async function loadStats(): Promise<void> {
    const id = ++requestId
    loading.value = true
    loadError.value = false
    try {
      const value = await fetchWmsWorkbenchStats(effectiveTenantId.value || undefined)
      if (id === requestId) stats.value = value
    } catch {
      if (id === requestId) loadError.value = true
    } finally {
      if (id === requestId) loading.value = false
    }
  }
  watch(effectiveTenantId, () => void loadStats())
  onMounted(() => void loadStats())
</script>
