<template>
  <ArtPermissionGuard :permission="permission.View" :resource-name="title">
    <div class="business-workspace-page art-full-height min-w-0">
      <BusinessWorkspaceHeader
        class="wms-initialization-header"
        :eyebrow="isInitial ? 'OPENING SALES DOCUMENT' : 'SALES INVENTORY DOCUMENT'"
        :title="title"
        :description="description"
        :icon="isReturn ? 'ri:arrow-go-back-line' : 'ri:logout-box-r-line'"
        density="compact"
        :tags="[
          { label: isInitial ? '初始化单据' : '出库业务', type: 'primary' },
          { label: '税价联动', type: 'success' },
          { label: '物料与项目', type: 'info' }
        ]"
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
        :search-bar-props="{ span: 6, labelWidth: 76 }"
        :table-props="{
          rowKey: 'lineId',
          spanMethod: mergeDocumentCells,
          tableLayout: 'fixed',
          cellClassName: salesCellClassName,
          emptyText: `当前范围暂无${title}`,
          emptyDescription: '新建单据并选择物料，填写数量、价格与仓储信息。'
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
      <InitialSalesDrawer
        ref="drawerRef"
        :kind="kind"
        :import-permission="permission.Import"
        @success="refresh"
      />
      <InitialSalesDrawer
        v-if="kind === 'other_outbound'"
        ref="otherReturnDrawerRef"
        kind="other_return"
        :import-permission="permission.Import"
        @success="refresh"
      />
      <ArtDialog ref="sourceDialogRef" size="sm" :show-footer="false">
        <ArtEntitySummary
          icon="ri:file-search-line"
          eyebrow="SOURCE DOCUMENT"
          title="选择来源单据"
          description="选择业务来源后建立其他出库草稿，并在明细中保留来源单据与源行号。"
        />
        <div class="mt-5 grid gap-3">
          <ElSelect v-model="sourceDocumentType" class="w-full" placeholder="选择来源业务">
            <ElOption
              v-for="option in sourceDocumentTypeOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </ElSelect>
          <ElButton type="primary" :disabled="!sourceDocumentType" @click="createFromSource">
            建立出库草稿
          </ElButton>
        </div>
      </ArtDialog>
      <ArtDialog ref="pushDialogRef" size="sm" :show-footer="false">
        <ArtEntitySummary
          icon="ri:file-transfer-line"
          eyebrow="DOCUMENT PUSH"
          :title="isInitial ? '下推期初应收' : '下推发票'"
          :description="
            isInitial
              ? '登记上线前未结清应收；退货冲减应收，不影响库存。可在结束初始化的对账表核对。'
              : '普通发票与专用发票下推规则将在发票业务接入后开放。'
          "
        />
        <div v-if="isInitial" class="mt-5">
          <ElButton
            type="primary"
            class="w-full!"
            :loading="pushingInitialObligation"
            @click="pushInitialObligation"
            >{{ isReturn ? '期初应收冲减' : '期初应收单' }}</ElButton
          >
        </div>
        <div v-else class="mt-5 grid gap-3 sm:grid-cols-2">
          <ElButton disabled class="w-full!">普通发票</ElButton>
          <ElButton disabled class="w-full!">专用发票</ElButton>
        </div>
      </ArtDialog>
      <MasterDataDeleteGuard ref="deleteGuardRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { useWmsInitialObligationPush } from '@/hooks/business/useWmsInitialObligationPush'
  import { replaceReactiveModel } from '@/utils/form/model'
  import { formatUnitDisplayName } from '@/utils/business/unit-display'
  import { useRouteDocumentDrawer } from '@/hooks/core/useRouteDocumentDrawer'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { ElMessage, ElTag } from 'element-plus'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useDocumentBulkDelete } from '@/hooks/business/useDocumentBulkDelete'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
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
  import { useUserStore } from '@/store/modules/user'
  import {
    changeWmsInitialSalesStatus,
    fetchWmsInitialSalesDocument,
    fetchWmsInitialSalesPage,
    type WmsInitialSalesKind,
    type WmsInitialSalesListRow
  } from '@wms/api'
  import InitialSalesDrawer from './modules/initial-sales-drawer.vue'

  const commonDocumentReviewStatusOptions = useDictionaryOptions('commonDocumentReviewStatus')
  const sourceDocumentTypeOptions = useDictionaryOptions('wmsOutboundSourceDocumentType')

  const props = defineProps<{ kind: WmsInitialSalesKind }>()
  const { confirmAction } = useArtFeedback()
  const { hasAuth } = useAuth()
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const userStore = useUserStore()
  void userStore.ensureDictLoaded('wmsInitialStockType')
  void userStore.ensureDictLoaded('wmsInitialStockCondition')
  const tableRef = ref<ArtTableQueryExpose>()
  const displayMode = ref<'document' | 'line'>('document')
  const visibleRows = ref<WmsInitialSalesListRow[]>([])
  const lineProperties = new Set([
    'projectName',
    'materialCode',
    'materialDescription',
    'specificationModel',
    'inventoryUnitName',
    'quantity',
    'baseQuantity',
    'auxiliaryQuantity',
    'auxiliaryQuantity2',
    'discountAmount',
    'unitPrice',
    'taxInclusiveUnitPrice',
    'taxRate',
    'amount',
    'taxAmount',
    'totalAmount',
    'batchNo',
    'warehouseName',
    'binName',
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
      ? documentGroupSpan(visibleRows.value, rowIndex, column.property, lineProperties)
      : ([1, 1] as [number, number])
  }
  const drawerRef = ref<InstanceType<typeof InitialSalesDrawer>>()
  const otherReturnDrawerRef = ref<InstanceType<typeof InitialSalesDrawer>>()
  const pushDialogRef = ref<ArtDialogExpose>()
  const sourceDialogRef = ref<ArtDialogExpose>()
  const sourceDocumentType = ref('')
  const workingId = ref<string>()
  const selectedRows = ref<Array<{ documentId: string; kind: unknown; status: unknown }>>([])
  const { pushing: pushingInitialObligation, push: pushInitialObligation } =
    useWmsInitialObligationPush({
      area: 'sales',
      getSelection: () => selectedRows.value,
      afterPush: async () => {
        await pushDialogRef.value?.handleClose()
      }
    })

  useRouteDocumentDrawer({
    routeName: () => permission.value.View.split(':')[0],
    canOpen: () => (isInitial.value || props.kind === 'return') && hasAuth(permission.value.View),
    fetchDocument: async (id) => {
      const document = await fetchWmsInitialSalesDocument(id)
      if (document.kind !== props.kind) throw new Error('单据类型不匹配')
      return document
    },
    openDocument: async (document) => {
      await drawerRef.value?.handleOpen({ mode: 'view', document })
    },
    onError: () => ElMessage.error(`${title.value}加载失败，请刷新后重试`)
  })
  const returnKinds: WmsInitialSalesKind[] = ['initial_return', 'return', 'other_return']
  const isReturn = computed(() => returnKinds.includes(props.kind))
  const isInitial = computed(() => props.kind.startsWith('initial_'))
  const title = computed(
    () =>
      ({
        initial_outbound: '期初销售出库单',
        initial_return: '期初销售退货单',
        outbound: '销售出库单',
        return: '销售退货单',
        other_outbound: '其他出库单',
        other_return: '其他出库退回单'
      })[props.kind]
  )
  const deleteResourceLabel = ref('')
  const { deleteGuardRef, inspectDeleteReferences } = useRecordDeleteGuard(
    'wms_sales_document',
    () => deleteResourceLabel.value || title.value
  )
  const description = computed(() =>
    isInitial.value
      ? '记录上线前未结清销售往来，只初始化应收，不更新库存。退货表单录入正数，列表以红色负数呈现。'
      : isReturn.value
        ? `登记${isInitial.value ? '库存初始化前' : '日常'}的销售退货。退货数量以负数呈现，税价和折扣随数量同步计算。`
        : `登记${isInitial.value ? '库存初始化前' : '日常'}的销售出库。支持客户、项目与物料组合筛选，以及税价联动。`
  )
  const permissionCodes = {
    initial_outbound: {
      View: 'WmsInitialSalesOutbound:View',
      Add: 'WmsInitialSalesOutbound:Add',
      Copy: 'WmsInitialSalesOutbound:Copy',
      Edit: 'WmsInitialSalesOutbound:Edit',
      Delete: 'WmsInitialSalesOutbound:Delete',
      Import: 'WmsInitialSalesOutbound:Import',
      Export: 'WmsInitialSalesOutbound:Export',
      Push: 'WmsInitialSalesOutbound:Push',
      Submit: 'WmsInitialSalesOutbound:Submit',
      Approve: 'WmsInitialSalesOutbound:Approve'
    },
    initial_return: {
      View: 'WmsInitialSalesReturn:View',
      Add: 'WmsInitialSalesReturn:Add',
      Copy: 'WmsInitialSalesReturn:Copy',
      Edit: 'WmsInitialSalesReturn:Edit',
      Delete: 'WmsInitialSalesReturn:Delete',
      Import: 'WmsInitialSalesReturn:Import',
      Export: 'WmsInitialSalesReturn:Export',
      Push: 'WmsInitialSalesReturn:Push',
      Submit: 'WmsInitialSalesReturn:Submit',
      Approve: 'WmsInitialSalesReturn:Approve'
    },
    outbound: {
      View: 'WmsSalesOutbound:View',
      Add: 'WmsSalesOutbound:Add',
      Copy: 'WmsSalesOutbound:Copy',
      Edit: 'WmsSalesOutbound:Edit',
      Delete: 'WmsSalesOutbound:Delete',
      Import: 'WmsSalesOutbound:Import',
      Export: 'WmsSalesOutbound:Export',
      Push: 'WmsSalesOutbound:Push',
      Submit: 'WmsSalesOutbound:Submit',
      Approve: 'WmsSalesOutbound:Approve'
    },
    return: {
      View: 'WmsSalesReturnDocument:View',
      Add: 'WmsSalesReturnDocument:Add',
      Copy: 'WmsSalesReturnDocument:Copy',
      Edit: 'WmsSalesReturnDocument:Edit',
      Delete: 'WmsSalesReturnDocument:Delete',
      Import: 'WmsSalesReturnDocument:Import',
      Export: 'WmsSalesReturnDocument:Export',
      Push: 'WmsSalesReturnDocument:Push',
      Submit: 'WmsSalesReturnDocument:Submit',
      Approve: 'WmsSalesReturnDocument:Approve'
    },
    other_outbound: {
      View: 'WmsOtherOutbound:View',
      Add: 'WmsOtherOutbound:Add',
      Copy: 'WmsOtherOutbound:Copy',
      Edit: 'WmsOtherOutbound:Edit',
      Delete: 'WmsOtherOutbound:Delete',
      Import: 'WmsOtherOutbound:Import',
      Export: 'WmsOtherOutbound:Export',
      Push: 'WmsOtherOutbound:Push',
      Submit: 'WmsOtherOutbound:Submit',
      Approve: 'WmsOtherOutbound:Approve'
    },
    other_return: {
      View: 'WmsOtherOutbound:View',
      Add: 'WmsOtherOutbound:Add',
      Copy: 'WmsOtherOutbound:Copy',
      Edit: 'WmsOtherOutbound:Edit',
      Delete: 'WmsOtherOutbound:Delete',
      Import: 'WmsOtherOutbound:Import',
      Export: 'WmsOtherOutbound:Export',
      Push: 'WmsOtherOutbound:Push',
      Submit: 'WmsOtherOutbound:Submit',
      Approve: 'WmsOtherOutbound:Approve'
    }
  } as const
  const permission = computed(() => permissionCodes[props.kind])
  const search = reactive({
    status: '',
    customer: '',
    projectName: '',
    materialDescription: '',
    materialCode: ''
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
        options: commonDocumentReviewStatusOptions
      }
    },
    {
      label: '客户',
      key: 'customer',
      type: 'input',
      props: { clearable: true, placeholder: '客户名称' }
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
    }
  ]
  async function fetchRows(query: {
    exportAll?: boolean
    status?: string
    customer?: string
    projectName?: string
    materialDescription?: string
    materialCode?: string
    current: number
    size: number
  }) {
    const exportAll = query.exportAll === true
    const fetchPage = (page: typeof query) =>
      fetchWmsInitialSalesPage({
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
      materialDescription: `共 ${group.length} 项物料`,
      amount: group.reduce((sum, line) => sum + Number(line.amount || 0), 0),
      discountAmount: group.reduce((sum, line) => sum + Number(line.discountAmount || 0), 0),
      taxAmount: group.reduce((sum, line) => sum + Number(line.taxAmount || 0), 0),
      totalAmount: group.reduce((sum, line) => sum + Number(line.totalAmount || 0), 0)
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
    await tableRef.value?.refreshUpdate()
  }
  function salesCellClassName({
    row,
    column
  }: {
    row: Record<string, unknown>
    column: { property?: string }
  }): string {
    if (
      row.kind === 'initial_return' &&
      [
        'quantity',
        'baseQuantity',
        'auxiliaryQuantity',
        'auxiliaryQuantity2',
        'amount',
        'discountAmount',
        'totalAmount'
      ].includes(column.property || '')
    )
      return 'opening-return-negative-cell'
    return column.property === 'quantity' && returnKinds.some((kind) => kind === row.kind)
      ? 'initial-sales-negative-cell'
      : ''
  }
  function onSelectionChange(rows: Record<string, unknown>[]): void {
    selectedRows.value = rows.flatMap(({ documentId, kind, status }) =>
      typeof documentId === 'string' ? [{ documentId, kind, status }] : []
    )
  }
  async function createFromSource(): Promise<void> {
    if (!sourceDocumentType.value) return
    await sourceDialogRef.value?.handleClose()
    await drawerRef.value?.handleOpen({ mode: 'create' })
  }
  async function pushOtherReturn(): Promise<void> {
    const documents = new Map(selectedRows.value.map((row) => [row.documentId, row]))
    if (documents.size !== 1) {
      ElMessage.warning('请先勾选一张已审核的其他出库单')
      return
    }
    const source = [...documents.values()][0]
    if (source.kind !== 'other_outbound' || source.status !== 'approved') {
      ElMessage.warning('仅支持下推已审核的其他出库单')
      return
    }
    await otherReturnDrawerRef.value?.handleOpen({ mode: 'copy', documentId: source.documentId })
  }
  async function openDocument(
    mode: 'view' | 'edit' | 'copy',
    row: WmsInitialSalesListRow
  ): Promise<void> {
    try {
      const target =
        props.kind === 'other_outbound' && row.kind === 'other_return'
          ? otherReturnDrawerRef.value
          : drawerRef.value
      await target?.handleOpen({ mode, documentId: row.documentId })
    } catch {
      ElMessage.error('单据加载失败，请重试')
    }
  }
  async function transition(
    row: WmsInitialSalesListRow,
    action: 'submit' | 'approve' | 'delete'
  ): Promise<void> {
    if (workingId.value || bulkDeleting.value) return
    const label = { submit: '提交', approve: '审核', delete: '删除' }[action]
    const resources = [{ id: row.documentId, label: row.documentNo }]
    deleteResourceLabel.value = row.kind === 'other_return' ? '其他出库退回单' : title.value
    workingId.value = row.documentId
    try {
      if (action === 'delete' && (await inspectDeleteReferences(resources))) return
      await confirmAction(
        `确定${label} ${row.documentNo}？`,
        `${label}${deleteResourceLabel.value}`,
        {
          type: action === 'delete' ? 'warning' : 'info',
          confirmButtonText: `确定${label}`
        }
      )
      await changeWmsInitialSalesStatus(row.documentId, action)
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
  const { bulkDeleteAction, bulkDeleting } = useDocumentBulkDelete({
    permission: () => permission.value.Delete,
    resourceLabel: () => title.value,
    idKey: 'documentId',
    busy: () => Boolean(workingId.value),
    inspect: inspectDeleteReferences,
    remove: (id) => changeWmsInitialSalesStatus(id, 'delete'),
    refresh,
    clearSelection: () => tableRef.value?.clearSelection()
  })
  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    bulkDeleteAction(),
    ...(props.kind === 'other_outbound'
      ? [
          {
            key: 'select-source',
            label: '选单',
            icon: 'ri:link-m',
            permission: 'WmsOtherOutbound:Select',
            buttonProps: { type: 'primary' as const, plain: true },
            onClick: () => {
              sourceDocumentType.value = ''
              return sourceDialogRef.value?.handleOpen(undefined, { title: '选择来源单据' })
            }
          }
        ]
      : []),
    {
      type: 'add',
      label: `新增${title.value}`,
      permission: permission.value.Add,
      buttonProps: { plain: false },
      onClick: () => drawerRef.value?.handleOpen({ mode: 'create' })
    },
    {
      key: 'import',
      label: '导入',
      icon: 'ri:file-upload-line',
      permission: permission.value.Import,
      buttonProps: { type: 'success', plain: true },
      onClick: () => drawerRef.value?.handleOpen({ mode: 'create', importIntent: true })
    },
    {
      type: 'export',
      label: '导出当前范围',
      permission: permission.value.Export,
      buttonProps: { type: 'warning', plain: true },
      exportFilename: title.value,
      exportData: async () =>
        (await fetchRows({ ...search, current: 1, size: 500, exportAll: true })).data.map(
          (row) => ({ ...row, status: statusLabel(row.status) })
        ),
      exportColumns: [
        { title: '单据编号', key: 'documentNo' },
        { title: '业务日期', key: 'businessDate' },
        { title: '单据状态', key: 'status' },
        { title: '客户', key: 'customerName' },
        { title: '项目名称', key: 'projectName' },
        { title: '物料编码', key: 'materialCode' },
        { title: '物料描述', key: 'materialDescription' },
        { title: '规格型号', key: 'specificationModel' },
        { title: '库存单位', key: 'inventoryUnitName' },
        { title: '数量', key: 'quantity' },
        { title: '单价(元)', key: 'unitPrice' },
        { title: '含税单价(元)', key: 'taxInclusiveUnitPrice' },
        { title: '税率(%)', key: 'taxRate' },
        { title: '金额(元)', key: 'amount' },
        { title: '税额(元)', key: 'taxAmount' },
        { title: '价税合计(元)', key: 'totalAmount' }
      ]
    },
    {
      key: 'push',
      label: '下推',
      icon: 'ri:file-transfer-line',
      permission: permission.value.Push,
      buttonProps: { type: 'info', plain: true },
      onClick: () =>
        props.kind === 'other_outbound'
          ? pushOtherReturn()
          : pushDialogRef.value?.handleOpen(undefined, { title: '下推发票' })
    }
  ])
  function statusLabel(value: WmsInitialSalesListRow['status']): string {
    return { draft: '暂存', submitted: '已提交', approved: '已审核' }[value]
  }
  function dictionaryLabel(code: string, value: string): string {
    return userStore.getDictMap[code]?.find((item) => item.value === value)?.label || value
  }
  function moreActions(row: WmsInitialSalesListRow): ButtonMoreItem[] {
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
  function onMoreAction(item: ButtonMoreItem, row: WmsInitialSalesListRow): void {
    if (item.key === 'copy' || item.key === 'edit') {
      void openDocument(item.key, row)
    } else if (item.key === 'submit' || item.key === 'approve' || item.key === 'delete') {
      void transition(row, item.key)
    }
  }
  function columnsFactory(): ColumnOption<WmsInitialSalesListRow>[] {
    const columns: ColumnOption<WmsInitialSalesListRow>[] = [
      { type: 'selection', width: 48, fixed: 'left' },
      {
        prop: 'documentNo',
        label: '单据编号',
        fixed: 'left',
        minWidth: 180,
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.documentNo}
            secondary={`${displayMode.value === 'document' ? `共 ${row.lineNo} 项物料` : `第 ${row.lineNo} 行`} · ${row.customerName || '未关联客户'}`}
            icon={returnKinds.includes(row.kind) ? 'ri:arrow-go-back-line' : 'ri:logout-box-r-line'}
          />
        )
      },
      { prop: 'businessDate', label: '业务日期', minWidth: 118 },
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
            {statusLabel(row.status)}
          </ElTag>
        )
      },
      { prop: 'customerName', label: '客户', minWidth: 170, showOverflowTooltip: true },
      ...(props.kind !== 'other_outbound' && isReturn.value
        ? ([
            {
              prop: 'returnType',
              label: '退货类型',
              minWidth: 105,
              formatter: (row: WmsInitialSalesListRow) =>
                ({ return: '退货', replace: '退补货', refund_only: '仅退款不退货' })[
                  row.returnType || 'return'
                ]
            }
          ] as ColumnOption<WmsInitialSalesListRow>[])
        : []),
      { prop: 'projectName', label: '项目名称', minWidth: 165, showOverflowTooltip: true },
      ...(displayMode.value === 'line'
        ? [{ prop: 'materialCode', label: '物料编码', minWidth: 125 }]
        : []),
      { prop: 'materialDescription', label: '物料描述', minWidth: 175, showOverflowTooltip: true },
      { prop: 'specificationModel', label: '规格型号', minWidth: 130 },
      {
        prop: 'inventoryUnitName',
        label: '库存单位',
        width: 98,
        formatter: (row) => formatUnitDisplayName(row.inventoryUnitName)
      },
      {
        prop: 'quantity',
        label: '数量',
        minWidth: 115,
        align: 'right',
        formatter: (row) => (
          <span
            class={
              returnKinds.includes(row.kind)
                ? 'initial-sales-negative'
                : 'font-semibold tabular-nums'
            }
          >
            {Number(row.quantity).toFixed(4)}
          </span>
        )
      },
      ...(displayMode.value === 'line' && props.kind === 'initial_return'
        ? ([
            { prop: 'baseQuantity', label: '基本数量', minWidth: 115, align: 'right' },
            { prop: 'auxiliaryQuantity', label: '辅助数量', minWidth: 115, align: 'right' },
            { prop: 'auxiliaryQuantity2', label: '辅助数量2', minWidth: 125, align: 'right' }
          ] as ColumnOption<WmsInitialSalesListRow>[])
        : []),
      { prop: 'unitPrice', label: '单价(元)', minWidth: 108, align: 'right' },
      { prop: 'taxInclusiveUnitPrice', label: '含税单价(元)', minWidth: 125, align: 'right' },
      { prop: 'taxRate', label: '税率(%)', minWidth: 100, align: 'right' },
      { prop: 'amount', label: '金额(元)', minWidth: 110, align: 'right' },
      ...(props.kind === 'initial_return'
        ? ([
            { prop: 'discountAmount', label: '折扣额(元)', minWidth: 115, align: 'right' }
          ] as ColumnOption<WmsInitialSalesListRow>[])
        : []),
      { prop: 'taxAmount', label: '税额(元)', minWidth: 110, align: 'right' },
      { prop: 'totalAmount', label: '价税合计(元)', minWidth: 130, align: 'right' },
      { prop: 'batchNo', label: '批号', minWidth: 120 },
      { prop: 'warehouseName', label: '仓库', minWidth: 140 },
      { prop: 'binName', label: '仓位', minWidth: 120 },
      {
        prop: 'stockType',
        label: '库存类型',
        minWidth: 100,
        formatter: (row) => dictionaryLabel('wmsInitialStockType', row.stockType)
      },
      {
        prop: 'stockStatus',
        label: '库存状态',
        minWidth: 100,
        formatter: (row) => dictionaryLabel('wmsInitialStockCondition', row.stockStatus)
      },
      {
        prop: 'gift',
        label: '赠品',
        width: 78,
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
      'quantity',
      'specificationModel',
      'inventoryUnitName',
      'unitPrice',
      'taxInclusiveUnitPrice',
      'taxRate',
      'batchNo',
      'warehouseName',
      'binName',
      'stockType',
      'stockStatus',
      'gift'
    ])
    return columns.filter((column) => !detailOnly.has(String(column.prop)))
  }
</script>

<style scoped>
  :deep(.wms-initialization-header .business-workspace-header__aside) {
    max-width: min(72%, 980px);
  }

  @media (width <= 1280px) {
    :deep(.wms-initialization-header .business-workspace-header__hero) {
      flex-wrap: wrap;
    }

    :deep(.wms-initialization-header .business-workspace-header__aside) {
      width: 100%;
      max-width: none;
      margin-left: 0;
    }
  }

  :deep(td.el-table__cell.initial-sales-negative-cell) {
    background-color: var(--el-color-warning-light-9) !important;
  }

  :deep(.initial-sales-negative) {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: var(--el-color-danger);
  }

  :deep(td.el-table__cell.opening-return-negative-cell) {
    font-variant-numeric: tabular-nums;
    color: var(--el-color-danger);
  }
</style>
