<template>
  <ArtPermissionGuard permission="WmsAssembly:View" resource-name="库存组装">
    <div class="business-workspace-page art-full-height min-w-0">
      <BusinessWorkspaceHeader
        eyebrow="INVENTORY ASSEMBLY"
        title="库存组装"
        description="多个原料批次合并为一个成品批次，来源扣减、成品入库与项目施工号全程追溯。"
        icon="ri:apps-2-add-line"
        density="compact"
        :tags="[
          { label: '多组件组装', type: 'primary' },
          { label: '项目归属继承', type: 'success' },
          { label: 'SN 装配走 MES', type: 'info' }
        ]"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>
      <ElAlert v-if="optionError" type="warning" :closable="false" show-icon class="mb-3">
        筛选项加载失败。<ElButton link type="primary" @click="loadOptions">重新加载</ElButton>
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
          emptyText: '当前范围暂无库存组装单',
          emptyDescription: '选择至少两个来源组件，组装成品并记账后在此追溯。'
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
      <AssemblyDialog ref="dialogRef" @success="refresh" />
      <AssemblyDetailDrawer ref="detailRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
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
    fetchWmsAssemblyPage,
    fetchWmsAssemblyComponentsForDocuments,
    fetchWmsProjectSections,
    fetchWmsProjects,
    fetchWmsWarehouses,
    type WmsAssemblyDocument,
    type WmsAssemblyComponent,
    type WmsProject,
    type WmsProjectSection,
    type WmsStockQuery,
    type WmsWarehouse
  } from '@wms/api'
  import AssemblyDialog from './modules/assembly-dialog.vue'
  import AssemblyDetailDrawer from './modules/assembly-detail-drawer.vue'

  defineOptions({ name: 'WmsAssembly' })
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const tableRef = ref<ArtTableQueryExpose>()
  const displayMode = ref<'document' | 'line'>('document')
  type AssemblyListRow = WmsAssemblyDocument & {
    detailRowId?: string
    detailLine?: WmsAssemblyComponent
    detailGroupStart?: boolean
  }
  const visibleRows = ref<AssemblyListRow[]>([])
  const lineProperties = new Set([
    'detailMaterialCode',
    'detailMaterialName',
    'detailBatchNo',
    'detailQuantity',
    'detailUnitCost'
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
  const dialogRef = ref<InstanceType<typeof AssemblyDialog>>()
  const detailRef = ref<InstanceType<typeof AssemblyDetailDrawer>>()
  const warehouses = ref<WmsWarehouse[]>([])
  const projects = ref<WmsProject[]>([])
  const sections = ref<WmsProjectSection[]>([])
  const optionError = ref(false)
  const search = reactive({ warehouseId: '', projectId: '', constructionNo: '', keyword: '' })
  const filterTenantId = computed(() => effectiveTenantId.value || undefined)
  const headerActions: ArtTableQueryHeaderAction[] = [
    {
      permission: 'WmsAssembly:Post',
      type: 'add',
      label: '办理组装',
      buttonProps: { plain: false },
      disabled: () => optionError.value,
      onClick: () => openCreate()
    }
  ]
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
      label: '项目',
      key: 'projectId',
      type: 'select',
      props: {
        clearable: true,
        filterable: true,
        placeholder: '全部项目',
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
      label: '组装单号',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '输入组装单号' }
    }
  ])
  function projectName(id: string | null): string {
    return id ? projects.value.find((row) => row.id === id)?.projectName || '历史项目' : '公共库存'
  }
  async function fetchRows(query: WmsStockQuery) {
    const fetchPage = (page: WmsStockQuery) =>
      fetchWmsAssemblyPage({ ...page, tenantId: filterTenantId.value })
    if (displayMode.value === 'document') {
      visibleRows.value = []
      return fetchPage(query)
    }
    const documents = await loadAllLinePages(fetchPage, query)
    const components = await fetchWmsAssemblyComponentsForDocuments(
      documents.map((document) => document.id)
    )
    const componentsByDocument = new Map<string, WmsAssemblyComponent[]>()
    for (const component of components) {
      const group = componentsByDocument.get(component.assemblyId) || []
      group.push(component)
      componentsByDocument.set(component.assemblyId, group)
    }
    const rows = expandDocumentLines(
      documents,
      (document) => componentsByDocument.get(document.id) || [],
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
    void dialogRef.value?.handleOpen({ tenantId: filterTenantId.value, projects: projects.value })
  }
  function openDetail(row: WmsAssemblyDocument): void {
    void detailRef.value?.handleOpen(row, projectName(row.projectId))
  }
  async function refresh(): Promise<void> {
    await tableRef.value?.refreshUpdate()
  }
  async function loadOptions(): Promise<void> {
    optionError.value = false
    try {
      ;[warehouses.value, projects.value, sections.value] = await Promise.all([
        fetchWmsWarehouses(),
        fetchWmsProjects(),
        fetchWmsProjectSections()
      ])
    } catch {
      optionError.value = true
    }
  }
  function columnsFactory(): ColumnOption<AssemblyListRow>[] {
    return [
      {
        prop: 'documentNo',
        label: '组装单',
        minWidth: 195,
        fixed: 'left',
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.documentNo}
            secondary={row.createdAt?.replace('T', ' ').slice(0, 19)}
            icon="ri:apps-2-add-line"
          />
        )
      },
      {
        prop: 'warehouseId',
        label: '仓库',
        minWidth: 155,
        formatter: (row) => row.warehouse?.warehouseName || row.warehouse?.warehouseCode || '—'
      },
      {
        prop: 'targetMaterialId',
        label: '成品物料 / 批号',
        minWidth: 230,
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.targetMaterial?.materialName || '物料'}
            secondary={row.targetBatch?.batchNo || row.targetMaterial?.materialCode || ''}
          />
        )
      },
      { prop: 'targetQuantity', label: '成品数量', minWidth: 110, align: 'right' },
      {
        prop: 'targetAreaSqm',
        label: '面积（㎡）',
        minWidth: 110,
        align: 'right',
        formatter: (row) => row.targetAreaSqm ?? '—'
      },
      {
        prop: 'projectId',
        label: '项目 / 施工号',
        minWidth: 195,
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={projectName(row.projectId)}
            secondary={row.constructionNo || '非项目库存'}
          />
        )
      },
      ...(displayMode.value === 'line'
        ? [
            {
              prop: 'detailMaterialCode',
              label: '组件编码',
              minWidth: 145,
              formatter: (row: AssemblyListRow) => row.detailLine?.material?.materialCode || '—'
            },
            {
              prop: 'detailMaterialName',
              label: '组件名称',
              minWidth: 185,
              formatter: (row: AssemblyListRow) => row.detailLine?.material?.materialName || '—'
            },
            {
              prop: 'detailBatchNo',
              label: '来源批号',
              minWidth: 135,
              formatter: (row: AssemblyListRow) => row.detailLine?.sourceBatch?.batchNo || '—'
            },
            {
              prop: 'detailQuantity',
              label: '组件数量',
              width: 115,
              align: 'right' as const,
              formatter: (row: AssemblyListRow) => row.detailLine?.quantity ?? 0
            },
            {
              prop: 'detailUnitCost',
              label: '组件成本',
              width: 120,
              align: 'right' as const,
              formatter: (row: AssemblyListRow) => row.detailLine?.unitCost ?? '—'
            }
          ]
        : []),
      { prop: 'remark', label: '组装说明', minWidth: 185, showOverflowTooltip: true },
      {
        prop: 'operation',
        label: '操作',
        width: 90,
        fixed: 'right',
        formatter: (row) => (
          <BusinessTableRowActions>
            <ArtButtonTable
              type="view"
              icon="ri:file-search-line"
              label="详情"
              permission="WmsAssembly:View"
              onClick={() => openDetail(row)}
            />
          </BusinessTableRowActions>
        )
      }
    ]
  }
  onMounted(() => void loadOptions())
</script>
