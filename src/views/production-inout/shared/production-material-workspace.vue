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
        :selection-actions="[{ key: 'batch-inline', slot: 'batch-inline', rowAction: false }]"
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
        <template #batch-inline="context">
          <div class="production-batch-actions">
            <ElButton
              v-if="hasAuth(permissions.Delete)"
              type="danger"
              plain
              :disabled="
                !canBatchDelete(context.selectedRows) || Boolean(workingId) || bulkDeleting
              "
              @click="handleBatchCommand('delete', context)"
            >
              <span class="art-icon-label"><ArtSvgIcon icon="ri:delete-bin-line" />批量删除</span>
            </ElButton>
            <ElButton
              v-if="hasAuth(permissions.Approve)"
              plain
              :disabled="
                !canBatchApprove(context.selectedRows) || Boolean(workingId) || bulkDeleting
              "
              @click="handleBatchCommand('approve', context)"
            >
              <span class="art-icon-label"
                ><ArtSvgIcon icon="ri:checkbox-circle-line" />批量审核</span
              >
            </ElButton>
            <ElButton
              v-if="hasAuth(permissions.Close)"
              plain
              :disabled="!canBatchClose(context.selectedRows) || Boolean(workingId) || bulkDeleting"
              @click="handleBatchCommand('close', context)"
            >
              <span class="art-icon-label"><ArtSvgIcon icon="ri:close-circle-line" />批量关闭</span>
            </ElButton>
            <ElButton
              v-if="kind === 'return' && hasAuth(permissions.Withdraw)"
              plain
              :disabled="!canBatchWithdraw(context.selectedRows) || Boolean(workingId)"
              @click="withdrawSelected(context)"
            >
              <span class="art-icon-label"><ArtSvgIcon icon="ri:arrow-go-back-line" />撤回</span>
            </ElButton>
            <ElButton
              v-if="kind === 'issue' && hasAuth('WmsProductionReturn:Add')"
              plain
              :disabled="!canReturnSelection(context.selectedRows) || Boolean(workingId)"
              @click="openReturnFromSelection(context)"
            >
              <span class="art-icon-label"
                ><ArtSvgIcon icon="ri:arrow-go-back-line" />生成生产退料单</span
              >
            </ElButton>
            <ElButton
              v-if="hasAuth(permissions.Push)"
              type="primary"
              plain
              :disabled="!canBatchPost(context.selectedRows) || Boolean(workingId) || bulkDeleting"
              @click="pushSelected(context)"
            >
              <span class="art-icon-label"
                ><ArtSvgIcon
                  :icon="
                    kind === 'issue' || kind === 'finished_return'
                      ? 'ri:logout-box-line'
                      : 'ri:login-box-line'
                  "
                />{{
                  kind === 'issue'
                    ? '批量出库'
                    : kind === 'return'
                      ? '批量退库'
                      : kind === 'finished_inbound'
                        ? '批量入库'
                        : '批量退库'
                }}</span
              >
            </ElButton>
          </div>
        </template>
      </ArtTableQuery>
      <ProductionMaterialDrawer ref="drawerRef" :kind="kind" @success="refresh" />
      <ProductionMaterialDrawer
        v-if="kind === 'issue'"
        ref="returnDrawerRef"
        kind="return"
        @success="refresh"
      />
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
  import { useAuth } from '@/hooks/core/useAuth'
  import { useDocumentBulkDelete } from '@/hooks/business/useDocumentBulkDelete'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import { useRouteDocumentDrawer } from '@/hooks/core/useRouteDocumentDrawer'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtTableQuery, {
    type ArtTableQueryExpose,
    type ArtTableQueryHeaderAction,
    type ArtTableQueryHeaderActionContext
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
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
    fetchWmsProductionMaterialDocument,
    fetchWmsProductionMaterialPage,
    pushWmsProductionMaterial,
    type WmsProductionMaterialKind,
    type WmsProductionMaterialListRow
  } from '@wms/api'
  import ProductionMaterialDrawer from './production-material-drawer.vue'
  import { productionDocumentConfig } from './production-document-config'

  const commonDocumentReviewStatusOptions = useDictionaryOptions('commonDocumentReviewStatus')
  const displayModeOptions = useDictionaryOptions('commonDocumentDisplayMode')

  const props = defineProps<{ kind: WmsProductionMaterialKind }>()
  const { confirmAction } = useArtFeedback()
  const { hasAuth } = useAuth()
  const { deleteGuardRef, inspectDeleteReferences } = useRecordDeleteGuard(
    'wms_production_material_document',
    productionDocumentConfig[props.kind].title
  )
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const tableRef = ref<ArtTableQueryExpose>()
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
  const returnDrawerRef = ref<InstanceType<typeof ProductionMaterialDrawer>>()
  const workingId = ref<string>()
  const selectedDocumentIds = ref<string[]>([])
  const config = computed(() => productionDocumentConfig[props.kind])
  const title = computed(() => config.value.title)
  const description = computed(
    () =>
      ({
        issue: '按生产工单 BOM 或即时库存登记领料；审核后分批出库。',
        return: '按生产工单和项目登记退料；审核后下推入库。',
        finished_inbound:
          '从生产工单、已确认排包单或成品物料建立明细，按合格品、不合格品或报废品办理完工入库。',
        finished_return: '从已过账的完工入库明细选单，审核后办理退库。'
      })[props.kind]
  )
  const permissions = computed(() => config.value.permissions)
  const search = reactive({
    displayMode: 'document' as 'document' | 'line',
    status: '',
    documentNo: '',
    workOrderNo: '',
    projectName: '',
    materialDescription: '',
    materialCode: '',
    applicantName: ''
  })
  const displayMode = toRef(search, 'displayMode')
  watch(displayMode, () => void refresh())
  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '展示方式',
      key: 'displayMode',
      type: 'radioGroup',
      options: displayModeOptions,
      props: { optionType: 'button', 'aria-label': '单据列表展示方式' }
    },
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
            label: props.kind === 'issue' || props.kind === 'return' ? '领料人' : '领料申请人',
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
    tableRef.value?.clearSelection()
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
  useRouteDocumentDrawer({
    routeName: () => permissions.value.View.split(':')[0],
    canOpen: () => hasAuth(permissions.value.View),
    fetchDocument: async (id) => {
      const document = await fetchWmsProductionMaterialDocument(id)
      if (document.kind !== props.kind) throw new Error('单据类型不匹配')
      return document
    },
    openDocument: async (document) => {
      await drawerRef.value?.handleOpen({ mode: 'view', documentId: document.id, document })
    },
    onError: () => ElMessage.error(`${title.value}加载失败，请刷新后重试`)
  })
  async function transition(
    row: WmsProductionMaterialListRow,
    action: 'submit' | 'approve' | 'withdraw' | 'delete' | 'close' | 'void'
  ): Promise<void> {
    if (workingId.value || bulkDeleting.value) return
    const label = {
      submit: '提交',
      withdraw: '撤回提交',
      approve: '审核',
      delete: '删除',
      close: '关闭',
      void: '作废'
    }[action]
    const resources = [{ id: row.documentId, label: row.documentNo }]
    workingId.value = row.documentId
    try {
      if (action === 'delete' && (await inspectDeleteReferences(resources))) return
      await confirmAction(
        `${action === 'withdraw' ? '撤回后恢复暂存，可修改或删除；关联审批待办将取消。' : ''}确定${label}${row.documentNo}？`,
        `${label}${title.value}`,
        {
          type: action === 'delete' || action === 'void' ? 'warning' : 'info',
          confirmButtonText: `确定${label}`
        }
      )
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
    if (workingId.value || bulkDeleting.value) return
    try {
      const actionLabel =
        props.kind === 'issue' ? '出库' : props.kind === 'return' ? '退库' : '过账'
      await confirmAction(
        lineId
          ? `确定将这一行${actionLabel}并更新即时库存？`
          : `确定将未办理的全部明细${actionLabel}并更新即时库存？`,
        `${title.value}${actionLabel}`,
        { type: 'warning', confirmButtonText: `确定${actionLabel}` }
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
  async function pushSelected({ selectedRows }: ArtTableQueryHeaderActionContext): Promise<void> {
    if (workingId.value || bulkDeleting.value) return
    const targets =
      displayMode.value === 'line'
        ? selectedRows
            .filter((row) => Number(row.fulfilledQuantity || 0) === 0)
            .map((row) => ({ documentId: String(row.documentId), lineId: String(row.lineId) }))
        : uniq(
            selectedRows
              .filter((row) => row.materialStatus !== 'fulfilled')
              .map((row) => String(row.documentId))
          ).map((documentId) => ({
            documentId,
            lineId: undefined
          }))
    if (!targets.length) {
      ElMessage.warning('所选明细均已办理，请选择尚未办理的明细')
      return
    }
    let processed = 0
    try {
      const actionLabel =
        props.kind === 'issue' ? '出库' : config.value.negative ? '退库过账' : '入库过账'
      await confirmAction(
        `确定将选中的 ${targets.length} ${displayMode.value === 'line' ? '行明细' : '张单据'}批量${actionLabel}并更新即时库存？`,
        `批量${actionLabel}`,
        { type: 'warning', confirmButtonText: `确定${actionLabel}` }
      )
      workingId.value = targets[0].documentId
      for (const target of targets) {
        await pushWmsProductionMaterial(target.documentId, target.lineId)
        processed++
      }
    } catch {
      // 取消确认时没有业务写入，保留当前筛选和勾选状态。
    } finally {
      workingId.value = undefined
      if (processed) await refresh()
    }
  }
  function openReturn(documentId: string, lineIds?: string[]): void {
    void returnDrawerRef.value?.handleOpen({
      mode: 'create',
      sourceIssueDocumentId: documentId,
      sourceIssueLineIds: lineIds
    })
  }
  function canReturnSelection(rows: Record<string, unknown>[]): boolean {
    return rows.some(
      (row) => row.materialStatus === 'fulfilled' || Number(row.fulfilledQuantity || 0) > 0
    )
  }
  function canBatchDelete(rows: Record<string, unknown>[]): boolean {
    return (
      rows.length > 0 &&
      rows.every((row) => row.status === 'draft' && row.materialStatus === 'pending')
    )
  }
  function canBatchApprove(rows: Record<string, unknown>[]): boolean {
    return (
      rows.length > 0 &&
      rows.every((row) => row.status === 'submitted' && row.materialStatus === 'pending')
    )
  }
  function canBatchClose(rows: Record<string, unknown>[]): boolean {
    return (
      rows.length > 0 &&
      rows.every(
        (row) =>
          row.status === 'approved' && ['pending', 'partial'].includes(String(row.materialStatus))
      )
    )
  }
  function canBatchWithdraw(rows: Record<string, unknown>[]): boolean {
    return (
      rows.length > 0 &&
      rows.every((row) => row.status === 'submitted' && row.materialStatus === 'pending')
    )
  }
  function canBatchPost(rows: Record<string, unknown>[]): boolean {
    return (
      rows.length > 0 &&
      rows.every(
        (row) =>
          row.status === 'approved' &&
          ['pending', 'partial'].includes(String(row.materialStatus)) &&
          (displayMode.value !== 'line' || Number(row.fulfilledQuantity || 0) === 0)
      )
    )
  }
  function openReturnFromSelection({ selectedRows }: ArtTableQueryHeaderActionContext): void {
    const rows = selectedRows as WmsProductionMaterialListRow[]
    const documentIds = uniq(rows.map((row) => row.documentId))
    if (documentIds.length !== 1) {
      ElMessage.warning('请一次选择同一张领料单的明细；可分批生成退料单')
      return
    }
    openReturn(
      documentIds[0],
      displayMode.value === 'line' ? rows.map((row) => row.lineId) : undefined
    )
  }
  async function handleBatchCommand(
    command: string,
    context: ArtTableQueryHeaderActionContext
  ): Promise<void> {
    if (workingId.value || bulkDeleting.value) return
    if (command === 'delete') {
      const action = bulkDeleteAction()
      await action.onClick?.({ ...context, action })
      return
    }
    if (command !== 'approve' && command !== 'close') return
    const rows = context.selectedRows as WmsProductionMaterialListRow[]
    const valid =
      command === 'approve'
        ? rows.every((row) => row.status === 'submitted' && row.materialStatus === 'pending')
        : rows.every(
            (row) =>
              row.status === 'approved' && ['pending', 'partial'].includes(row.materialStatus)
          )
    if (!rows.length || !valid) {
      ElMessage.warning(
        command === 'approve'
          ? '仅可批量审核已提交且未办理的单据'
          : '仅可批量关闭已审核且未完成的单据'
      )
      return
    }
    const ids = uniq(rows.map((row) => row.documentId))
    let processed = 0
    try {
      await confirmAction(
        `确定${command === 'approve' ? '审核' : '关闭'}选中的 ${ids.length} 张单据？`,
        `批量${command === 'approve' ? '审核' : '关闭'}`,
        { confirmButtonText: '确定' }
      )
      workingId.value = ids[0]
      for (const id of ids) {
        await changeWmsProductionMaterialStatus(id, command)
        processed++
      }
    } catch {
      // 取消确认时不刷新列表。
    } finally {
      workingId.value = undefined
      if (processed) await refresh()
    }
  }
  async function withdrawSelected({
    selectedRows
  }: ArtTableQueryHeaderActionContext): Promise<void> {
    if (workingId.value || bulkDeleting.value) return
    const rows = selectedRows as WmsProductionMaterialListRow[]
    if (
      !rows.length ||
      rows.some((row) => row.status !== 'submitted' || row.materialStatus !== 'pending')
    ) {
      ElMessage.warning('仅可撤回已提交且未退库的单据')
      return
    }
    const ids = uniq(rows.map((row) => row.documentId))
    let processed = 0
    try {
      await confirmAction(`确定撤回选中的 ${ids.length} 张生产退料单？`, '撤回生产退料单', {
        confirmButtonText: '确定撤回'
      })
      workingId.value = ids[0]
      for (const id of ids) {
        await changeWmsProductionMaterialStatus(id, 'withdraw')
        processed++
      }
    } catch {
      // 取消确认时不刷新列表。
    } finally {
      workingId.value = undefined
      if (processed) await refresh()
    }
  }
  const { bulkDeleteAction, bulkDeleting } = useDocumentBulkDelete({
    permission: () => permissions.value.Delete,
    resourceLabel: () => title.value,
    idKey: 'documentId',
    busy: () => Boolean(workingId.value),
    inspect: inspectDeleteReferences,
    remove: (id) => changeWmsProductionMaterialStatus(id, 'delete'),
    refresh,
    clearSelection: () => tableRef.value?.clearSelection(),
    canDelete: (row) => row.materialStatus === 'pending'
  })
  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      type: 'add',
      label: `新增${title.value}`,
      permission: permissions.value.Add,
      buttonProps: { plain: false },
      onClick: () => drawerRef.value?.handleOpen({ mode: 'create' })
    },
    ...(props.kind !== 'return'
      ? [
          {
            key: 'select',
            label: '选单',
            icon: 'ri:file-list-3-line',
            permission: permissions.value.Select,
            buttonProps: { type: 'primary' as const, plain: true },
            onClick: () => drawerRef.value?.handleOpen({ mode: 'create', selectIntent: true })
          }
        ]
      : []),
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
        (await fetchRows({ ...search, current: 1, size: 500, exportAll: true })).data.map(
          (row) => ({
            ...row,
            status:
              commonDocumentReviewStatusOptions.find((option) => option.value === row.status)
                ?.label || row.status,
            materialStatus: materialStatusLabels.value[row.materialStatus] || row.materialStatus
          })
        ),
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
        ...(!config.value.finished
          ? [
              {
                title: props.kind === 'issue' || props.kind === 'return' ? '领料人' : '领料申请人',
                key: 'applicantName'
              }
            ]
          : [])
      ]
    }
  ])
  function moreActions(row: WmsProductionMaterialListRow): ButtonMoreItem[] {
    return [
      { key: 'copy', label: '复制', icon: 'ri:file-copy-line', auth: permissions.value.Copy },
      ...(props.kind === 'issue' &&
      (displayMode.value === 'document'
        ? row.materialStatus === 'partial' || row.materialStatus === 'fulfilled'
        : Number(row.fulfilledQuantity) > 0)
        ? [
            {
              key: 'return',
              label: '生成生产退料单',
              icon: 'ri:arrow-go-back-line',
              auth: 'WmsProductionReturn:Add'
            }
          ]
        : []),
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
              key: 'withdraw',
              label: props.kind === 'return' ? '撤回' : '撤回提交',
              icon: 'ri:arrow-go-back-line',
              auth: permissions.value.Withdraw
            },
            {
              key: 'approve',
              label: '审核',
              icon: 'ri:checkbox-circle-line',
              auth: permissions.value.Approve
            }
          ]
        : []),
      ...(row.status === 'approved' &&
      ['pending', 'partial'].includes(row.materialStatus) &&
      (displayMode.value !== 'line' || !row.fulfilledQuantity)
        ? [
            {
              key: 'push',
              label: config.value.finished
                ? config.value.negative
                  ? '退库过账'
                  : '入库过账'
                : props.kind === 'issue'
                  ? '出库'
                  : props.kind === 'return'
                    ? '退库'
                    : displayMode.value === 'line'
                      ? '下推此行'
                      : '下推此单',
              icon:
                props.kind === 'issue' || props.kind === 'finished_return'
                  ? 'ri:logout-box-line'
                  : 'ri:login-box-line',
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
    } else if (item.key === 'return') {
      openReturn(row.documentId, displayMode.value === 'line' ? [row.lineId] : undefined)
    } else if (
      item.key === 'submit' ||
      item.key === 'approve' ||
      item.key === 'withdraw' ||
      item.key === 'delete' ||
      item.key === 'close' ||
      item.key === 'void'
    ) {
      void transition(row, item.key)
    }
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
        prop: 'documentTypeName',
        label: '单据类型',
        minWidth: 160,
        showOverflowTooltip: true
      },
      { prop: 'businessTypeName', label: '业务类型', minWidth: 140, showOverflowTooltip: true },
      {
        prop: 'status',
        label: '单据状态',
        width: 104,
        formatter: (row) => (
          <ArtDictDisplay dictCode="commonDocumentReviewStatus" value={row.status} display="tag" />
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
        ? [
            {
              prop: 'applicantName',
              label: props.kind === 'issue' || props.kind === 'return' ? '领料人' : '申请人',
              minWidth: 110
            }
          ]
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
  .production-material-workspace :deep(.art-table-query__selection-bar),
  .production-material-workspace :deep(.art-table-query__selection-actions) {
    flex-wrap: nowrap;
  }

  .production-material-workspace :deep(.art-table-query__selection-bar) {
    max-width: 100%;
    overflow-x: auto;
    scrollbar-width: thin;
  }

  .production-batch-actions {
    display: flex;
    flex-wrap: nowrap;
    gap: 8px;
    white-space: nowrap;
  }

  .production-batch-actions :deep(.el-button + .el-button) {
    margin-left: 0;
  }

  .production-material-workspace :deep(td.wms-production-negative-cell) {
    font-weight: 700;
    color: var(--el-color-danger);
    background: var(--el-color-warning-light-9);
  }
</style>
