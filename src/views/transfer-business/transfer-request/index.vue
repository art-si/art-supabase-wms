<template>
  <ArtPermissionGuard permission="WmsTransfer:View" resource-name="调拨申请单">
    <div class="business-workspace-page art-full-height min-w-0">
      <BusinessWorkspaceHeader
        eyebrow="TRANSFER REQUEST"
        title="调拨申请单"
        description="登记组织内或跨组织调拨申请，审核后可下推直接调拨或调出在途。"
        icon="ri:file-transfer-line"
        density="compact"
        :tags="[
          { label: '三位月流水', type: 'primary' },
          { label: '调出与调入', type: 'success' },
          { label: '审核后下推', type: 'info' }
        ]"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>
      <ElAlert v-if="optionError" type="warning" :closable="false" show-icon class="mb-3">
        单据类型加载失败。<ElButton link type="primary" @click="loadDocumentTypes"
          >重新加载</ElButton
        >
      </ElAlert>
      <ArtTableQuery
        ref="tableRef"
        :model-value="search"
        @update:model-value="replaceReactiveModel(search, $event)"
        :api-fn="fetchRows"
        :search-items="searchItems"
        :columns-factory="columnsFactory"
        :columns-context-key="displayMode"
        :header-actions="headerActions"
        :selection-actions="selectionActions"
        header-actions-placement="workspace"
        :search-bar-props="{ span: 6, labelWidth: 76 }"
        :table-props="{
          rowKey: 'lineId',
          spanMethod: mergeDocumentCells,
          tableLayout: 'fixed',
          emptyText: '当前范围暂无调拨申请单',
          emptyDescription: '新建申请单并填写物料、调出仓库和调入仓库。'
        }"
        focusable
      >
      </ArtTableQuery>
      <TransferRequestDrawer ref="drawerRef" @success="refresh" />
      <ArtDialog ref="pushDialogRef" size="sm" :show-footer="false">
        <ArtEntitySummary
          icon="ri:route-line"
          eyebrow="TRANSFER MODE"
          title="选择下推方式"
          :description="`调拨申请 ${pushRow?.documentNo || ''}；${pushLineIds.length ? `已选 ${pushLineIds.length} 行` : '下推全部未处理明细'}，生成目标暂存单。`"
        />
        <div class="mt-5 grid gap-3 sm:grid-cols-2">
          <ElButton
            v-auth="'WmsDirectTransfer:Create'"
            type="primary"
            :loading="pushingMode === 'direct'"
            :disabled="!!pushingMode"
            @click="push('direct')"
            >直接调拨</ElButton
          >
          <ElButton
            v-auth="'WmsStepTransfer:Create'"
            type="warning"
            plain
            :loading="pushingMode === 'in_transit'"
            :disabled="!!pushingMode"
            @click="push('in_transit')"
            >调出在途</ElButton
          >
        </div>
      </ArtDialog>
      <ArtDialog ref="pushResultDialogRef" size="sm" :show-footer="false">
        <ArtEntitySummary
          icon="ri:route-line"
          eyebrow="TRANSFER DOCUMENTS"
          title="调拨单已生成"
          :description="`申请单按组织组合生成 ${pushResults.length} 张暂存单，请逐张完善并提交。`"
        />
        <div class="mt-5 grid gap-3">
          <div
            v-for="item in pushResults"
            :key="item.id"
            class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--el-border-color)] p-3"
          >
            <div class="min-w-0">
              <div class="font-medium">{{ item.documentNo }}</div>
              <div class="text-sm text-[var(--el-text-color-secondary)]">
                {{ item.sourceOrganizationName }} → {{ item.targetOrganizationName }} ·
                {{ item.lineCount }} 行
              </div>
            </div>
            <ElButton type="primary" text @click="openPushResult(item.id)">打开单据</ElButton>
          </div>
        </div>
      </ArtDialog>
      <MasterDataDeleteGuard ref="deleteGuardRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { uniqBy } from 'lodash-es'
  import { replaceReactiveModel } from '@/utils/form/model'
  import { useRouter } from 'vue-router'
  import { formatUnitDisplayName } from '@/utils/business/unit-display'
  import { WMS_STOCK_TYPE_LABELS } from '@/utils/wms/stock-type'
  import { ElMessage, ElTag } from 'element-plus'
  import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useDocumentBulkDelete } from '@/hooks/business/useDocumentBulkDelete'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
  import { useAuth } from '@/hooks/core/useAuth'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
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
    changeWmsTransferRequestStatus,
    fetchWmsInitialDocumentTypes,
    fetchWmsTransferRequestPage,
    fetchWmsTransferRequestUnpushedPage,
    createWmsTransferBusinessFromRequest,
    type WmsTransferPushResult,
    type WmsInitializationOption,
    type WmsStockQuery,
    type WmsTransferRequestRow
  } from '@wms/api'
  import TransferRequestDrawer from './modules/transfer-request-drawer.vue'

  defineOptions({ name: 'WmsTransfer' })
  type RequestWorkspaceRow = WmsTransferRequestRow & { unpushedLineCount?: number }
  const router = useRouter()
  const { confirmAction } = useArtFeedback()
  const { hasAuth, hasAnyAuth } = useAuth()
  const { deleteGuardRef, inspectDeleteReferences } = useRecordDeleteGuard(
    'wms_transfer_request_document',
    '调拨申请单'
  )
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const { defaultWriteTenantId } = useTenantScopeFormPolicy()
  const tableRef = ref<ArtTableQueryExpose>()
  const lineProperties = new Set([
    'materialCode',
    'materialDescription',
    'specificationModel',
    'projectName',
    'constructionNo',
    'inventoryUnitName',
    'quantity',
    'sourceOrganizationName',
    'sourceWarehouseName',
    'sourceBinName',
    'targetOrganizationName',
    'targetWarehouseName',
    'targetBinName',
    'stockType',
    'stockStatus',
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
      ? documentGroupSpan(
          (tableRef.value?.dataState.rows.value as WmsTransferRequestRow[] | undefined) ?? [],
          rowIndex,
          column.property,
          lineProperties
        )
      : ([1, 1] as [number, number])
  }
  const drawerRef = ref<InstanceType<typeof TransferRequestDrawer>>()
  const pushDialogRef = ref<ArtDialogExpose>()
  const pushResultDialogRef = ref<ArtDialogExpose>()
  const pushResults = ref<WmsTransferPushResult[]>([])
  const pushResultKind = ref<'direct' | 'step'>('direct')
  const pushRow = ref<WmsTransferRequestRow>()
  const pushLineIds = ref<string[]>([])
  const pushingMode = ref<'direct' | 'in_transit'>()
  const workingId = ref<string>()
  const documentTypes = ref<WmsInitializationOption[]>([])
  const optionError = ref(false)
  let optionsLoadVersion = 0
  const search = reactive({
    displayMode: 'document' as 'document' | 'line',
    status: '',
    documentTypeCode: '',
    applicationDateRange: [] as string[],
    projectName: '',
    materialDescription: '',
    materialCode: '',
    keyword: ''
  })
  const displayMode = toRef(search, 'displayMode')
  watch(displayMode, () => void refresh())
  const displayModeOptions = useDictionaryOptions('commonDocumentDisplayMode')
  const statusLabels = { draft: '暂存', submitted: '已提交', approved: '已审核' } as const
  const stockStatusLabels: Record<string, string> = {
    available: '可用',
    scrap: '报废',
    defective: '不良',
    frozen: '冻结'
  }
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
        options: Object.entries(statusLabels).map(([value, label]) => ({ value, label }))
      }
    },
    {
      label: '单据类型',
      key: 'documentTypeCode',
      type: 'select',
      props: {
        clearable: true,
        filterable: true,
        placeholder: '全部类型',
        options: uniqBy(
          documentTypes.value.filter((row) => row.code),
          'code'
        ).map((row) => ({
          value: row.code,
          label: `${row.code} · ${row.name}`
        }))
      }
    },
    {
      label: '申请日期',
      key: 'applicationDateRange',
      type: 'daterange',
      span: 12,
      props: {
        clearable: true,
        valueFormat: 'YYYY-MM-DD',
        startPlaceholder: '开始日期',
        endPlaceholder: '结束日期'
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
  ])
  async function fetchRows(
    query: WmsStockQuery & {
      documentTypeCode?: string
      applicationDateRange?: string[]
      exportAll?: boolean
    }
  ) {
    const exportAll = query.exportAll === true
    const fetchPage = (page: typeof query) =>
      fetchWmsTransferRequestPage({
        ...page,
        tenantId: effectiveTenantId.value || undefined,
        documentTypeIds: page.documentTypeCode
          ? documentTypes.value
              .filter((row) => row.code === page.documentTypeCode)
              .map((row) => row.id)
          : undefined,
        applicationDateStart: page.applicationDateRange?.[0],
        applicationDateEnd: page.applicationDateRange?.[1]
      })
    if (displayMode.value === 'line') {
      if (exportAll) {
        const data = await loadAllLinePages(fetchPage, query)
        return { data, total: data.length }
      }
      return fetchPage(query)
    }
    const lines = await loadAllLinePages(fetchPage, query)
    const documents = groupDocumentLines(lines, (line) => line.documentId).map(
      ({ first, lines: group }) => ({
        ...first,
        unpushedLineCount: group.filter((line) => !line.pushedDocumentId).length,
        lineNo: group.length,
        materialCode: '',
        materialDescription: `共 ${group.length} 项物料`,
        quantity: group.reduce((sum, line) => sum + Number(line.quantity || 0), 0),
        baseQuantity: group.reduce((sum, line) => sum + Number(line.baseQuantity || 0), 0)
      })
    )
    const pageDocuments = exportAll
      ? documents
      : documents.slice((query.current - 1) * query.size, query.current * query.size)
    const hasLineFilter = Boolean(
      query.projectName?.trim() || query.materialDescription?.trim() || query.materialCode?.trim()
    )
    const unpushedCounts = new Map<string, number>()
    if (!exportAll && hasLineFilter && pageDocuments.length) {
      const remaining = await loadAllLinePages(
        (page: Pick<WmsStockQuery, 'current' | 'size'>) =>
          fetchWmsTransferRequestUnpushedPage(
            pageDocuments.map((document) => document.documentId),
            page
          ),
        { current: 1, size: 500 }
      )
      for (const line of remaining)
        unpushedCounts.set(line.documentId, (unpushedCounts.get(line.documentId) || 0) + 1)
    }
    return {
      data: pageDocuments.map((row) => ({
        ...row,
        unpushedLineCount:
          hasLineFilter && !exportAll
            ? unpushedCounts.get(row.documentId) || 0
            : row.unpushedLineCount,
        inventoryUnitName: formatUnitDisplayName(row.inventoryUnitName)
      })),
      total: documents.length
    }
  }
  async function refresh(): Promise<void> {
    tableRef.value?.clearSelection()
    await tableRef.value?.refreshUpdate()
  }
  function openCreate(importIntent = false): void {
    const tenantId = defaultWriteTenantId.value
    if (tenantId) void drawerRef.value?.handleOpen({ mode: 'create', tenantId, importIntent })
    else ElMessage.warning('无法确定新增单据的目标租户，请刷新后重试')
  }
  async function openDocument(
    mode: 'view' | 'edit' | 'copy',
    row: WmsTransferRequestRow
  ): Promise<void> {
    await drawerRef.value?.handleOpen({
      mode,
      documentId: row.documentId,
      tenantId: row.tenantId
    })
  }
  async function transition(
    row: WmsTransferRequestRow,
    action: 'submit' | 'approve' | 'withdraw' | 'delete'
  ): Promise<void> {
    if (workingId.value || bulkDeleting.value) return
    const label = { submit: '提交', withdraw: '撤回提交', approve: '审核', delete: '删除' }[action]
    const resources = [{ id: row.documentId, label: row.documentNo }]
    workingId.value = row.documentId
    try {
      if (action === 'delete' && (await inspectDeleteReferences(resources))) return
      await confirmAction(
        `${action === 'withdraw' ? '撤回后恢复暂存，可修改或删除；关联审批待办将取消。' : ''}确定${label} ${row.documentNo}？`,
        `${label}调拨申请单`,
        {
          type: action === 'delete' ? 'warning' : 'info',
          confirmButtonText: `确定${label}`
        }
      )
      await changeWmsTransferRequestStatus(row.documentId, action)
      await refresh()
    } catch (error) {
      if (action === 'delete' && error !== 'cancel' && error !== 'close') {
        await inspectDeleteReferences(resources)
      }
      /* 取消和接口错误由组件处理。 */
    } finally {
      workingId.value = undefined
    }
  }
  async function openPush(rows: WmsTransferRequestRow[]): Promise<void> {
    if (pushingMode.value) return
    if (!hasAnyAuth(['WmsDirectTransfer:Create', 'WmsStepTransfer:Create'])) {
      ElMessage.warning('当前账号缺少直接或分步调拨单的新增权限')
      return
    }
    const documents = new Set(rows.map((row) => row.documentId))
    if (documents.size !== 1) {
      ElMessage.warning('请选择同一张调拨申请单的明细后下推')
      return
    }
    const row = rows[0]
    if (!row || row.status !== 'approved') {
      ElMessage.warning('请先审核调拨申请单')
      return
    }
    if (
      displayMode.value === 'line'
        ? rows.some((item) => Boolean(item.pushedDocumentId))
        : (row as RequestWorkspaceRow).unpushedLineCount === 0
    ) {
      ElMessage.warning('所选申请明细已下推，请选择未处理的明细')
      return
    }
    pushRow.value = row
    pushLineIds.value = displayMode.value === 'line' ? rows.map((item) => item.lineId) : []
    await pushDialogRef.value?.handleOpen(undefined, { title: '下推调拨申请' })
  }
  async function push(mode: 'direct' | 'in_transit'): Promise<void> {
    if (!pushRow.value || pushingMode.value) return
    if (!hasAuth(mode === 'direct' ? 'WmsDirectTransfer:Create' : 'WmsStepTransfer:Create')) {
      ElMessage.warning('当前账号无权新增目标调拨单')
      return
    }
    const documentId = pushRow.value.documentId
    pushingMode.value = mode
    try {
      const kind = mode === 'direct' ? 'direct' : 'step'
      const results = await createWmsTransferBusinessFromRequest(
        documentId,
        kind,
        pushLineIds.value
      )
      await pushDialogRef.value?.handleClose()
      await refresh()
      pushResultKind.value = kind
      if (results.length === 1) {
        await openPushResult(results[0].id)
      } else {
        pushResults.value = results
        await pushResultDialogRef.value?.handleOpen(undefined, { title: '已生成调拨单' })
      }
    } catch (error) {
      notifyFriendlyError(error, '下推调拨单失败，请检查申请明细后重试')
    } finally {
      pushingMode.value = undefined
    }
  }
  async function openPushResult(id: string): Promise<void> {
    await pushResultDialogRef.value?.handleClose()
    await router.push({
      path: `/wms/transfer-business/${pushResultKind.value === 'direct' ? 'direct-transfer' : 'step-transfer'}`,
      query: { openDocument: id }
    })
  }
  const { bulkDeleteAction, bulkDeleting } = useDocumentBulkDelete({
    permission: 'WmsTransfer:Delete',
    resourceLabel: '调拨申请单',
    idKey: 'documentId',
    busy: () => Boolean(workingId.value),
    inspect: inspectDeleteReferences,
    remove: (id) => changeWmsTransferRequestStatus(id, 'delete'),
    refresh,
    clearSelection: () => tableRef.value?.clearSelection()
  })
  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    bulkDeleteAction(),
    {
      type: 'add',
      label: '新增调拨申请单',
      permission: 'WmsTransfer:Create',
      buttonProps: { plain: false },
      onClick: () => openCreate()
    },
    {
      key: 'import',
      label: '导入',
      icon: 'ri:file-upload-line',
      permission: 'WmsTransfer:Import',
      buttonProps: { type: 'success', plain: true },
      onClick: () => openCreate(true)
    },
    {
      type: 'export',
      label: '导出当前范围',
      permission: 'WmsTransfer:Export',
      buttonProps: { type: 'warning', plain: true },
      exportFilename: '调拨申请单',
      exportData: async () =>
        (await fetchRows({ ...search, current: 1, size: 500, exportAll: true })).data.map(
          (row) => ({ ...row, status: statusLabels[row.status] })
        ),
      exportColumns: [
        { title: '单据编号', key: 'documentNo' },
        { title: '申请日期', key: 'applicationDate' },
        { title: '单据状态', key: 'status' },
        { title: '物料编码', key: 'materialCode' },
        { title: '物料描述', key: 'materialDescription' },
        { title: '数量', key: 'quantity' },
        { title: '调出仓库', key: 'sourceWarehouseName' },
        { title: '调入仓库', key: 'targetWarehouseName' }
      ]
    }
  ])
  const selectionActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      key: 'push-selected',
      label: displayMode.value === 'line' ? '下推所选明细' : '下推所选单据',
      icon: 'ri:route-line',
      permission: 'WmsTransfer:Push',
      selectionRequired: true,
      rowAction: false,
      disabled: ({ selectedRows }) =>
        selectedRows.some((row) => !isTransferRequestRow(row) || row.status !== 'approved'),
      onClick: ({ selectedRows }) => void openPush(selectedRows.filter(isTransferRequestRow))
    }
  ])
  function isTransferRequestRow(value: unknown): value is WmsTransferRequestRow {
    return (
      typeof value === 'object' &&
      value !== null &&
      'documentId' in value &&
      typeof value.documentId === 'string' &&
      'lineId' in value &&
      typeof value.lineId === 'string'
    )
  }
  function moreActions(row: WmsTransferRequestRow): ButtonMoreItem[] {
    return [
      { key: 'copy', label: '复制单据', icon: 'ri:file-copy-line', auth: 'WmsTransfer:Copy' },
      ...(row.status === 'draft'
        ? [
            { key: 'edit', label: '编辑单据', icon: 'ri:edit-line', auth: 'WmsTransfer:Edit' },
            {
              key: 'submit',
              label: '提交单据',
              icon: 'ri:send-plane-line',
              auth: 'WmsTransfer:Submit'
            },
            {
              key: 'delete',
              label: '删除单据',
              icon: 'ri:delete-bin-line',
              auth: 'WmsTransfer:Delete',
              color: 'var(--el-color-danger)'
            }
          ]
        : []),
      ...(row.status === 'submitted'
        ? [
            {
              key: 'withdraw',
              label: '撤回提交',
              icon: 'ri:arrow-go-back-line',
              auth: 'WmsTransfer:Withdraw'
            },
            {
              key: 'approve',
              label: '审核单据',
              icon: 'ri:checkbox-circle-line',
              auth: 'WmsTransfer:Approve'
            }
          ]
        : []),
      {
        key: 'push',
        label:
          row.status !== 'approved'
            ? '下推（审核后可用）'
            : (
                  displayMode.value === 'line'
                    ? Boolean(row.pushedDocumentId)
                    : (row as RequestWorkspaceRow).unpushedLineCount === 0
                )
              ? '下推（明细已处理）'
              : '下推调拨',
        icon: 'ri:route-line',
        auth: 'WmsTransfer:Push',
        disabled:
          row.status !== 'approved' ||
          (displayMode.value === 'line'
            ? Boolean(row.pushedDocumentId)
            : (row as RequestWorkspaceRow).unpushedLineCount === 0)
      }
    ]
  }
  function onMoreAction(item: ButtonMoreItem, row: WmsTransferRequestRow): void {
    if (item.key === 'copy' || item.key === 'edit') void openDocument(item.key, row)
    else if (
      item.key === 'submit' ||
      item.key === 'approve' ||
      item.key === 'withdraw' ||
      item.key === 'delete'
    )
      void transition(row, item.key)
    else if (item.key === 'push') void openPush([row])
  }
  function columnsFactory(): ColumnOption<WmsTransferRequestRow>[] {
    const columns: ColumnOption<WmsTransferRequestRow>[] = [
      { type: 'selection', width: 48, fixed: 'left' },
      {
        prop: 'documentNo',
        label: '单据编号',
        fixed: 'left',
        minWidth: 185,
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.documentNo}
            secondary={`${displayMode.value === 'document' ? `共 ${row.lineNo} 项物料` : `第 ${row.lineNo} 行`} · ${row.documentTypeName || '未设置单据类型'}`}
            icon="ri:file-transfer-line"
          />
        )
      },
      { prop: 'applicationDate', label: '申请日期', width: 112 },
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
      { prop: 'businessTypeName', label: '业务类型', minWidth: 125 },
      { prop: 'applicantName', label: '申请人', minWidth: 105 },
      { prop: 'departmentName', label: '申请部门', minWidth: 135 },
      ...(displayMode.value === 'line'
        ? [{ prop: 'materialCode', label: '物料编码', minWidth: 125 }]
        : []),
      { prop: 'materialDescription', label: '物料描述', minWidth: 180, showOverflowTooltip: true },
      ...(displayMode.value === 'line'
        ? [{ prop: 'specificationModel', label: '规格型号', minWidth: 125 }]
        : []),
      { prop: 'projectName', label: '项目名称', minWidth: 150, showOverflowTooltip: true },
      { prop: 'constructionNo', label: '施工号', minWidth: 115 },
      ...(displayMode.value === 'line'
        ? [
            {
              prop: 'inventoryUnitName',
              label: '库存单位',
              width: 98,
              formatter: (row: WmsTransferRequestRow) =>
                formatUnitDisplayName(row.inventoryUnitName)
            }
          ]
        : []),
      {
        prop: 'quantity',
        label: '数量',
        width: 105,
        align: 'right',
        formatter: (row) => <strong class="tabular-nums">{Number(row.quantity).toFixed(4)}</strong>
      },
      { prop: 'sourceOrganizationName', label: '调出组织', minWidth: 140 },
      { prop: 'sourceWarehouseName', label: '调出仓库', minWidth: 140 },
      { prop: 'sourceBinName', label: '调出仓位', minWidth: 120 },
      { prop: 'targetOrganizationName', label: '调入组织', minWidth: 140 },
      { prop: 'targetWarehouseName', label: '调入仓库', minWidth: 140 },
      { prop: 'targetBinName', label: '调入仓位', minWidth: 120 },
      {
        prop: 'stockType',
        label: '库存类型',
        width: 105,
        formatter: (row) => WMS_STOCK_TYPE_LABELS[row.stockType] || row.stockType || '—'
      },
      {
        prop: 'stockStatus',
        label: '库存状态',
        width: 105,
        formatter: (row) => stockStatusLabels[row.stockStatus] || row.stockStatus || '—'
      },
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
              permission="WmsTransfer:View"
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
      'projectName',
      'constructionNo',
      'sourceOrganizationName',
      'sourceWarehouseName',
      'sourceBinName',
      'targetOrganizationName',
      'targetWarehouseName',
      'targetBinName',
      'stockType',
      'stockStatus',
      'gift'
    ])
    return columns.filter((column) => !detailOnly.has(String(column.prop)))
  }
  async function loadDocumentTypes(): Promise<void> {
    const loadVersion = ++optionsLoadVersion
    optionError.value = false
    documentTypes.value = []
    try {
      const rows = await fetchWmsInitialDocumentTypes(
        effectiveTenantId.value || undefined,
        'WmsTransfer'
      )
      if (loadVersion !== optionsLoadVersion) return
      documentTypes.value = rows
    } catch {
      if (loadVersion !== optionsLoadVersion) return
      optionError.value = true
    }
    await refresh()
  }
  watch(effectiveTenantId, () => void loadDocumentTypes(), { immediate: true })
</script>
