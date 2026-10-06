<template>
  <ArtPermissionGuard :permission="permissions.View" :resource-name="title">
    <div class="production-material-workspace business-workspace-page art-full-height min-w-0">
      <BusinessWorkspaceHeader
        eyebrow="PRODUCTION INVENTORY"
        :title="title"
        :description="description"
        :icon="config.icon"
        density="compact"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>
      <ArtTableQuery
        ref="tableRef"
        :model-value="search"
        @update:model-value="replaceReactiveModel(search, $event)"
        :api-fn="fetchRows"
        :search-items="searchItems"
        :columns-factory="columnsFactory"
        :columns-context-key="displayMode"
        :header-actions="headerActions"
        header-actions-placement="workspace"
        :search-bar-props="{ span: 6, labelWidth: 104 }"
        :table-props="{
          rowKey: 'lineId',
          spanMethod: mergeDocumentCells,
          tableLayout: 'fixed',
          cellClassName: quantityCellClass,
          emptyText: `当前范围暂无${title}`,
          emptyDescription: '新增单据并选择仓库、生产工单和物料明细。'
        }"
        focusable
        @selection-change="onSelectionChange"
      >
        <template #search-displayMode>
          <ElRadioGroup v-model="displayMode" aria-label="单据列表展示方式" @change="refresh">
            <ElRadioButton label="document" value="document">按单据</ElRadioButton>
            <ElRadioButton label="line" value="line">按明细</ElRadioButton>
          </ElRadioGroup>
        </template>
      </ArtTableQuery>
      <ProductionMaterialDrawer ref="drawerRef" :kind="kind" @success="refresh" />
      <MasterDataDeleteGuard ref="deleteGuardRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { replaceReactiveModel } from '@/utils/form/model'
  import { formatUnitDisplayName } from '@/utils/business/unit-display'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { formatWithDayjs } from '@/utils/time'
  import { ElMessage, ElTag } from 'element-plus'
  import { uniq } from 'lodash-es'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
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
    changeWmsProductionMaterialStatus,
    fetchWmsProductionMaterialPage,
    pushWmsProductionMaterial,
    type WmsProductionMaterialKind,
    type WmsProductionMaterialListRow
  } from '@wms/api'
  import ProductionMaterialDrawer from './production-material-drawer.vue'
  import { productionDocumentConfig } from './production-document-config'

  const commonDocumentReviewStatusOptions = useDictionaryOptions('commonDocumentReviewStatus')

  const props = defineProps<{ kind: WmsProductionMaterialKind }>()
  const { confirmAction } = useArtFeedback()
  const { deleteGuardRef, inspectDeleteReferences } = useRecordDeleteGuard(
    'wms_production_material_document',
    productionDocumentConfig[props.kind].title
  )
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const tableRef = ref<ArtTableQueryExpose>()
  const displayMode = ref<'document' | 'line'>('document')
  const visibleRows = ref<WmsProductionMaterialListRow[]>([])
  const lineProperties = new Set([
    'materialStatus',
    'workOrderQuantity',
    'requestedQuantity',
    'actualQuantity',
    'materialDescription',
    'materialCode',
    'specificationModel',
    'inventoryUnitName',
    'warehouseName',
    'batchNo'
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
  const drawerRef = ref<InstanceType<typeof ProductionMaterialDrawer>>()
  const workingId = ref<string>()
  const selectedDocumentIds = ref<string[]>([])
  const config = computed(() => productionDocumentConfig[props.kind])
  const title = computed(() => config.value.title)
  const description = computed(
    () =>
      ({
        issue: '按生产工单 BOM 或库存批次登记领料；审核后下推并核销库存。',
        return: '按生产工单和项目登记退料；审核后下推入库。',
        finished_inbound: '从生产工单、已确认排包单或成品物料建立明细，审核后办理完工入库。',
        finished_return: '从已过账的完工入库明细选单，审核后办理退库。'
      })[props.kind]
  )
  const permissions = computed(() => config.value.permissions)
  const search = reactive({
    status: '',
    documentNo: '',
    workOrderNo: '',
    projectName: '',
    materialDescription: '',
    materialCode: '',
    applicantName: ''
  })
  const searchItems = computed<SearchFormItem[]>(() => [
    { label: '展示方式', key: 'displayMode', type: 'text' },
    {
      label: '单据状态',
      key: 'status',
      type: 'select',
      props: {
        clearable: true,
        placeholder: '全部状态',
        options: commonDocumentReviewStatusOptions
      }
    },
    {
      label: config.value.numberLabel,
      key: 'documentNo',
      type: 'input',
      props: { clearable: true }
    },
    { label: '生产工单', key: 'workOrderNo', type: 'input', props: { clearable: true } },
    { label: '项目名称', key: 'projectName', type: 'input', props: { clearable: true } },
    { label: '物料描述', key: 'materialDescription', type: 'input', props: { clearable: true } },
    { label: '物料编码', key: 'materialCode', type: 'input', props: { clearable: true } },
    ...(!config.value.finished
      ? [
          {
            label: '领料申请人',
            key: 'applicantName',
            type: 'input' as const,
            props: { clearable: true }
          }
        ]
      : [])
  ])
  async function fetchRows(query: {
    exportAll?: boolean
    status?: string
    documentNo?: string
    workOrderNo?: string
    projectName?: string
    materialDescription?: string
    materialCode?: string
    applicantName?: string
    current: number
    size: number
  }) {
    const exportAll = query.exportAll === true
    const fetchPage = (page: typeof query) =>
      fetchWmsProductionMaterialPage({
        ...page,
        kind: props.kind,
        tenantId: effectiveTenantId.value || undefined
      })
    if (displayMode.value === 'line') {
      if (exportAll) {
        const data = await loadAllLinePages(fetchPage, query)
        return { data, total: data.length }
      }
      const result = await fetchPage(query)
      visibleRows.value = result.data
      return result
    }
    if (!exportAll) visibleRows.value = []
    const hasMaterialFilter = Boolean(
      query.materialCode?.trim() || query.materialDescription?.trim()
    )
    const matchingDocumentIds = hasMaterialFilter
      ? new Set((await loadAllLinePages(fetchPage, query)).map((line) => line.documentId))
      : null
    const lines = await loadAllLinePages(fetchPage, {
      ...query,
      materialCode: undefined,
      materialDescription: undefined
    })
    const documents = groupDocumentLines(
      matchingDocumentIds
        ? lines.filter((line) => matchingDocumentIds.has(line.documentId))
        : lines,
      (line) => line.documentId
    ).map(({ first, lines: group }) => ({
      ...first,
      lineNo: group.length,
      materialCode: '',
      materialDescription: `共 ${group.length} 项物料`
    }))
    return {
      data: (exportAll
        ? documents
        : documents.slice((query.current - 1) * query.size, query.current * query.size)
      ).map((row) => ({
        ...row,
        inventoryUnitName: formatUnitDisplayName(row.inventoryUnitName)
      })),
      total: documents.length
    }
  }
  async function refresh(): Promise<void> {
    selectedDocumentIds.value = []
    await tableRef.value?.refreshUpdate()
  }
  function onSelectionChange(rows: Record<string, unknown>[]): void {
    selectedDocumentIds.value = uniq(
      rows.flatMap((row) => (typeof row.documentId === 'string' ? [row.documentId] : []))
    )
  }
  function quantityCellClass({ column }: { column: { property?: string } }): string {
    return config.value.negative &&
      (column.property === 'requestedQuantity' ||
        column.property === 'actualQuantity' ||
        (props.kind === 'finished_return' && column.property === 'workOrderQuantity'))
      ? 'wms-production-negative-cell'
      : ''
  }
  async function openDocument(mode: 'view' | 'edit' | 'copy', documentId: string): Promise<void> {
    try {
      await drawerRef.value?.handleOpen({ mode, documentId })
    } catch {
      ElMessage.error('单据加载失败，请重试')
    }
  }
  async function transition(
    row: WmsProductionMaterialListRow,
    action: 'submit' | 'approve' | 'delete' | 'close' | 'void'
  ): Promise<void> {
    if (workingId.value) return
    const label = {
      submit: '提交',
      approve: '审核',
      delete: '删除',
      close: '关闭',
      void: '作废'
    }[action]
    const resources = [{ id: row.documentId, label: row.documentNo }]
    workingId.value = row.documentId
    try {
      if (action === 'delete' && (await inspectDeleteReferences(resources))) return
      await confirmAction(`确定${label}${row.documentNo}？`, `${label}${title.value}`, {
        type: action === 'delete' || action === 'void' ? 'warning' : 'info',
        confirmButtonText: `确定${label}`
      })
      await changeWmsProductionMaterialStatus(row.documentId, action)
      await refresh()
    } catch (error) {
      if (action === 'delete' && error !== 'cancel' && error !== 'close') {
        await inspectDeleteReferences(resources)
      }
      // 确认取消与接口错误分别由弹窗和 API 层处理。
    } finally {
      workingId.value = undefined
    }
  }
  async function push(documentId: string, lineId?: string): Promise<void> {
    if (workingId.value) return
    try {
      await confirmAction(
        lineId ? '确定下推这一行并更新库存？' : '确定下推未处理的全部明细并更新库存？',
        `下推${title.value}`,
        { type: 'warning', confirmButtonText: '确定下推' }
      )
      workingId.value = documentId
      await pushWmsProductionMaterial(documentId, lineId)
      await refresh()
    } catch {
      // 确认取消与接口错误分别由弹窗和 API 层处理。
    } finally {
      workingId.value = undefined
    }
  }
  async function pushSelected(): Promise<void> {
    if (!selectedDocumentIds.value.length) {
      ElMessage.warning('请先勾选已审核单据')
      return
    }
    for (const id of [...selectedDocumentIds.value]) await push(id)
  }
  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      type: 'add',
      label: `新增${title.value}`,
      permission: permissions.value.Add,
      buttonProps: { plain: false },
      onClick: () => drawerRef.value?.handleOpen({ mode: 'create' })
    },
    {
      key: 'select',
      label: '选单',
      icon: 'ri:link-m',
      permission: permissions.value.Select,
      buttonProps: { type: 'primary', plain: true },
      onClick: () => drawerRef.value?.handleOpen({ mode: 'create', selectIntent: true })
    },
    ...(props.kind !== 'finished_return'
      ? [
          {
            key: 'import',
            label: '导入',
            icon: 'ri:file-upload-line',
            permission: permissions.value.Import,
            buttonProps: { type: 'success' as const, plain: true },
            onClick: () => drawerRef.value?.handleOpen({ mode: 'create', importIntent: true })
          }
        ]
      : []),
    {
      type: 'export',
      label: '导出当前范围',
      permission: permissions.value.Export,
      buttonProps: { type: 'warning', plain: true },
      exportFilename: title.value,
      exportData: async () =>
        (await fetchRows({ ...search, current: 1, size: 500, exportAll: true })).data,
      exportColumns: [
        { title: config.value.numberLabel, key: 'documentNo' },
        { title: '生产工单', key: 'workOrderNo' },
        { title: '单据类型', key: 'documentTypeName' },
        { title: '业务类型', key: 'businessTypeName' },
        { title: '业务日期', key: 'businessDate' },
        { title: '单据状态', key: 'status' },
        { title: '办理状态', key: 'materialStatus' },
        { title: '项目名称', key: 'projectName' },
        { title: '物料编码', key: 'materialCode' },
        { title: '物料描述', key: 'materialDescription' },
        ...(config.value.finished
          ? [{ title: '工单数量', key: 'workOrderQuantity' }]
          : [{ title: '申请数量', key: 'requestedQuantity' }]),
        { title: config.value.quantityLabel, key: 'actualQuantity' },
        ...(!config.value.finished ? [{ title: '领料申请人', key: 'applicantName' }] : [])
      ]
    },
    {
      key: 'push',
      label: config.value.finished ? (config.value.negative ? '退库过账' : '入库过账') : '下推',
      icon: 'ri:file-transfer-line',
      permission: permissions.value.Push,
      buttonProps: { type: 'info', plain: true },
      selectionRequired: true,
      onClick: pushSelected
    }
  ])
  function moreActions(row: WmsProductionMaterialListRow): ButtonMoreItem[] {
    return [
      { key: 'copy', label: '复制', icon: 'ri:file-copy-line', auth: permissions.value.Copy },
      ...(row.status === 'draft' && row.materialStatus === 'pending'
        ? [
            { key: 'edit', label: '编辑', icon: 'ri:edit-line', auth: permissions.value.Edit },
            {
              key: 'submit',
              label: '提交',
              icon: 'ri:send-plane-line',
              auth: permissions.value.Submit
            },
            {
              key: 'delete',
              label: '删除',
              icon: 'ri:delete-bin-line',
              auth: permissions.value.Delete,
              color: 'var(--el-color-danger)'
            }
          ]
        : []),
      ...(row.status === 'submitted' && row.materialStatus === 'pending'
        ? [
            {
              key: 'approve',
              label: '审核',
              icon: 'ri:checkbox-circle-line',
              auth: permissions.value.Approve
            }
          ]
        : []),
      ...(row.status === 'approved' && ['pending', 'partial'].includes(row.materialStatus)
        ? [
            {
              key: 'push',
              label: config.value.finished
                ? config.value.negative
                  ? '退库过账'
                  : '入库过账'
                : displayMode.value === 'line'
                  ? '下推此行'
                  : '下推此单',
              icon: 'ri:file-transfer-line',
              auth: permissions.value.Push
            },
            {
              key: 'close',
              label: '关闭',
              icon: 'ri:close-circle-line',
              auth: permissions.value.Close
            }
          ]
        : []),
      ...(['draft', 'submitted'].includes(row.status) && row.materialStatus === 'pending'
        ? [{ key: 'void', label: '作废', icon: 'ri:forbid-line', auth: permissions.value.Void }]
        : [])
    ]
  }
  function onMoreAction(item: ButtonMoreItem, row: WmsProductionMaterialListRow): void {
    if (item.key === 'copy' || item.key === 'edit') {
      void openDocument(item.key, row.documentId)
    } else if (item.key === 'push') {
      void push(row.documentId, displayMode.value === 'line' ? row.lineId : undefined)
    } else if (
      item.key === 'submit' ||
      item.key === 'approve' ||
      item.key === 'delete' ||
      item.key === 'close' ||
      item.key === 'void'
    ) {
      void transition(row, item.key)
    }
  }
  const documentStatusLabels = {
    draft: '暂存',
    submitted: '已提交',
    approved: '已审核'
  }
  const materialStatusLabels = computed(() => ({
    pending: config.value.pendingLabel,
    partial: config.value.partialLabel,
    fulfilled: config.value.completedLabel,
    void: '作废',
    closed: '关闭'
  }))
  function columnsFactory(): ColumnOption<WmsProductionMaterialListRow>[] {
    const columns: ColumnOption<WmsProductionMaterialListRow>[] = [
      { type: 'selection', width: 48, fixed: 'left' },
      {
        prop: 'documentNo',
        label: config.value.numberLabel,
        minWidth: 230,
        fixed: 'left',
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.documentNo}
            secondary={`${displayMode.value === 'document' ? `共 ${row.lineNo} 项物料` : `第 ${row.lineNo} 行`} · ${formatWithDayjs(row.businessDate, 'MM-DD') ?? '--'}`}
            icon={config.value.icon}
          />
        )
      },
      {
        prop: 'status',
        label: '单据状态',
        width: 104,
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
            {documentStatusLabels[row.status]}
          </ElTag>
        )
      },
      {
        prop: 'materialStatus',
        label: config.value.finished
          ? '入退库状态'
          : props.kind === 'return'
            ? '退料状态'
            : '领料状态',
        width: 110,
        formatter: (row) => (
          <ElTag
            size="small"
            type={
              row.materialStatus === 'fulfilled'
                ? 'success'
                : row.materialStatus === 'partial'
                  ? 'warning'
                  : 'info'
            }
          >
            {materialStatusLabels.value[row.materialStatus]}
          </ElTag>
        )
      },
      ...(config.value.finished
        ? [
            {
              prop: 'workOrderQuantity',
              label: '工单数量',
              minWidth: 120,
              align: 'right' as const,
              formatter: (row: WmsProductionMaterialListRow) => (
                <strong class="tabular-nums">
                  {Number(row.workOrderQuantity || 0).toFixed(4)}
                </strong>
              )
            }
          ]
        : [
            {
              prop: 'requestedQuantity',
              label: '申请数量',
              minWidth: 120,
              align: 'right' as const,
              formatter: (row: WmsProductionMaterialListRow) => (
                <strong class="tabular-nums">{Number(row.requestedQuantity).toFixed(4)}</strong>
              )
            }
          ]),
      {
        prop: 'actualQuantity',
        label: config.value.quantityLabel,
        minWidth: 120,
        align: 'right',
        formatter: (row) => (
          <strong class="tabular-nums">{Number(row.actualQuantity).toFixed(4)}</strong>
        )
      },
      { prop: 'workOrderNo', label: '生产工单', minWidth: 155, showOverflowTooltip: true },
      { prop: 'projectName', label: '项目名称', minWidth: 165, showOverflowTooltip: true },
      {
        prop: 'materialDescription',
        label: '物料描述',
        minWidth: 210,
        showOverflowTooltip: true,
        formatter: (row) => row.materialDescription || row.materialName
      },
      ...(displayMode.value === 'line'
        ? [{ prop: 'materialCode', label: '物料编码', minWidth: 145, showOverflowTooltip: true }]
        : []),
      { prop: 'specificationModel', label: '规格型号', minWidth: 140, showOverflowTooltip: true },
      {
        prop: 'inventoryUnitName',
        label: '库存单位',
        width: 100,
        formatter: (row) => formatUnitDisplayName(row.inventoryUnitName)
      },
      ...(!config.value.finished
        ? [{ prop: 'applicantName', label: '申请人', minWidth: 110 }]
        : []),
      { prop: 'warehouseName', label: '仓库', minWidth: 145, showOverflowTooltip: true },
      { prop: 'batchNo', label: '批号', minWidth: 130, showOverflowTooltip: true },
      {
        prop: 'operation',
        label: '操作',
        width: 112,
        fixed: 'right',
        formatter: (row) => (
          <BusinessTableRowActions>
            <ArtButtonTable
              type="view"
              label="查看"
              permission={permissions.value.View}
              onClick={() => void openDocument('view', row.documentId)}
            />
            <ArtButtonMore
              list={moreActions(row)}
              trigger="click"
              onClick={(item) => onMoreAction(item, row)}
            />
          </BusinessTableRowActions>
        )
      }
    ]
    if (displayMode.value === 'line') return columns
    const detailOnly = new Set([
      'requestedQuantity',
      'actualQuantity',
      'materialStatus',
      'workOrderQuantity',
      'specificationModel',
      'inventoryUnitName',
      'warehouseName',
      'batchNo'
    ])
    return columns.filter((column) => !detailOnly.has(String(column.prop)))
  }
</script>

<style scoped>
  .production-material-workspace :deep(td.wms-production-negative-cell) {
    font-weight: 700;
    color: var(--el-color-danger);
    background: var(--el-color-warning-light-9);
  }
</style>
