<template>
  <ArtPermissionGuard :permission="permission('View')" :resource-name="title">
    <div class="business-workspace-page art-full-height min-w-0">
      <BusinessWorkspaceHeader
        :eyebrow="kind === 'direct' ? 'DIRECT TRANSFER DOCUMENTS' : 'TWO STEP TRANSFER DOCUMENTS'"
        :title="title"
        :description="
          kind === 'direct'
            ? '按单据申请、提交并审核直接调拨；审核时原子更新来源与目标库存。'
            : '审核调出进入在途；下推暂存收货单，审核收货后入库。'
        "
        :icon="kind === 'direct' ? 'ri:swap-box-line' : 'ri:truck-line'"
        density="compact"
        :tags="[
          { label: '按月三位流水', type: 'primary' },
          { label: '审核后记账', type: 'success' },
          { label: '逐行追溯', type: 'info' }
        ]"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>
      <ElAlert v-if="optionError" type="warning" :closable="false" show-icon class="mb-3">
        单据类型加载失败。<ElButton link type="primary" @click="loadOptions">重新加载</ElButton>
      </ElAlert>
      <ArtTableQuery
        ref="tableRef"
        :model-value="search"
        @update:model-value="replaceReactiveModel(search, $event)"
        @selection-change="onSelectionChange"
        :api-fn="fetchRows"
        :search-items="searchItems"
        :columns-factory="columnsFactory"
        :columns-context-key="displayMode"
        :header-actions="headerActions"
        :selection-actions="selectionActions"
        header-actions-placement="workspace"
        :search-bar-props="{ span: 6, labelWidth: 82 }"
        :table-props="{
          rowKey: 'lineId',
          spanMethod: mergeDocumentCells,
          tableLayout: 'fixed',
          emptyText: `当前范围暂无${title}`,
          emptyDescription: '新建单据并选择来源库存批次。'
        }"
        focusable
      >
      </ArtTableQuery>
      <TransferBusinessDrawer ref="drawerRef" @success="refresh" />
      <ArtDialog ref="returnDialogRef" size="lg">
        <ArtEntitySummary
          icon="ri:arrow-go-back-line"
          eyebrow="TRANSFER RETURN"
          title="选择退回明细"
          :description="`原单 ${activeDocument?.documentNo || ''}；可按行选择未退回数量。`"
        />
        <ArtTable
          class="mt-4"
          :data="returnRows"
          :pagination="false"
          :show-table-header="false"
          row-key="lineId"
          @selection-change="onReturnSelection"
        >
          <ElTableColumn type="selection" width="48" />
          <ElTableColumn label="行号" width="75" prop="line.lineNo" />
          <ElTableColumn label="物料" min-width="180" prop="materialDescription" />
          <ElTableColumn label="批次" min-width="120" prop="line.batchNo" />
          <ElTableColumn label="原数量" width="155">
            <template #default="{ row }">
              {{ Number(row.line.quantity).toFixed(6) }}
              {{ formatUnitDisplayName(row.inventoryUnitName) }}
            </template>
          </ElTableColumn>
          <ElTableColumn label="未退回" width="165">
            <template #default="{ row }">
              {{ remainingQuantity(row).toFixed(6) }}
              {{ formatUnitDisplayName(row.inventoryUnitName) }}
            </template>
          </ElTableColumn>
        </ArtTable>
      </ArtDialog>
      <ArtDialog v-if="kind === 'step'" ref="receiveDialogRef" size="lg">
        <ArtEntitySummary
          icon="ri:inbox-archive-line"
          eyebrow="TRANSFER RECEIPT"
          title="工厂间转储收货"
          :description="`原单 ${activeDocument?.documentNo || ''}；下推剩余在途数量生成暂存单，审核时才入库。`"
        />
        <ArtTable
          class="mt-4"
          :data="receiveRows"
          :pagination="false"
          :show-table-header="false"
          row-key="lineId"
          @selection-change="onReceiveSelection"
        >
          <ElTableColumn type="selection" width="48" />
          <ElTableColumn label="行号" width="75" prop="line.lineNo" />
          <ElTableColumn label="物料" min-width="170" prop="materialDescription" />
          <ElTableColumn label="剩余在途基本数量" width="190">
            <template #default="{ row }">
              {{ Number(row.inTransitQuantity || 0).toFixed(6) }}
              {{ formatUnitDisplayName(row.baseUnitName) }}
            </template>
          </ElTableColumn>
          <ElTableColumn label="调入仓库" min-width="145" prop="targetWarehouseName" />
          <ElTableColumn label="调入仓位" min-width="165">
            <template #default="{ row }">
              <ElSelect
                v-model="receiveBinIds[row.line.id]"
                :disabled="!receiveWarehouseNeedsBin(row)"
                clearable
                filterable
                placeholder="选择目标仓位"
              >
                <ElOption
                  v-for="bin in (receiveBins[row.line.targetWarehouseId] || []).filter(
                    (item) =>
                      item.status === 'available' &&
                      (row.line.targetWarehouseId !== row.line.sourceWarehouseId ||
                        item.id !== row.line.sourceBinId)
                  )"
                  :key="bin.id"
                  :label="`${bin.binCode} · ${bin.binName}`"
                  :value="bin.id"
                />
              </ElSelect>
            </template>
          </ElTableColumn>
        </ArtTable>
      </ArtDialog>
      <MasterDataDeleteGuard ref="deleteGuardRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { useRoute, useRouter } from 'vue-router'
  import { replaceReactiveModel } from '@/utils/form/model'
  import { uniq, uniqBy } from 'lodash-es'
  import { formatUnitDisplayName } from '@/utils/business/unit-display'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useDocumentBulkDelete } from '@/hooks/business/useDocumentBulkDelete'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import {
    documentGroupSpan,
    groupDocumentLines,
    loadAllLinePages
  } from '@/utils/business/document-detail-list'
  import { ElMessage, ElTag } from 'element-plus'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtTableQuery, {
    type ArtTableQueryExpose,
    type ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtButtonMore, {
    type ButtonMoreItem
  } from '@/components/core/forms/art-button-more/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type { ColumnOption } from '@/types'
  import {
    changeWmsTransferBusinessStatus,
    createWmsTransferBusinessReturn,
    fetchWmsBins,
    fetchWmsInitialDocumentTypes,
    fetchWmsTransferBusinessDocument,
    fetchWmsTransferReceiptSourceLineIds,
    fetchWmsTransferBusinessPage,
    fetchWmsWarehouses,
    createWmsTransferBusinessReceipt,
    type WmsBin,
    type WmsInitializationOption,
    type WmsStockQuery,
    type WmsTransferBusinessRow,
    type WmsWarehouse
  } from '@wms/api'
  import TransferBusinessDrawer from './transfer-business-drawer.vue'

  const props = defineProps<{ kind: 'direct' | 'step' }>()
  type WorkspaceRow = WmsTransferBusinessRow & {
    displayLineCount?: number
    displayQuantity?: number
    displayRemaining?: number
  }
  defineOptions({ name: 'WmsTransferBusinessWorkspace' })
  const route = useRoute()
  const router = useRouter()
  const { confirmAction } = useArtFeedback()
  const { hasAllAuth } = useAuth()
  const title = computed(() => (props.kind === 'direct' ? '直接调拨单' : '分步调拨单'))
  const permissionByKind: Record<'direct' | 'step', Record<string, string>> = {
    direct: {
      View: 'WmsDirectTransfer:View',
      Create: 'WmsDirectTransfer:Create',
      Copy: 'WmsDirectTransfer:Copy',
      Edit: 'WmsDirectTransfer:Edit',
      Delete: 'WmsDirectTransfer:Delete',
      Import: 'WmsDirectTransfer:Import',
      Export: 'WmsDirectTransfer:Export',
      Submit: 'WmsDirectTransfer:Submit',
      Withdraw: 'WmsDirectTransfer:Withdraw',
      Approve: 'WmsDirectTransfer:Approve',
      Return: 'WmsDirectTransfer:Return'
    },
    step: {
      View: 'WmsStepTransfer:View',
      Create: 'WmsStepTransfer:Create',
      Copy: 'WmsStepTransfer:Copy',
      Edit: 'WmsStepTransfer:Edit',
      Delete: 'WmsStepTransfer:Delete',
      Export: 'WmsStepTransfer:Export',
      Submit: 'WmsStepTransfer:Submit',
      Withdraw: 'WmsStepTransfer:Withdraw',
      Approve: 'WmsStepTransfer:Approve',
      Return: 'WmsStepTransfer:Return',
      Receive: 'WmsStepTransfer:Receive'
    }
  }
  const permission = (action: string): string => {
    const code = permissionByKind[props.kind][action]
    if (!code) throw new Error('调拨按钮权限未配置')
    return code
  }
  const tenantScope = useTenantScopeStore()
  const { effectiveTenantId } = storeToRefs(tenantScope)
  const { defaultWriteTenantId } = useTenantScopeFormPolicy()
  const filterTenantId = computed(() => effectiveTenantId.value || undefined)
  const tableRef = ref<ArtTableQueryExpose>()
  const drawerRef = ref<InstanceType<typeof TransferBusinessDrawer>>()
  const returnDialogRef = ref<ArtDialogExpose>()
  const receiveDialogRef = ref<ArtDialogExpose>()
  const optionError = ref(false)
  let optionsLoadVersion = 0
  const documentTypes = ref<WmsInitializationOption[]>([])
  const warehouses = ref<WmsWarehouse[]>([])
  const selectedRows = ref<WorkspaceRow[]>([])
  const activeDocument = shallowRef<WmsTransferBusinessRow>()
  const returnRows = ref<WmsTransferBusinessRow[]>([])
  const selectedReturnRows = ref<WmsTransferBusinessRow[]>([])
  const receiveRows = ref<WmsTransferBusinessRow[]>([])
  const selectedReceiveRows = ref<WmsTransferBusinessRow[]>([])
  const receiveBins = ref<Record<string, WmsBin[]>>({})
  const receiveBinIds = ref<Record<string, string>>({})
  const workingId = ref<string>()
  const { deleteGuardRef, inspectDeleteReferences } = useRecordDeleteGuard(
    'wms_transfer_business_document',
    '调拨单'
  )
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
  const stepStatusLabels: Record<string, string> = {
    draft: '暂存',
    in_transit: '在途',
    received: '已收货',
    returned: '已退回',
    cancelled: '已取消'
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
  const lineProperties = new Set([
    'materialDescription',
    'materialCode',
    'projectName',
    'line.quantity',
    'sourceOrganizationName',
    'sourceWarehouseName',
    'sourceBinName',
    'targetOrganizationName',
    'targetWarehouseName',
    'targetBinName',
    'line.returnedQuantity',
    'remainingQuantity',
    'inTransitQuantity',
    'stepStatus'
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
          (tableRef.value?.dataState.rows.value as WorkspaceRow[] | undefined) ?? [],
          rowIndex,
          column.property,
          lineProperties
        )
      : ([1, 1] as [number, number])
  }
  function isBusinessRow(value: unknown): value is WmsTransferBusinessRow {
    if (typeof value !== 'object' || value === null) return false
    return (
      'documentId' in value &&
      typeof value.documentId === 'string' &&
      'line' in value &&
      typeof value.line === 'object' &&
      value.line !== null
    )
  }
  function onSelectionChange(rows: unknown[]): void {
    selectedRows.value = rows.filter(isBusinessRow)
  }
  function onReturnSelection(rows: unknown[]): void {
    selectedReturnRows.value = rows.filter(isBusinessRow)
  }
  function onReceiveSelection(rows: unknown[]): void {
    selectedReceiveRows.value = rows.filter(isBusinessRow)
  }
  async function fetchRows(
    query: WmsStockQuery & {
      documentTypeCode?: string
      applicationDateRange?: string[]
      exportAll?: boolean
    }
  ): Promise<{ data: WorkspaceRow[]; total: number }> {
    const fetchPage = (page: typeof query) =>
      fetchWmsTransferBusinessPage(props.kind, {
        ...page,
        tenantId: filterTenantId.value,
        documentTypeIds: page.documentTypeCode
          ? documentTypes.value
              .filter((row) => row.code === page.documentTypeCode)
              .map((row) => row.id)
          : undefined,
        applicationDateStart: page.applicationDateRange?.[0],
        applicationDateEnd: page.applicationDateRange?.[1]
      })
    if (displayMode.value === 'line') {
      if (query.exportAll) {
        const data = await loadAllLinePages(fetchPage, query)
        return { data, total: data.length }
      }
      return fetchPage(query)
    }
    const rows = await loadAllLinePages(fetchPage, query)
    const documents = groupDocumentLines(rows, (row) => row.documentId).map(
      ({ first, lines: documentLines }) => ({
        ...first,
        displayLineCount: documentLines.length,
        displayQuantity: documentLines.reduce(
          (sum, item) => sum + Number(item.line.quantity || 0),
          0
        ),
        displayRemaining: documentLines.reduce((sum, item) => sum + remainingQuantity(item), 0)
      })
    )
    return {
      data: query.exportAll
        ? documents
        : documents.slice((query.current - 1) * query.size, query.current * query.size),
      total: documents.length
    }
  }
  async function refresh(): Promise<void> {
    selectedRows.value = []
    tableRef.value?.clearSelection()
    await tableRef.value?.refreshUpdate()
  }
  async function loadOptions(): Promise<void> {
    const loadVersion = ++optionsLoadVersion
    optionError.value = false
    documentTypes.value = []
    try {
      const [types, warehouseRows] = await Promise.all([
        fetchWmsInitialDocumentTypes(
          filterTenantId.value,
          props.kind === 'direct' ? 'WmsDirectTransfer' : 'WmsStepTransfer'
        ),
        fetchWmsWarehouses(filterTenantId.value)
      ])
      if (loadVersion !== optionsLoadVersion) return
      documentTypes.value = types
      warehouses.value = warehouseRows
    } catch {
      if (loadVersion !== optionsLoadVersion) return
      optionError.value = true
    }
    await refresh()
  }
  function openCreate(importIntent = false): void {
    const tenantId = defaultWriteTenantId.value
    if (tenantId)
      void drawerRef.value?.handleOpen({ mode: 'create', kind: props.kind, tenantId, importIntent })
    else ElMessage.warning('无法确定新增单据的目标租户，请刷新后重试')
  }
  function openDocument(mode: 'view' | 'edit' | 'copy', row: WmsTransferBusinessRow): void {
    void drawerRef.value?.handleOpen({
      mode,
      kind: row.kind === 'step_receipt' ? 'step_receipt' : props.kind,
      tenantId: row.tenantId,
      documentId: row.documentId
    })
  }
  function remainingQuantity(value: unknown): number {
    if (!isBusinessRow(value)) return 0
    return Math.max(0, Number(value.line.quantity) - Number(value.line.returnedQuantity))
  }
  function receiveWarehouseNeedsBin(value: unknown): boolean {
    if (!isBusinessRow(value)) return false
    return (
      warehouses.value.find((row) => row.id === value.line.targetWarehouseId)?.enableLocations ||
      false
    )
  }
  async function transition(
    row: WmsTransferBusinessRow,
    action: 'submit' | 'withdraw' | 'approve' | 'delete'
  ): Promise<void> {
    if (workingId.value || bulkDeleting.value) return
    const label = { submit: '提交', withdraw: '撤回', approve: '审核', delete: '删除' }[action]
    const resources = [{ id: row.documentId, label: row.documentNo }]
    workingId.value = row.documentId
    try {
      if (action === 'delete' && (await inspectDeleteReferences(resources))) return
      await confirmAction(`确定${label} ${row.documentNo}？`, `${label}${title.value}`, {
        type: action === 'delete' ? 'warning' : 'info',
        confirmButtonText: `确定${label}`
      })
      await changeWmsTransferBusinessStatus(row.documentId, action)
      await refresh()
    } catch (error) {
      if (action === 'delete' && error !== 'cancel' && error !== 'close')
        await inspectDeleteReferences(resources)
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, `${title.value}${label}失败，请重试`)
    } finally {
      workingId.value = undefined
    }
  }
  async function openReturn(
    row: WmsTransferBusinessRow,
    selectedLineIds?: string[]
  ): Promise<void> {
    if (workingId.value) return
    try {
      const { rows } = await fetchWmsTransferBusinessDocument(row.documentId)
      const candidates = rows.filter(
        (item) =>
          (!selectedLineIds || selectedLineIds.includes(item.line.id)) &&
          remainingQuantity(item) > 0 &&
          (props.kind === 'direct' || item.stepStatus === 'in_transit')
      )
      if (!candidates.length) return void ElMessage.warning('当前单据没有可退回的明细')
      activeDocument.value = row
      returnRows.value = candidates
      selectedReturnRows.value = []
      await returnDialogRef.value?.handleOpen(undefined, {
        title: '下推调拨退回',
        confirmText: '生成暂存退回单',
        confirmDisabled: true,
        onConfirm: async () => {
          const source = activeDocument.value
          if (!source || !selectedReturnRows.value.length) return false
          try {
            const id = await createWmsTransferBusinessReturn(
              source.documentId,
              selectedReturnRows.value.map((item) => item.line.id)
            )
            await refresh()
            void drawerRef.value?.handleOpen({
              mode: 'edit',
              kind: props.kind,
              tenantId: source.tenantId,
              documentId: id
            })
            return true
          } catch (error) {
            notifyFriendlyError(error, '调拨退回单创建失败，请重试')
            return false
          }
        }
      })
    } catch (error) {
      notifyFriendlyError(error, '可退回明细加载失败，请重试')
    }
  }
  async function openReceive(
    row: WmsTransferBusinessRow,
    selectedLineIds?: string[]
  ): Promise<void> {
    if (props.kind !== 'step' || workingId.value) return
    try {
      const [{ rows }, warehouseRows] = await Promise.all([
        fetchWmsTransferBusinessDocument(row.documentId),
        fetchWmsWarehouses(row.tenantId)
      ])
      const inTransitRows = rows.filter(
        (item) =>
          (!selectedLineIds || selectedLineIds.includes(item.line.id)) &&
          item.stepStatus === 'in_transit' &&
          Number(item.inTransitQuantity || 0) > 0
      )
      const occupied = new Set(
        await fetchWmsTransferReceiptSourceLineIds(inTransitRows.map((item) => item.line.id))
      )
      const candidates = inTransitRows.filter((item) => !occupied.has(item.line.id))
      if (!candidates.length)
        return void ElMessage.warning('当前单据没有可下推的在途明细；请查看已有收货单')
      warehouses.value = warehouseRows
      const ids = uniq(candidates.map((item) => item.line.targetWarehouseId))
      const binPages = await Promise.all(
        ids.map(async (id) => [id, await fetchWmsBins(id)] as const)
      )
      receiveBins.value = Object.fromEntries(binPages)
      receiveBinIds.value = {}
      receiveRows.value = candidates
      selectedReceiveRows.value = []
      activeDocument.value = row
      await receiveDialogRef.value?.handleOpen(undefined, {
        title: '下推工厂间转储收货',
        confirmText: '生成暂存收货单',
        confirmDisabled: true,
        onConfirm: async () => {
          const source = activeDocument.value
          if (!source || !selectedReceiveRows.value.length) return false
          if (
            selectedReceiveRows.value.some(
              (item) => receiveWarehouseNeedsBin(item) && !receiveBinIds.value[item.line.id]
            )
          ) {
            ElMessage.warning('请为启用仓位的目标仓库选择调入仓位')
            return false
          }
          try {
            const id = await createWmsTransferBusinessReceipt(
              source.documentId,
              selectedReceiveRows.value.map((item) => ({
                lineId: item.line.id,
                targetBinId: receiveBinIds.value[item.line.id] || null
              }))
            )
            await refresh()
            void drawerRef.value?.handleOpen({
              mode: 'edit',
              kind: 'step_receipt',
              tenantId: source.tenantId,
              documentId: id
            })
            return true
          } catch (error) {
            notifyFriendlyError(error, '暂存收货单创建失败，请核对在途余额后重试')
            return false
          }
        }
      })
    } catch (error) {
      notifyFriendlyError(error, '在途明细加载失败，请重试')
    }
  }
  watch(selectedReturnRows, (rows) => {
    returnDialogRef.value?.setOptions({ confirmDisabled: rows.length === 0 })
  })
  watch(selectedReceiveRows, (rows) => {
    receiveDialogRef.value?.setOptions({ confirmDisabled: rows.length === 0 })
  })
  const { bulkDeleteAction, bulkDeleting } = useDocumentBulkDelete({
    permission: permission('Delete'),
    resourceLabel: title.value,
    idKey: 'documentId',
    busy: () => Boolean(workingId.value),
    inspect: inspectDeleteReferences,
    remove: (id) => changeWmsTransferBusinessStatus(id, 'delete'),
    refresh,
    clearSelection: () => tableRef.value?.clearSelection()
  })
  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    bulkDeleteAction(),
    {
      type: 'add',
      label: `新增${title.value}`,
      permission: permission('Create'),
      buttonProps: { plain: false },
      onClick: () => openCreate()
    },
    ...(props.kind === 'direct'
      ? [
          {
            key: 'import',
            label: '导入',
            icon: 'ri:file-upload-line',
            permission: permission('Import'),
            buttonProps: { type: 'success' as const, plain: true },
            onClick: () => openCreate(true)
          }
        ]
      : []),
    {
      type: 'export',
      label: '导出当前范围',
      permission: permission('Export'),
      buttonProps: { type: 'warning', plain: true },
      exportFilename: title.value,
      exportData: async () =>
        (await fetchRows({ ...search, current: 1, size: 500, exportAll: true })).data.map(
          (row) => ({
            ...row,
            statusLabel: statusLabels[row.status],
            quantity: row.displayQuantity ?? row.line.quantity,
            remaining: row.displayRemaining ?? remainingQuantity(row)
          })
        ),
      exportColumns: [
        { title: '单据编号', key: 'documentNo' },
        { title: '业务日期', key: 'businessDate' },
        { title: '单据状态', key: 'statusLabel' },
        { title: '物料编码', key: 'materialCode' },
        { title: '物料描述', key: 'materialDescription' },
        { title: '项目名称', key: 'projectName' },
        { title: '数量', key: 'quantity' },
        { title: '未退回数量', key: 'remaining' },
        { title: '调出仓库', key: 'sourceWarehouseName' },
        { title: '调入仓库', key: 'targetWarehouseName' }
      ]
    }
  ])
  function selectedPushSource(): {
    row: WmsTransferBusinessRow
    lineIds?: string[]
  } | null {
    const rows = selectedRows.value
    if (!rows.length) return null
    if (uniq(rows.map((row) => row.documentId)).length !== 1) {
      ElMessage.warning('请只选择同一张调拨单的明细后下推')
      return null
    }
    if (
      rows[0].status !== 'approved' ||
      rows[0].kind.endsWith('_return') ||
      rows[0].kind === 'step_receipt'
    ) {
      ElMessage.warning('请选择已审核的原调拨单')
      return null
    }
    return {
      row: rows[0],
      lineIds: displayMode.value === 'line' ? rows.map((row) => row.line.id) : undefined
    }
  }
  const selectionActions = computed<ArtTableQueryHeaderAction[]>(() => [
    bulkDeleteAction(),
    {
      key: 'return-selected',
      label: props.kind === 'step' ? '下推所选调出退回' : '下推所选调拨退回',
      icon: 'ri:arrow-go-back-line',
      permission: permission('Return'),
      rowAction: false,
      selectionRequired: true,
      onClick: () => {
        const source = selectedPushSource()
        if (source) void openReturn(source.row, source.lineIds)
      }
    },
    ...(props.kind === 'step'
      ? [
          {
            key: 'receive-selected',
            label: '下推所选转储收货',
            icon: 'ri:inbox-archive-line',
            permission: permission('Receive'),
            rowAction: false,
            selectionRequired: true,
            onClick: () => {
              const source = selectedPushSource()
              if (source) void openReceive(source.row, source.lineIds)
            }
          }
        ]
      : [])
  ])
  function moreActions(row: WmsTransferBusinessRow): ButtonMoreItem[] {
    const actions: ButtonMoreItem[] =
      row.kind.endsWith('_return') || row.kind === 'step_receipt'
        ? []
        : [{ key: 'copy', label: '复制单据', icon: 'ri:file-copy-line', auth: permission('Copy') }]
    if (row.status === 'draft')
      actions.push(
        { key: 'edit', label: '编辑单据', icon: 'ri:edit-line', auth: permission('Edit') },
        {
          key: 'submit',
          label: '提交单据',
          icon: 'ri:send-plane-line',
          auth: permission('Submit')
        },
        {
          key: 'delete',
          label: '删除单据',
          icon: 'ri:delete-bin-line',
          auth: permission('Delete'),
          color: 'var(--el-color-danger)'
        }
      )
    if (row.status === 'submitted') {
      actions.push({
        key: 'withdraw',
        label: '撤回提交',
        icon: 'ri:arrow-go-back-line',
        auth: permission('Withdraw')
      })
      if (
        row.kind !== 'step_receipt' ||
        hasAllAuth(['WmsStepTransfer:Approve', 'WmsStepTransfer:Receive'])
      )
        actions.push({
          key: 'approve',
          label:
            row.kind === 'step_receipt'
              ? '审核收货入库'
              : props.kind === 'step'
                ? '审核调出'
                : '审核记账',
          icon: 'ri:checkbox-circle-line',
          auth: permission('Approve')
        })
    }
    if (row.kind === 'step' || row.kind === 'direct') {
      actions.push({
        key: 'return',
        label:
          row.status === 'approved'
            ? props.kind === 'step'
              ? '下推调出退回'
              : '下推调拨退回'
            : '下推退回（审核后可用）',
        icon: 'ri:arrow-go-back-line',
        auth: permission('Return'),
        disabled: row.status !== 'approved'
      })
      if (props.kind === 'step')
        actions.push({
          key: 'receive',
          label: row.status === 'approved' ? '下推转储收货' : '下推收货（审核后可用）',
          icon: 'ri:inbox-archive-line',
          auth: permission('Receive'),
          disabled: row.status !== 'approved'
        })
    }
    return actions
  }
  function onMoreAction(item: ButtonMoreItem, row: WmsTransferBusinessRow): void {
    if (item.key === 'copy' || item.key === 'edit') openDocument(item.key, row)
    else if (item.key === 'return') void openReturn(row)
    else if (item.key === 'receive') void openReceive(row)
    else if (
      item.key === 'submit' ||
      item.key === 'withdraw' ||
      item.key === 'approve' ||
      item.key === 'delete'
    )
      void transition(row, item.key)
  }
  function columnsFactory(): ColumnOption<WorkspaceRow>[] {
    const columns: ColumnOption<WorkspaceRow>[] = [
      { type: 'selection', width: 48, fixed: 'left' },
      {
        prop: 'documentNo',
        label: '单据编号',
        fixed: 'left',
        minWidth: 200,
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.documentNo}
            secondary={`${row.kind === 'step_receipt' ? '转储收货' : row.kind.endsWith('_return') ? '调拨退回' : '标准调拨'} · ${displayMode.value === 'document' ? `共 ${row.displayLineCount || 1} 行` : `第 ${row.line.lineNo} 行`}`}
            icon={props.kind === 'step' ? 'ri:truck-line' : 'ri:swap-box-line'}
          />
        )
      },
      { prop: 'businessDate', label: '业务日期', width: 115 },
      {
        prop: 'status',
        label: '单据状态',
        width: 100,
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
      { prop: 'documentTypeName', label: '单据类型', minWidth: 150 },
      { prop: 'businessTypeName', label: '业务类型', minWidth: 150 },
      { prop: 'materialCode', label: '物料编码', minWidth: 130 },
      { prop: 'materialDescription', label: '物料描述', minWidth: 190, showOverflowTooltip: true },
      { prop: 'specificationModel', label: '规格型号', minWidth: 130 },
      { prop: 'projectName', label: '项目名称', minWidth: 150 },
      { prop: 'line.constructionNo', label: '施工号', minWidth: 120 },
      {
        prop: 'line.quantity',
        label: '数量',
        minWidth: 105,
        align: 'right',
        formatter: (row) => Number(row.displayQuantity ?? row.line.quantity).toFixed(4)
      },
      {
        prop: 'line.inventoryUnitId',
        label: '库存单位',
        minWidth: 100,
        formatter: (row) => formatUnitDisplayName(row.inventoryUnitName)
      },
      { prop: 'sourceOrganizationName', label: '调出组织', minWidth: 140 },
      { prop: 'sourceWarehouseName', label: '调出仓库', minWidth: 145 },
      { prop: 'sourceBinName', label: '调出仓位', minWidth: 120 },
      { prop: 'targetOrganizationName', label: '调入组织', minWidth: 140 },
      { prop: 'targetWarehouseName', label: '调入仓库', minWidth: 145 },
      { prop: 'targetBinName', label: '调入仓位', minWidth: 120 },
      {
        prop: 'line.returnedQuantity',
        label: '已退回数量',
        minWidth: 110,
        align: 'right',
        formatter: (row) => Number(row.line.returnedQuantity || 0).toFixed(4)
      },
      {
        prop: 'remainingQuantity',
        label: '未退回数量',
        minWidth: 115,
        align: 'right',
        formatter: (row) => Number(row.displayRemaining ?? remainingQuantity(row)).toFixed(4)
      },
      ...(props.kind === 'step'
        ? [
            {
              prop: 'stepStatus',
              label: '在途状态',
              minWidth: 105,
              formatter: (row: WorkspaceRow) =>
                row.stepStatus ? stepStatusLabels[row.stepStatus] || row.stepStatus : '—'
            }
          ]
        : []),
      {
        prop: 'operation',
        label: '操作',
        fixed: 'right',
        width: 115,
        formatter: (row) => (
          <BusinessTableRowActions>
            <ArtButtonTable
              type="view"
              label="查看"
              icon="ri:eye-line"
              permission={permission('View')}
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
      'line.constructionNo',
      'line.inventoryUnitId',
      'sourceOrganizationName',
      'sourceWarehouseName',
      'sourceBinName',
      'targetOrganizationName',
      'targetWarehouseName',
      'targetBinName',
      'line.returnedQuantity',
      'remainingQuantity',
      'stepStatus'
    ])
    return columns.filter((column) => !detailOnly.has(String(column.prop)))
  }
  watch(effectiveTenantId, () => void loadOptions(), { immediate: true })
  watch(
    () => route.query.openDocument,
    async (value) => {
      if (typeof value !== 'string' || !value) return
      await nextTick()
      try {
        const { document } = await fetchWmsTransferBusinessDocument(value)
        if (!document.kind.startsWith(props.kind)) throw new Error('目标调拨单类别不匹配')
        await drawerRef.value?.handleOpen({
          mode: document.status === 'draft' ? 'edit' : 'view',
          kind: document.kind === 'step_receipt' ? 'step_receipt' : props.kind,
          tenantId: document.tenantId,
          documentId: document.id
        })
      } catch (error) {
        notifyFriendlyError(error, '目标调拨单打开失败，请在列表中查找后重试')
      } finally {
        const query = { ...route.query }
        delete query.openDocument
        await router.replace({ query })
      }
    },
    { immediate: true, flush: 'post' }
  )
</script>
