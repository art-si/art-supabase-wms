<template>
  <ArtPermissionGuard :permission="permission.View" :resource-name="title">
    <div class="business-workspace-page art-full-height min-w-0">
      <BusinessWorkspaceHeader
        eyebrow="INVENTORY COUNT ADJUSTMENT"
        :title="title"
        :description="description"
        :icon="kind === 'gain' ? 'ri:add-box-line' : 'ri:indeterminate-circle-line'"
        density="compact"
        :tags="[
          { label: '三位月流水', type: 'primary' },
          { label: '账存与实盘', type: 'success' },
          { label: '数量单元格提示', type: 'warning' }
        ]"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>
      <ArtTableQuery
        ref="tableRef"
        v-model="search"
        :api-fn="fetchRows"
        :search-items="searchItems"
        :columns-factory="columnsFactory"
        :header-actions="headerActions"
        header-actions-placement="workspace"
        :search-bar-props="{ span: 5, labelWidth: 76 }"
        :table-props="{
          rowKey: displayMode === 'document' ? 'documentId' : 'lineId',
          spanMethod: mergeDocumentCells,
          tableLayout: 'fixed',
          cellClassName,
          emptyText: `当前范围暂无${title}`,
          emptyDescription: `新建${title}并填写物料、盘点数量及仓储信息。`
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
      <CountAdjustmentDrawer ref="drawerRef" :kind="kind" @success="refresh" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { ElMessage, ElTag } from 'element-plus'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtTableQuery, {
    type ArtTableQueryExpose,
    type ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtButtonMore, {
    type ButtonMoreItem
  } from '@/components/core/forms/art-button-more/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type { ColumnOption } from '@/types'
  import {
    documentGroupSpan,
    groupDocumentLines,
    loadAllLinePages
  } from '@/utils/business/document-detail-list'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import {
    changeWmsCountAdjustmentStatus,
    fetchWmsCountAdjustmentPage,
    type WmsCountAdjustmentKind,
    type WmsCountAdjustmentRow,
    type WmsStockQuery
  } from '@wms/api'
  import CountAdjustmentDrawer from './modules/count-adjustment-drawer.vue'

  const props = defineProps<{ kind: WmsCountAdjustmentKind }>()
  const { confirmAction } = useArtFeedback()
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const { defaultWriteTenantId } = useTenantScopeFormPolicy()
  const tableRef = ref<ArtTableQueryExpose>()
  const displayMode = ref<'document' | 'line'>('document')
  const visibleRows = ref<WmsCountAdjustmentRow[]>([])
  const lineProperties = new Set([
    'materialCode',
    'materialDescription',
    'specificationModel',
    'projectName',
    'constructionNo',
    'inventoryUnitName',
    'bookQuantity',
    'countedQuantity',
    'varianceQuantity',
    'unitPrice',
    'amount',
    'batchNo',
    'warehouseName',
    'binName',
    'stockType',
    'stockStatus',
    'keeperName',
    'gift'
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
  const drawerRef = ref<InstanceType<typeof CountAdjustmentDrawer>>()
  const workingId = ref<string>()
  const title = computed(() => (props.kind === 'gain' ? '盘盈单' : '盘亏单'))
  const description = computed(() =>
    props.kind === 'gain'
      ? '登记独立盘盈单；盘点方案自动生成的盘盈凭证可在库存盘点详情查看。'
      : '登记独立盘亏单；盘点方案自动生成的盘亏凭证可在库存盘点详情查看。'
  )
  const permissionByKind = {
    gain: {
      View: 'WmsCountGain:View',
      Add: 'WmsCountGain:Add',
      Copy: 'WmsCountGain:Copy',
      Edit: 'WmsCountGain:Edit',
      Delete: 'WmsCountGain:Delete',
      Import: 'WmsCountGain:Import',
      Export: 'WmsCountGain:Export',
      Submit: 'WmsCountGain:Submit',
      Approve: 'WmsCountGain:Approve'
    },
    loss: {
      View: 'WmsCountLoss:View',
      Add: 'WmsCountLoss:Add',
      Copy: 'WmsCountLoss:Copy',
      Edit: 'WmsCountLoss:Edit',
      Delete: 'WmsCountLoss:Delete',
      Import: 'WmsCountLoss:Import',
      Export: 'WmsCountLoss:Export',
      Submit: 'WmsCountLoss:Submit',
      Approve: 'WmsCountLoss:Approve'
    }
  } as const
  const permission = computed(() => permissionByKind[props.kind])
  const statusLabels = { draft: '暂存', submitted: '已提交', approved: '已审核' } as const
  const stockTypeLabels: Record<string, string> = {
    normal: '普通',
    gift: '赠品',
    asset: '资产',
    vmi: 'VMI',
    consignment: '委托代销',
    outsourced: '委托加工',
    internal: '内协加工',
    bonded: '保税'
  }
  const stockStatusLabels: Record<string, string> = {
    available: '可用',
    scrap: '报废',
    defective: '不良',
    frozen: '冻结'
  }
  const search = reactive({
    status: '',
    projectName: '',
    materialDescription: '',
    materialCode: '',
    keyword: ''
  })
  const searchItems: SearchFormItem[] = [
    { label: '展示方式', key: 'displayMode', type: 'text' },
    {
      label: '单据状态',
      key: 'status',
      type: 'select',
      props: {
        clearable: true,
        placeholder: '全部状态',
        options: Object.entries(statusLabels).map(([value, label]) => ({ value, label }))
      }
    },
    {
      label: '项目名称',
      key: 'projectName',
      type: 'input',
      props: { clearable: true, placeholder: '项目名称' }
    },
    {
      label: '物料描述',
      key: 'materialDescription',
      type: 'input',
      props: { clearable: true, placeholder: '物料描述' }
    },
    {
      label: '物料编码',
      key: 'materialCode',
      type: 'input',
      props: { clearable: true, placeholder: '物料编码' }
    },
    {
      label: '单据编号',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '单据编号' }
    }
  ]
  async function fetchRows(query: WmsStockQuery) {
    const fetchPage = (page: WmsStockQuery) =>
      fetchWmsCountAdjustmentPage(props.kind, {
        ...page,
        tenantId: effectiveTenantId.value || undefined
      })
    if (displayMode.value === 'line') {
      const result = await fetchPage(query)
      visibleRows.value = result.data
      return result
    }
    visibleRows.value = []
    const lines = await loadAllLinePages(fetchPage, query)
    const documents = groupDocumentLines(lines, (line) => line.documentId).map(
      ({ first, lines: group }) => ({
        ...first,
        lineNo: group.length,
        materialCode: '',
        materialDescription: `共 ${group.length} 项物料`,
        bookQuantity: group.reduce((sum, line) => sum + Number(line.bookQuantity || 0), 0),
        countedQuantity: group.reduce((sum, line) => sum + Number(line.countedQuantity || 0), 0),
        varianceQuantity: group.reduce((sum, line) => sum + Number(line.varianceQuantity || 0), 0),
        amount: group.reduce((sum, line) => sum + Number(line.amount || 0), 0)
      })
    )
    return {
      data: documents.slice((query.current - 1) * query.size, query.current * query.size),
      total: documents.length
    }
  }
  async function refresh(): Promise<void> {
    await tableRef.value?.refreshUpdate()
  }
  function openCreate(): void {
    const tenantId = defaultWriteTenantId.value
    if (tenantId) void drawerRef.value?.handleOpen({ mode: 'create', tenantId })
    else ElMessage.warning('无法确定新增单据的目标租户，请刷新后重试')
  }
  async function openDocument(
    mode: 'view' | 'edit' | 'copy',
    row: WmsCountAdjustmentRow
  ): Promise<void> {
    await drawerRef.value?.handleOpen({
      mode,
      documentId: row.documentId,
      tenantId: row.tenantId
    })
  }
  async function transition(
    row: WmsCountAdjustmentRow,
    action: 'submit' | 'approve' | 'delete'
  ): Promise<void> {
    if (workingId.value) return
    const label = { submit: '提交', approve: '审核', delete: '删除' }[action]
    try {
      await confirmAction(`确定${label} ${row.documentNo}？`, `${label}${title.value}`, {
        type: action === 'delete' ? 'warning' : 'info',
        confirmButtonText: `确定${label}`
      })
      workingId.value = row.documentId
      await changeWmsCountAdjustmentStatus(row.documentId, action)
      await refresh()
    } catch {
      /* 取消和接口错误由组件处理。 */
    } finally {
      workingId.value = undefined
    }
  }
  function cellClassName({ column }: { column: { property?: string } }): string {
    return column.property === 'varianceQuantity' ? 'count-highlight-cell' : ''
  }
  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      type: 'add',
      label: `新增${title.value}`,
      permission: permission.value.Add,
      buttonProps: { plain: false },
      onClick: openCreate
    },
    {
      key: 'import',
      label: '导入',
      icon: 'ri:file-upload-line',
      permission: permission.value.Import,
      buttonProps: { type: 'success', plain: true },
      onClick: openCreate
    },
    {
      type: 'export',
      label: '导出当前范围',
      permission: permission.value.Export,
      buttonProps: { type: 'warning', plain: true },
      exportFilename: title.value,
      exportData: async () => (await fetchRows({ ...search, current: 1, size: 5000 })).data,
      exportColumns: [
        { title: '单据编号', key: 'documentNo' },
        { title: '业务日期', key: 'businessDate' },
        { title: '单据状态', key: 'status' },
        { title: '项目名称', key: 'projectName' },
        { title: '物料编码', key: 'materialCode' },
        { title: '物料描述', key: 'materialDescription' },
        { title: '账存数量', key: 'bookQuantity' },
        { title: '盘点数量', key: 'countedQuantity' },
        { title: `${title.value.slice(0, 2)}数量`, key: 'varianceQuantity' },
        { title: '金额', key: 'amount' }
      ]
    }
  ])
  function moreActions(row: WmsCountAdjustmentRow): ButtonMoreItem[] {
    return [
      { key: 'copy', label: '复制单据', icon: 'ri:file-copy-line', auth: permission.value.Copy },
      ...(row.status === 'draft'
        ? [
            { key: 'edit', label: '编辑单据', icon: 'ri:edit-line', auth: permission.value.Edit },
            {
              key: 'submit',
              label: '提交单据',
              icon: 'ri:send-plane-line',
              auth: permission.value.Submit
            },
            {
              key: 'delete',
              label: '删除单据',
              icon: 'ri:delete-bin-line',
              auth: permission.value.Delete,
              color: 'var(--el-color-danger)'
            }
          ]
        : []),
      ...(row.status === 'submitted'
        ? [
            {
              key: 'approve',
              label: '审核单据',
              icon: 'ri:checkbox-circle-line',
              auth: permission.value.Approve
            }
          ]
        : [])
    ]
  }
  function onMoreAction(item: ButtonMoreItem, row: WmsCountAdjustmentRow): void {
    if (item.key === 'copy' || item.key === 'edit') void openDocument(item.key, row)
    else if (item.key === 'submit' || item.key === 'approve' || item.key === 'delete')
      void transition(row, item.key)
  }
  function quantityText(value: number): string {
    const amount = props.kind === 'loss' ? -Math.abs(Number(value)) : Math.abs(Number(value))
    return amount.toFixed(4)
  }
  function columnsFactory(): ColumnOption<WmsCountAdjustmentRow>[] {
    const columns: ColumnOption<WmsCountAdjustmentRow>[] = [
      {
        prop: 'documentNo',
        label: '单据编号',
        fixed: 'left',
        minWidth: 185,
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.documentNo}
            secondary={`${displayMode.value === 'document' ? `共 ${row.lineNo} 项物料` : `第 ${row.lineNo} 行`} · ${row.documentTypeName}`}
            icon={props.kind === 'gain' ? 'ri:add-box-line' : 'ri:indeterminate-circle-line'}
          />
        )
      },
      { prop: 'businessDate', label: '业务日期', width: 112 },
      { prop: 'accountingDate', label: '记账日期', width: 112 },
      {
        prop: 'status',
        label: '单据状态',
        width: 98,
        formatter: (row) => (
          <ElTag
            size="small"
            type={
              row.status === 'approved'
                ? 'success'
                : row.status === 'submitted'
                  ? 'warning'
                  : 'info'
            }
          >
            {statusLabels[row.status]}
          </ElTag>
        )
      },
      { prop: 'businessTypeName', label: '业务类型', minWidth: 120 },
      { prop: 'materialCode', label: '物料编码', minWidth: 125 },
      { prop: 'materialDescription', label: '物料描述', minWidth: 180, showOverflowTooltip: true },
      { prop: 'specificationModel', label: '规格型号', minWidth: 125 },
      { prop: 'projectName', label: '项目名称', minWidth: 150, showOverflowTooltip: true },
      { prop: 'constructionNo', label: '施工号', minWidth: 110 },
      { prop: 'inventoryUnitName', label: '库存单位', width: 98 },
      { prop: 'bookQuantity', label: '账存数量(库存)', minWidth: 135, align: 'right' },
      { prop: 'countedQuantity', label: '盘点数量(库存)', minWidth: 135, align: 'right' },
      {
        prop: 'varianceQuantity',
        label: `${title.value.slice(0, 2)}数量(库存)`,
        minWidth: 135,
        align: 'right',
        formatter: (row) => (
          <span class="count-highlight-number">{quantityText(row.varianceQuantity)}</span>
        )
      },
      { prop: 'unitPrice', label: '单价(元)', width: 105, align: 'right' },
      { prop: 'amount', label: '金额(元)', width: 110, align: 'right' },
      { prop: 'batchNo', label: '批号', minWidth: 115 },
      { prop: 'warehouseName', label: '仓库', minWidth: 140 },
      { prop: 'binName', label: '仓位', minWidth: 115 },
      {
        prop: 'stockType',
        label: '库存类型',
        width: 105,
        formatter: (row) => stockTypeLabels[row.stockType] || row.stockType || '—'
      },
      {
        prop: 'stockStatus',
        label: '库存状态',
        width: 105,
        formatter: (row) => stockStatusLabels[row.stockStatus] || row.stockStatus || '—'
      },
      { prop: 'keeperName', label: '仓管员', minWidth: 105 },
      {
        prop: 'gift',
        label: '赠品',
        width: 76,
        align: 'center',
        formatter: (row) => (row.gift ? '✓' : '—')
      },
      {
        prop: 'operation',
        label: '操作',
        fixed: 'right',
        width: 112,
        formatter: (row) => (
          <BusinessTableRowActions>
            <ArtButtonTable
              type="view"
              label="查看"
              icon="ri:eye-line"
              permission={permission.value.View}
              onClick={() => openDocument('view', row)}
            />
            <ArtButtonMore
              list={moreActions(row)}
              trigger="click"
              onClick={(item: ButtonMoreItem) => onMoreAction(item, row)}
            />
          </BusinessTableRowActions>
        )
      }
    ]
    if (displayMode.value === 'line') return columns
    const detailOnly = new Set([
      'materialCode',
      'specificationModel',
      'projectName',
      'constructionNo',
      'inventoryUnitName',
      'unitPrice',
      'batchNo',
      'warehouseName',
      'binName',
      'stockType',
      'stockStatus',
      'keeperName',
      'gift'
    ])
    return columns.filter((column) => !detailOnly.has(String(column.prop)))
  }
</script>

<style scoped>
  :deep(td.el-table__cell.count-highlight-cell) {
    background-color: var(--el-color-warning-light-9) !important;
  }

  :deep(.count-highlight-number) {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: var(--el-color-danger);
  }
</style>
