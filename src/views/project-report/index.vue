<template>
  <ArtPermissionGuard permission="WmsProjectReport:View" resource-name="项目仓储复盘">
    <div class="business-workspace-page art-full-height">
      <BusinessWorkspaceHeader
        eyebrow="PROJECT WAREHOUSE REVIEW"
        title="项目仓储复盘"
        description="从一个项目或施工号查看库存占用、领料与在制、板材垛包、SN 主子件和收发存历史。"
        icon="ri:bar-chart-box-line"
        density="compact"
        :tags="[
          { label: '项目级台账', type: 'primary' },
          { label: '板材 + 装配', type: 'success' }
        ]"
      />
      <ArtSectionCard title="查询范围" subtitle="先选择项目，可再缩小到一个施工号。" class="mb-4">
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label class="grid min-w-0 gap-1 text-sm">
            <span>项目名称</span>
            <ElSelect
              v-model="selectedProjectId"
              filterable
              clearable
              placeholder="选择项目"
              class="w-full"
            >
              <ElOption
                v-for="project in scopedProjects"
                :key="project.id"
                :label="`${project.projectName} · ${project.projectCode}`"
                :value="project.id"
              />
            </ElSelect>
          </label>
          <label class="grid min-w-0 gap-1 text-sm">
            <span>施工号</span>
            <ElSelect
              v-model="selectedConstructionNo"
              filterable
              clearable
              :disabled="!selectedProjectId"
              :placeholder="selectedProjectId ? '全部施工号' : '先选择项目'"
              class="w-full"
            >
              <ElOption
                v-for="section in scopedSections"
                :key="section.id"
                :label="`${section.constructionNo} · ${section.sectionName}`"
                :value="section.constructionNo"
              />
            </ElSelect>
          </label>
          <div class="flex items-end">
            <ElButton :loading="summaryLoading" :disabled="!selectedProjectId" @click="loadSummary">
              刷新项目台账
            </ElButton>
          </div>
        </div>
        <ElAlert v-if="optionError" type="warning" :closable="false" show-icon class="mt-3">
          项目选项加载失败。<ElButton link type="primary" @click="loadOptions">重新加载</ElButton>
        </ElAlert>
      </ArtSectionCard>
      <ArtSectionCard
        title="施工号库存台账"
        subtitle="由实时库存、工单、预留、序列号和库存流水汇总。"
        :loading="summaryLoading"
        :error="summaryError ? '汇总加载失败，请重试' : null"
        :empty="!selectedProjectId"
        empty-title="请选择项目"
        empty-description="选择项目后，可查看全部施工号或一个指定施工号的仓储闭环。"
        @retry="loadSummary"
      >
        <div v-if="summary" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div
            v-for="metric in metrics"
            :key="metric.label"
            class="rounded-xl border border-[var(--el-border-color-light)] bg-[var(--el-fill-color-lighter)] p-4"
          >
            <small class="text-[var(--el-text-color-secondary)]">{{ metric.label }}</small>
            <strong class="mt-2 block text-2xl tabular-nums">{{ metric.value }}</strong>
            <span class="text-xs text-[var(--el-text-color-secondary)]">{{ metric.hint }}</span>
          </div>
        </div>
      </ArtSectionCard>
      <ArtSectionCard
        v-if="selectedProjectId"
        title="项目完工复盘明细"
        subtitle="四类明细使用同一项目和施工号范围，支持进一步按单号或 SN 筛选。"
        class="mt-4"
        preserve-content-structure
      >
        <ElTabs v-model="activeTab" class="min-w-0">
          <ElTabPane name="stock" label="库存与垛包" />
          <ElTabPane name="orders" label="生产工单" />
          <ElTabPane name="movements" label="收发存记录" />
          <ElTabPane name="serials" label="序列号" />
        </ElTabs>
        <ArtTableQuery
          v-if="activeTab === 'stock'"
          :key="`stock-${selectedProjectId}-${selectedConstructionNo}`"
          v-model="stockSearch"
          :api-fn="fetchStockRows"
          :search-items="stockSearchItems"
          :columns-factory="stockColumns"
          :search-bar-props="{ span: 8, labelWidth: 82, showExpand: false }"
          :table-props="{ rowKey: 'id', tableLayout: 'fixed', emptyText: '该范围暂无库存' }"
        />
        <ArtTableQuery
          v-if="activeTab === 'orders'"
          :key="`orders-${selectedProjectId}-${selectedConstructionNo}`"
          v-model="orderSearch"
          :api-fn="fetchOrderRows"
          :search-items="orderSearchItems"
          :columns-factory="orderColumns"
          :search-bar-props="{ span: 8, labelWidth: 82, showExpand: false }"
          :table-props="{ rowKey: 'id', tableLayout: 'fixed', emptyText: '该范围暂无工单' }"
        />
        <ArtTableQuery
          v-if="activeTab === 'movements'"
          :key="`movements-${selectedProjectId}-${selectedConstructionNo}`"
          v-model="movementSearch"
          :api-fn="fetchMovementRows"
          :search-items="movementSearchItems"
          :columns-factory="movementColumns"
          :search-bar-props="{ span: 8, labelWidth: 82, showExpand: false }"
          :table-props="{ rowKey: 'id', tableLayout: 'fixed', emptyText: '该范围暂无流水' }"
        />
        <ArtTableQuery
          v-if="activeTab === 'serials'"
          :key="`serials-${selectedProjectId}-${selectedConstructionNo}`"
          v-model="serialSearch"
          :api-fn="fetchSerialRows"
          :search-items="serialSearchItems"
          :columns-factory="serialColumns"
          :search-bar-props="{ span: 8, labelWidth: 82, showExpand: false }"
          :table-props="{ rowKey: 'id', tableLayout: 'fixed', emptyText: '该范围暂无序列号' }"
        />
      </ArtSectionCard>
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import ArtTableQuery from '@/components/core/tables/art-table-query/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type { ColumnOption } from '@/types'
  import { formatNumberValue } from '@/utils/ui/format'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import {
    fetchWmsProjectMovementPage,
    fetchWmsProjectSections,
    fetchWmsProjectSummary,
    fetchWmsProjectWorkOrderPage,
    fetchWmsProjects,
    fetchWmsSerialPage,
    fetchWmsStockPage,
    type WmsMovement,
    type WmsProject,
    type WmsProjectSection,
    type WmsProjectSummary,
    type WmsProjectWorkOrder,
    type WmsSerial,
    type WmsStockBatch,
    type WmsStockQuery
  } from '@wms/api'

  defineOptions({ name: 'WmsProjectReport' })
  type ReportTab = 'stock' | 'orders' | 'movements' | 'serials'
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const projects = ref<WmsProject[]>([])
  const sections = ref<WmsProjectSection[]>([])
  const selectedProjectId = ref('')
  const selectedConstructionNo = ref('')
  const activeTab = ref<ReportTab>('stock')
  const summary = shallowRef<WmsProjectSummary>()
  const summaryLoading = ref(false)
  const summaryError = ref(false)
  const optionError = ref(false)
  let summaryRequestId = 0
  const stockSearch = reactive({ keyword: '', positiveOnly: true })
  const orderSearch = reactive({ keyword: '' })
  const movementSearch = reactive({ keyword: '' })
  const serialSearch = reactive({ keyword: '' })
  const selectedProject = computed(() =>
    projects.value.find((item) => item.id === selectedProjectId.value)
  )
  const scopedProjects = computed(() =>
    projects.value.filter(
      (project) => !effectiveTenantId.value || project.tenantId === effectiveTenantId.value
    )
  )
  const scopedSections = computed(() =>
    sections.value.filter((section) => section.projectId === selectedProjectId.value)
  )
  const metrics = computed(() => {
    const value = summary.value
    if (!value) return []
    return [
      {
        label: '成品在库',
        value: formatNumberValue(value.finishedStockQuantity),
        hint: '生产工单入库数量'
      },
      {
        label: '当前库存',
        value: formatNumberValue(value.stockQuantity),
        hint: `${value.materialCount} 类物料 · ${value.packCount} 个垛包`
      },
      {
        label: '板材面积',
        value: `${formatNumberValue(value.boardAreaSqm)} ㎡`,
        hint: '库存批次面积合计'
      },
      {
        label: '项目预留',
        value: formatNumberValue(value.reservedQuantity),
        hint: '工单已锁定原料'
      },
      { label: '已领料', value: formatNumberValue(value.issuedQuantity), hint: '生产领料出库累计' },
      {
        label: '在制数量',
        value: formatNumberValue(value.wipQuantity),
        hint: `${value.workOrderCount} 张工单`
      },
      { label: '已供货', value: formatNumberValue(value.shippedQuantity), hint: '销售出库累计' },
      {
        label: '序列号',
        value: formatNumberValue(value.serialCount),
        hint: `${value.movementCount} 条库存流水`
      }
    ]
  })
  const stockSearchItems: SearchFormItem[] = [
    { label: '批号 / 备注', key: 'keyword', type: 'input', props: { clearable: true } },
    { label: '仅看在库', key: 'positiveOnly', type: 'switch' }
  ]
  const orderSearchItems: SearchFormItem[] = [
    { label: '工单编号', key: 'keyword', type: 'input', props: { clearable: true } }
  ]
  const movementSearchItems: SearchFormItem[] = [
    { label: '业务单号', key: 'keyword', type: 'input', props: { clearable: true } }
  ]
  const serialSearchItems: SearchFormItem[] = [
    { label: 'SN 编码', key: 'keyword', type: 'input', props: { clearable: true } }
  ]
  const tenantId = computed(
    () => selectedProject.value?.tenantId || effectiveTenantId.value || undefined
  )
  const scopedQuery = (query: WmsStockQuery): WmsStockQuery => ({
    ...query,
    tenantId: tenantId.value,
    projectId: selectedProjectId.value,
    constructionNo: selectedConstructionNo.value || undefined
  })
  function fetchStockRows(query: WmsStockQuery) {
    return fetchWmsStockPage(scopedQuery(query))
  }
  function fetchOrderRows(query: WmsStockQuery) {
    return fetchWmsProjectWorkOrderPage(scopedQuery(query))
  }
  function fetchMovementRows(query: WmsStockQuery) {
    return fetchWmsProjectMovementPage(scopedQuery(query))
  }
  function fetchSerialRows(query: WmsStockQuery) {
    return fetchWmsSerialPage(scopedQuery(query))
  }
  async function loadOptions(): Promise<void> {
    optionError.value = false
    try {
      const [projectRows, sectionRows] = await Promise.all([
        fetchWmsProjects(),
        fetchWmsProjectSections()
      ])
      projects.value = projectRows
      sections.value = sectionRows
    } catch {
      optionError.value = true
    }
  }
  async function loadSummary(): Promise<void> {
    const projectId = selectedProjectId.value
    const requestId = ++summaryRequestId
    summary.value = undefined
    summaryError.value = false
    if (!projectId) return
    summaryLoading.value = true
    try {
      const value = await fetchWmsProjectSummary(projectId, selectedConstructionNo.value)
      if (requestId === summaryRequestId) summary.value = value
    } catch {
      if (requestId === summaryRequestId) summaryError.value = true
    } finally {
      if (requestId === summaryRequestId) summaryLoading.value = false
    }
  }
  function stockColumns(): ColumnOption<WmsStockBatch>[] {
    return [
      {
        prop: 'material',
        label: '物料',
        minWidth: 210,
        fixed: 'left',
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.material?.materialName || '物料'}
            secondary={row.material?.materialCode || row.materialId}
            icon="ri:stack-line"
          />
        )
      },
      { prop: 'batchNo', label: '批号', minWidth: 150 },
      { prop: 'constructionNo', label: '施工号', minWidth: 145 },
      { prop: 'pack', label: '垛包', minWidth: 135, formatter: (row) => row.pack?.packNo || '—' },
      { prop: 'quantity', label: '块数 / 数量', minWidth: 115, align: 'right' },
      {
        prop: 'areaSqm',
        label: '面积 ㎡',
        minWidth: 105,
        align: 'right',
        formatter: (row) => row.areaSqm ?? '—'
      },
      {
        prop: 'size',
        label: '长 × 宽 × 厚 mm',
        minWidth: 160,
        formatter: (row) =>
          row.lengthMm && row.widthMm
            ? `${row.lengthMm} × ${row.widthMm}${row.thicknessMm ? ` × ${row.thicknessMm}` : ''}`
            : '—'
      }
    ]
  }
  function orderColumns(): ColumnOption<WmsProjectWorkOrder>[] {
    return [
      { prop: 'workOrderNo', label: '工单编号', minWidth: 190, fixed: 'left' },
      { prop: 'materialNameSnapshot', label: '产品', minWidth: 190 },
      { prop: 'specificationSnapshot', label: '规格', minWidth: 160 },
      { prop: 'constructionNo', label: '施工号', minWidth: 145 },
      { prop: 'orderStatus', label: '状态', minWidth: 100 },
      { prop: 'orderQuantity', label: '计划数量', minWidth: 100, align: 'right' },
      { prop: 'completedQuantity', label: '已完工', minWidth: 100, align: 'right' },
      { prop: 'warehousedQuantity', label: '已入库', minWidth: 100, align: 'right' },
      { prop: 'plannedEndDate', label: '计划完工', minWidth: 130 }
    ]
  }
  function movementColumns(): ColumnOption<WmsMovement>[] {
    return [
      { prop: 'referenceNo', label: '业务单号', minWidth: 175, fixed: 'left' },
      { prop: 'movementType', label: '业务类型', minWidth: 130 },
      {
        prop: 'material',
        label: '物料',
        minWidth: 190,
        formatter: (row) => row.material?.materialName || row.materialId
      },
      { prop: 'constructionNo', label: '来源施工号', minWidth: 145 },
      { prop: 'targetConstructionNo', label: '目标施工号', minWidth: 145 },
      { prop: 'quantity', label: '数量', minWidth: 100, align: 'right' },
      {
        prop: 'areaSqm',
        label: '面积 ㎡',
        minWidth: 100,
        align: 'right',
        formatter: (row) => row.areaSqm ?? '—'
      },
      {
        prop: 'occurredAt',
        label: '发生时间',
        minWidth: 170,
        formatter: (row) => row.occurredAt?.replace('T', ' ').slice(0, 19) || '—'
      }
    ]
  }
  function serialColumns(): ColumnOption<WmsSerial>[] {
    return [
      { prop: 'serialNo', label: 'SN 编码', minWidth: 190, fixed: 'left' },
      {
        prop: 'material',
        label: '物料',
        minWidth: 190,
        formatter: (row) => row.material?.materialName || row.materialId
      },
      { prop: 'constructionNo', label: '施工号', minWidth: 145 },
      {
        prop: 'parent',
        label: '父件 SN',
        minWidth: 175,
        formatter: (row) => row.parent?.serialNo || '主机 / 独立件'
      },
      { prop: 'status', label: '库存状态', minWidth: 100 },
      {
        prop: 'createTime',
        label: '建码时间',
        minWidth: 170,
        formatter: (row) => row.createTime?.replace('T', ' ').slice(0, 19) || '—'
      }
    ]
  }
  watch(selectedProjectId, () => {
    selectedConstructionNo.value = ''
    void loadSummary()
  })
  watch(selectedConstructionNo, () => void loadSummary())
  onMounted(() => void loadOptions())
</script>
