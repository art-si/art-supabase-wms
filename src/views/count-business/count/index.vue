<template>
  <ArtPermissionGuard permission="WmsCount:View" resource-name="库存盘点">
    <div class="business-workspace-page art-full-height min-w-0">
      <BusinessWorkspaceHeader
        eyebrow="INVENTORY COUNT"
        title="库存盘点"
        description="从即时库存生成盘点方案，逐批录入实盘数量与 SN，复核后自动生成盘盈盘亏单和库存流水。"
        icon="ri:survey-line"
        density="compact"
        :tags="[
          { label: '账实核对', type: 'primary' },
          { label: '项目施工号', type: 'success' },
          { label: 'SN 逐件', type: 'info' }
        ]"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>
      <ElAlert v-if="optionError" type="warning" :closable="false" show-icon class="mb-3">
        仓库或项目选项加载失败。<ElButton link type="primary" @click="loadOptions"
          >重新加载</ElButton
        >
      </ElAlert>
      <ArtTableQuery
        ref="tableRef"
        v-model="search"
        :api-fn="fetchRows"
        :search-items="searchItems"
        :columns-factory="columnsFactory"
        :header-actions="headerActions"
        header-actions-placement="workspace"
        :search-bar-props="{ span: 6, labelWidth: 82 }"
        :table-props="{
          rowKey: displayMode === 'line' ? 'detailRowId' : 'id',
          spanMethod: mergeDocumentCells,
          tableLayout: 'fixed',
          emptyText: '当前范围暂无盘点方案',
          emptyDescription: '选择仓库并生成盘点方案，系统会以当前批次库存创建盘点表。'
        }"
        focusable
      >
        <template #search-displayMode>
          <ElRadioGroup v-model="displayMode" aria-label="单据列表展示方式" @change="refresh">
            <ElRadioButton label="document" value="document">按单据</ElRadioButton>
            <ElRadioButton label="line" value="line">按明细</ElRadioButton>
          </ElRadioGroup>
        </template>
      </ArtTableQuery>
      <CountCreateDialog ref="createRef" @success="refresh" />
      <CountDetailDrawer ref="detailRef" @success="refresh" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { ElTag } from 'element-plus'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtTableQuery, {
    type ArtTableQueryExpose,
    type ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type { ColumnOption } from '@/types'
  import {
    documentGroupSpan,
    expandDocumentLines,
    loadAllLinePages,
    paginateDetailRows
  } from '@/utils/business/document-detail-list'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import {
    cancelWmsCountPlan,
    fetchWmsCountPlanPage,
    fetchWmsCountLinesForPlans,
    fetchWmsProjectSections,
    fetchWmsProjects,
    fetchWmsWarehouses,
    type WmsCountPlan,
    type WmsCountLine,
    type WmsProject,
    type WmsProjectSection,
    type WmsStockQuery,
    type WmsWarehouse
  } from '@wms/api'
  import CountCreateDialog from './modules/count-create-dialog.vue'
  import CountDetailDrawer from './modules/count-detail-drawer.vue'

  const wmsCountStatusOptions = useDictionaryOptions('wmsCountStatus')

  defineOptions({ name: 'WmsCount' })
  const { confirmAction } = useArtFeedback()
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const tableRef = ref<ArtTableQueryExpose>()
  const displayMode = ref<'document' | 'line'>('document')
  type CountPlanListRow = WmsCountPlan & {
    detailRowId?: string
    detailLine?: WmsCountLine
    detailGroupStart?: boolean
  }
  const visibleRows = ref<CountPlanListRow[]>([])
  const lineProperties = new Set([
    'detailMaterialCode',
    'detailMaterialName',
    'detailBatchNo',
    'detailExpectedQuantity',
    'detailCountedQuantity',
    'detailVariance'
  ])
  function mergeDocumentCells({
    rowIndex,
    column
  }: {
    rowIndex: number
    column: { property?: string }
  }) {
    return displayMode.value === 'line'
      ? documentGroupSpan(visibleRows.value, rowIndex, column.property, lineProperties)
      : ([1, 1] as [number, number])
  }
  const createRef = ref<InstanceType<typeof CountCreateDialog>>()
  const detailRef = ref<InstanceType<typeof CountDetailDrawer>>()
  const warehouses = ref<WmsWarehouse[]>([])
  const projects = ref<WmsProject[]>([])
  const sections = ref<WmsProjectSection[]>([])
  const optionError = ref(false)
  const headerActions: ArtTableQueryHeaderAction[] = [
    {
      permission: 'WmsCount:Create',
      type: 'add',
      label: '生成盘点方案',
      buttonProps: { plain: false },
      disabled: () => optionError.value,
      onClick: () => openCreate()
    }
  ]
  const workingId = ref<string>()
  const search = reactive({
    warehouseId: '',
    status: '',
    projectId: '',
    constructionNo: '',
    keyword: ''
  })
  const filterTenantId = computed(() => effectiveTenantId.value || undefined)
  const searchItems = computed<SearchFormItem[]>(() => [
    { label: '展示方式', key: 'displayMode', type: 'text' },
    {
      label: '仓库',
      key: 'warehouseId',
      type: 'select',
      props: {
        clearable: true,
        filterable: true,
        placeholder: '全部仓库',
        options: warehouses.value
          .filter((row) => !filterTenantId.value || row.tenantId === filterTenantId.value)
          .map((row) => ({ label: `${row.warehouseName} · ${row.warehouseCode}`, value: row.id }))
      }
    },
    {
      label: '状态',
      key: 'status',
      type: 'select',
      props: {
        clearable: true,
        placeholder: '全部状态',
        options: wmsCountStatusOptions
      }
    },
    {
      label: '项目范围',
      key: 'projectId',
      type: 'select',
      props: {
        clearable: true,
        filterable: true,
        placeholder: '全部范围',
        options: projects.value
          .filter((row) => !filterTenantId.value || row.tenantId === filterTenantId.value)
          .map((row) => ({ label: `${row.projectName} · ${row.projectCode}`, value: row.id })),
        onChange: () => (search.constructionNo = '')
      }
    },
    {
      label: '施工号',
      key: 'constructionNo',
      type: 'select',
      props: {
        clearable: true,
        filterable: true,
        disabled: !search.projectId,
        placeholder: search.projectId ? '全部施工号' : '请先选项目',
        options: sections.value
          .filter((row) => row.projectId === search.projectId)
          .map((row) => ({
            label: `${row.constructionNo} · ${row.sectionName}`,
            value: row.constructionNo
          }))
      }
    },
    {
      label: '盘点单号',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '输入盘点单号' }
    }
  ])
  const statusLabels: Record<WmsCountPlan['status'], string> = {
    counting: '盘点中',
    posted: '已记账',
    cancelled: '已取消'
  }
  function projectName(id: string | null): string {
    return id ? projects.value.find((row) => row.id === id)?.projectName || '历史项目' : '全仓范围'
  }
  async function fetchRows(query: WmsStockQuery) {
    const fetchPage = (page: WmsStockQuery) =>
      fetchWmsCountPlanPage({ ...page, tenantId: filterTenantId.value })
    if (displayMode.value === 'document') {
      visibleRows.value = []
      return fetchPage(query)
    }
    const documents = await loadAllLinePages(fetchPage, query)
    const lines = await fetchWmsCountLinesForPlans(documents.map((document) => document.id))
    const linesByPlan = new Map<string, WmsCountLine[]>()
    for (const line of lines) {
      const group = linesByPlan.get(line.planId) || []
      group.push(line)
      linesByPlan.set(line.planId, group)
    }
    const rows = expandDocumentLines(
      documents,
      (document) => linesByPlan.get(document.id) || [],
      (line) => line.id
    )
    const result = paginateDetailRows(
      rows,
      (query.current - 1) * query.size,
      query.current * query.size - 1
    )
    visibleRows.value = result.data
    return result
  }
  function openCreate(): void {
    void createRef.value?.handleOpen({
      tenantId: filterTenantId.value,
      warehouses: warehouses.value,
      projects: projects.value,
      sections: sections.value
    })
  }
  function openDetail(row: WmsCountPlan): void {
    void detailRef.value?.handleOpen({ plan: row, projects: projects.value })
  }
  async function refresh(): Promise<void> {
    await tableRef.value?.refreshUpdate()
  }
  async function loadOptions(): Promise<void> {
    optionError.value = false
    try {
      const [warehouseRows, projectRows, sectionRows] = await Promise.all([
        fetchWmsWarehouses(),
        fetchWmsProjects(),
        fetchWmsProjectSections()
      ])
      warehouses.value = warehouseRows
      projects.value = projectRows
      sections.value = sectionRows
    } catch {
      optionError.value = true
    }
  }
  async function cancel(row: WmsCountPlan): Promise<void> {
    if (workingId.value) return
    try {
      await confirmAction(
        `确定取消盘点方案 ${row.documentNo}？已录入的实盘记录会保留供审计。`,
        '取消盘点',
        {
          type: 'warning',
          confirmButtonText: '确定取消',
          cancelButtonText: '返回'
        }
      )
      workingId.value = row.id
      await cancelWmsCountPlan(row.id)
      await refresh()
    } catch {
      // 取消确认与 API 错误由对应组件处理。
    } finally {
      workingId.value = undefined
    }
  }
  function columnsFactory(): ColumnOption<CountPlanListRow>[] {
    return [
      {
        prop: 'documentNo',
        label: '盘点方案',
        minWidth: 220,
        fixed: 'left',
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.documentNo}
            secondary={row.snapshotAt?.replace('T', ' ').slice(0, 19)}
            icon="ri:survey-line"
          />
        )
      },
      {
        prop: 'status',
        label: '状态',
        width: 105,
        formatter: (row) => (
          <ElTag
            type={
              row.status === 'posted' ? 'success' : row.status === 'counting' ? 'warning' : 'info'
            }
            size="small"
          >
            {statusLabels[row.status]}
          </ElTag>
        )
      },
      {
        prop: 'warehouse',
        label: '盘点仓库',
        minWidth: 190,
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.warehouse?.warehouseName || '仓库'}
            secondary={row.warehouse?.warehouseCode || ''}
          />
        )
      },
      {
        prop: 'scopeProjectId',
        label: '项目 / 施工号范围',
        minWidth: 210,
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={projectName(row.scopeProjectId)}
            secondary={row.scopeConstructionNo || '全部施工号'}
          />
        )
      },
      ...(displayMode.value === 'line'
        ? [
            {
              prop: 'detailMaterialCode',
              label: '物料编码',
              minWidth: 145,
              formatter: (row: CountPlanListRow) => row.detailLine?.material?.materialCode || '—'
            },
            {
              prop: 'detailMaterialName',
              label: '物料名称',
              minWidth: 180,
              formatter: (row: CountPlanListRow) => row.detailLine?.material?.materialName || '—'
            },
            {
              prop: 'detailBatchNo',
              label: '批号',
              minWidth: 130,
              formatter: (row: CountPlanListRow) => row.detailLine?.batch?.batchNo || '—'
            },
            {
              prop: 'detailExpectedQuantity',
              label: '账存数量',
              width: 120,
              align: 'right' as const,
              formatter: (row: CountPlanListRow) => row.detailLine?.expectedQuantity ?? 0
            },
            {
              prop: 'detailCountedQuantity',
              label: '实盘数量',
              width: 120,
              align: 'right' as const,
              formatter: (row: CountPlanListRow) => row.detailLine?.countedQuantity ?? '待盘点'
            },
            {
              prop: 'detailVariance',
              label: '差异数量',
              width: 120,
              align: 'right' as const,
              formatter: (row: CountPlanListRow) =>
                row.detailLine?.countedQuantity == null
                  ? '—'
                  : row.detailLine.countedQuantity - row.detailLine.expectedQuantity
            }
          ]
        : []),
      { prop: 'remark', label: '说明', minWidth: 210, showOverflowTooltip: true },
      {
        prop: 'postedAt',
        label: '记账时间',
        minWidth: 165,
        formatter: (row) => row.postedAt?.replace('T', ' ').slice(0, 19) || '—'
      },
      {
        prop: 'operation',
        label: '操作',
        width: 165,
        fixed: 'right',
        formatter: (row) => (
          <BusinessTableRowActions>
            <ArtButtonTable
              type="edit"
              icon="ri:file-search-line"
              label="盘点表"
              permission="WmsCount:View"
              onClick={() => openDetail(row)}
            />
            {row.status === 'counting' ? (
              <ArtButtonTable
                type="delete"
                label="取消盘点"
                permission="WmsCount:Create"
                disabled={Boolean(workingId.value)}
                onClick={() => cancel(row)}
              />
            ) : null}
          </BusinessTableRowActions>
        )
      }
    ]
  }
  onMounted(() => void loadOptions())
</script>
