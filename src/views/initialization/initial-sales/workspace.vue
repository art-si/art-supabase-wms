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
        :selection-actions="selectionActions"
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
        <template #sales-push>
          <ArtButtonMore :list="pushActions" trigger="click" @click="onSalesPush">
            <template #trigger
              ><ElButton size="small" plain :disabled="!selectedRows.length || pushingSales"
                ><ArtSvgIcon icon="ri:file-transfer-line" />下推<ArtSvgIcon
                  icon="ri:arrow-down-s-line" /></ElButton
            ></template>
          </ArtButtonMore>
        </template>
      </ArtTableQuery>
      <SalesPrintSheet ref="printSheetRef" />
      <WmsAssetCapitalizationDialog ref="assetDialogRef" @success="refresh" />
      <InitialSalesDrawer
        v-if="kind === 'outbound'"
        ref="salesReturnDrawerRef"
        kind="return"
        import-permission="WmsSalesReturnDocument:Import"
        @success="refresh"
      />
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
      <ArtDialog ref="pushDialogRef" size="sm" :show-footer="false">
        <ArtEntitySummary
          icon="ri:file-transfer-line"
          eyebrow="DOCUMENT PUSH"
          title="下推期初应收"
          description="登记上线前未结清应收；退货冲减应收，不影响库存。可在结束初始化的对账表核对。"
        />
        <div class="mt-5">
          <ElButton
            type="primary"
            class="w-full!"
            :loading="pushingInitialObligation"
            @click="pushInitialObligation"
            >{{ isReturn ? '期初应收冲减' : '期初应收单' }}</ElButton
          >
        </div>
      </ArtDialog>
      <MasterDataDeleteGuard ref="deleteGuardRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { useRouter } from 'vue-router'
  import { createEstimatedReceivableFromSource } from '@/api/receivables'
  import { financePaths } from '@/router/business-paths'
  import WmsAssetCapitalizationDialog from '@/components/business/wms-asset-capitalization-dialog/index.vue'
  import { wmsDocumentClassificationColumns } from '@/utils/business/wms-document-columns'
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
    fetchWmsSalesReturnRemaining,
    pushWmsSalesInvoices,
    fetchWmsInitialSalesPage,
    type WmsInitialSalesKind,
    type WmsInitialSalesListRow
  } from '@wms/api'
  import InitialSalesDrawer from './modules/initial-sales-drawer.vue'
  import SalesPrintSheet from './modules/sales-print-sheet.vue'
  import { uniq } from 'lodash-es'
  import { navigateToApplication } from '@/utils/application-navigation'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'

  const commonDocumentReviewStatusOptions = useDictionaryOptions('commonDocumentReviewStatus')

  const props = defineProps<{ kind: WmsInitialSalesKind }>()
  const receivableRouter = useRouter()
  const { confirmAction } = useArtFeedback()
  const { hasAuth } = useAuth()
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const userStore = useUserStore()
  void userStore.ensureDictLoaded('wmsInitialStockType')
  void userStore.ensureDictLoaded('wmsInitialStockCondition')
  const tableRef = ref<ArtTableQueryExpose>()
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
  const workingId = ref<string>()
  const selectedRows = ref<
    Array<{ documentId: string; lineId: string; kind: unknown; status: unknown }>
  >([])
  const printSheetRef = ref<InstanceType<typeof SalesPrintSheet>>()
  const salesReturnDrawerRef = ref<InstanceType<typeof InitialSalesDrawer>>()
  const printing = ref(false)
  const assetDialogRef = ref<InstanceType<typeof WmsAssetCapitalizationDialog>>()
  const pushingSales = ref(false)
  const isDailySales = computed(() => ['outbound', 'return', 'other_outbound'].includes(props.kind))
  const pushActions = computed<ButtonMoreItem[]>(() => [
    ...(props.kind === 'outbound' && hasAuth('FinanceEstimatedReceivable:Add')
      ? [
          {
            key: 'estimated-receivable',
            label: '暂估应收单',
            icon: 'ri:bill-line',
            auth: 'WmsSalesOutbound:Push'
          }
        ]
      : []),
    ...(props.kind === 'other_outbound'
      ? [
          {
            key: 'other-return',
            label: '其他出库退回',
            icon: 'ri:arrow-go-back-line',
            auth: 'WmsOtherOutbound:Push'
          },
          ...(hasAuth('FinanceFixedAsset:Add')
            ? [
                {
                  key: 'asset',
                  label: '采购转固',
                  icon: 'ri:building-2-line',
                  auth: 'WmsOtherOutbound:Push'
                }
              ]
            : [])
        ]
      : []),
    ...(props.kind !== 'other_outbound' &&
    hasAuth('WmsSalesInvoice:Add') &&
    hasAuth('WmsSalesInvoice:View')
      ? [
          { key: 'ordinary', label: '普通发票', icon: 'ri:bill-line', auth: permission.value.Push },
          {
            key: 'special',
            label: '专用发票',
            icon: 'ri:file-paper-2-line',
            auth: permission.value.Push
          }
        ]
      : []),
    ...(props.kind === 'outbound' && hasAuth('WmsSalesReturnDocument:Add')
      ? [
          {
            key: 'return',
            label: '销售退货单',
            icon: 'ri:arrow-go-back-line',
            auth: 'WmsSalesOutbound:Push'
          }
        ]
      : [])
  ])
  async function printSelection(): Promise<void> {
    if (printing.value || !selectedRows.value.length) return
    printing.value = true
    try {
      await printSheetRef.value?.print(
        await Promise.all(
          uniq(selectedRows.value.map((row) => row.documentId)).map(fetchWmsInitialSalesDocument)
        )
      )
    } catch (error) {
      notifyFriendlyError(error, '打印资料加载失败，请重试')
    } finally {
      printing.value = false
    }
  }
  async function onSalesPush(item: ButtonMoreItem, rows = selectedRows.value): Promise<void> {
    if (pushingSales.value || !rows.length || !hasAuth(permission.value.Push)) return
    pushingSales.value = true
    try {
      if (item.key === 'estimated-receivable') {
        const ids = uniq(rows.map((row) => row.documentId))
        if (ids.length !== 1) {
          ElMessage.warning('请每次选择一张销售出库单生成暂估')
          return
        }
        const id = await createEstimatedReceivableFromSource('wms_sales_outbound', ids[0])
        await receivableRouter.push({
          path: financePaths.estimatedReceivable,
          query: { recordId: id }
        })
        return
      }
      if (item.key === 'asset') {
        const ids = uniq(rows.map((row) => row.documentId))
        const documents = await Promise.all(ids.map(fetchWmsInitialSalesDocument))
        if (
          !hasAuth('FinanceFixedAsset:Add') ||
          documents.some(
            (doc) =>
              doc.kind !== 'other_outbound' ||
              doc.status !== 'approved' ||
              doc.tenantId !== documents[0].tenantId
          )
        ) {
          ElMessage.warning('请选择同一租户下已审核的其他出库单')
          return
        }
        await assetDialogRef.value?.open(
          documents[0].tenantId,
          ids.map((documentId) => ({
            documentId,
            lineIds:
              displayMode.value === 'document'
                ? null
                : rows.filter((row) => row.documentId === documentId).map((row) => row.lineId)
          }))
        )
        return
      }
      if (item.key === 'ordinary' || item.key === 'special') {
        const ids = uniq(rows.map((row) => row.documentId))
        const invoices = await pushWmsSalesInvoices(
          item.key,
          ids.map((documentId) => ({
            documentId,
            lineIds:
              displayMode.value === 'document'
                ? null
                : rows.filter((row) => row.documentId === documentId).map((row) => row.lineId)
          }))
        )
        ElMessage.success(`已生成 ${invoices.length} 张销售发票草稿`)
        await navigateToApplication('wms', '/wms/outbound-business/sales-invoice', {
          documentId: invoices[0]
        })
        return
      }
      const documents = await Promise.all(
        uniq(rows.map((row) => row.documentId)).map(fetchWmsInitialSalesDocument)
      )
      const first = documents[0]
      if (
        documents.some(
          (doc) =>
            doc.status !== 'approved' ||
            doc.kind !== (props.kind === 'other_outbound' ? 'other_outbound' : 'outbound') ||
            doc.tenantId !== first.tenantId ||
            doc.customerId !== first.customerId ||
            doc.organizationId !== first.organizationId
        )
      ) {
        ElMessage.warning('请选择同一租户、客户和库存组织下已审核的销售出库明细')
        return
      }
      const selectedIds = new Set(rows.map((row) => row.lineId))
      const remaining = await fetchWmsSalesReturnRemaining(documents.map((doc) => doc.id))
      const lines = documents.flatMap((doc) =>
        doc.lines
          .filter(
            (line) => displayMode.value === 'document' || (line.id && selectedIds.has(line.id))
          )
          .filter((line) =>
            remaining.some((item) => item.lineId === line.id && item.remainingQuantity > 0)
          )
          .map((line) => ({
            ...line,
            quantity: remaining.find((item) => item.lineId === line.id)?.remainingQuantity || 0,
            serialNos: remaining.find((item) => item.lineId === line.id)?.serialNos || [],
            id: undefined,
            sourceDocumentId: doc.id,
            sourceLineId: line.id || null,
            sourceDocument: doc.documentNo,
            sourceLineNo: String(line.lineNo),
            returnType: 'return' as const
          }))
      )
      if (!lines.length) {
        ElMessage.warning('所选明细已全部退货，请重新选择')
        return
      }
      await (
        props.kind === 'other_outbound' ? otherReturnDrawerRef.value : salesReturnDrawerRef.value
      )?.handleOpen({
        mode: 'copy',
        document: {
          ...first,
          warehouseId: documents.every((doc) => doc.warehouseId === first.warehouseId)
            ? first.warehouseId
            : null,
          projectId: documents.every((doc) => doc.projectId === first.projectId)
            ? first.projectId
            : null,
          lines
        }
      })
    } catch (error) {
      notifyFriendlyError(error, '下推失败，请重试')
    } finally {
      pushingSales.value = false
    }
  }
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
    canOpen: () => hasAuth(permission.value.View),
    fetchDocument: async (id) => {
      const document = await fetchWmsInitialSalesDocument(id)
      if (
        document.kind !== props.kind &&
        !(props.kind === 'other_outbound' && document.kind === 'other_return')
      )
        throw new Error('单据类型不匹配')
      return document
    },
    openDocument: async (document) => {
      const target = document.kind === 'other_return' ? otherReturnDrawerRef.value : drawerRef.value
      await target?.handleOpen({ mode: 'view', document })
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
      : props.kind === 'other_outbound'
        ? '其他出库审核后扣减库存，退回审核后增加库存；单据与库存流水同步记账。'
        : isReturn.value
          ? '退货审核后增加库存并生成收料流水；仅退款不增加库存。列表数量以负数呈现。'
          : '出库审核后扣减库存并生成发料流水；库存不足或批次不匹配时审核不通过。'
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
      Withdraw: 'WmsInitialSalesOutbound:Withdraw',
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
      Withdraw: 'WmsInitialSalesReturn:Withdraw',
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
      Withdraw: 'WmsSalesOutbound:Withdraw',
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
      Withdraw: 'WmsSalesReturnDocument:Withdraw',
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
      Withdraw: 'WmsOtherOutbound:Withdraw',
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
      Withdraw: 'WmsOtherOutbound:Withdraw',
      Approve: 'WmsOtherOutbound:Approve'
    }
  } as const
  const permission = computed(() => permissionCodes[props.kind])
  const search = reactive({
    displayMode: 'document' as 'document' | 'line',
    status: '',
    customer: '',
    projectName: '',
    materialDescription: '',
    materialCode: ''
  })
  const displayMode = toRef(search, 'displayMode')
  watch(displayMode, () => void refresh())
  const displayModeOptions = useDictionaryOptions('commonDocumentDisplayMode')
  const searchItems: SearchFormItem[] = [
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
      row.kind === 'other_outbound' &&
      Number(row[column.property || '']) < 0 &&
      ['quantity', 'baseQuantity', 'amount', 'taxAmount', 'totalAmount'].includes(
        column.property || ''
      )
    )
      return 'opening-return-negative-cell'
    if (
      returnKinds.includes(String(row.kind) as WmsInitialSalesKind) &&
      Number(row[column.property || '']) < 0 &&
      [
        'quantity',
        'baseQuantity',
        'auxiliaryQuantity',
        'auxiliaryQuantity2',
        'amount',
        'taxAmount',
        'discountAmount',
        'totalAmount'
      ].includes(column.property || '')
    )
      return 'opening-return-negative-cell'
    return column.property === 'quantity' &&
      Number(row.quantity) < 0 &&
      returnKinds.some((kind) => kind === row.kind)
      ? 'initial-sales-negative-cell'
      : ''
  }
  function onSelectionChange(rows: Record<string, unknown>[]): void {
    selectedRows.value = rows.flatMap(({ documentId, lineId, kind, status }) =>
      typeof documentId === 'string' && typeof lineId === 'string'
        ? [{ documentId, lineId, kind, status }]
        : []
    )
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
    action: 'submit' | 'approve' | 'withdraw' | 'delete'
  ): Promise<void> {
    if (workingId.value || bulkDeleting.value) return
    const label = { submit: '提交', withdraw: '撤回提交', approve: '审核', delete: '删除' }[action]
    const resources = [{ id: row.documentId, label: row.documentNo }]
    deleteResourceLabel.value = row.kind === 'other_return' ? '其他出库退回单' : title.value
    workingId.value = row.documentId
    try {
      if (action === 'submit' && ['other_outbound', 'other_return'].includes(row.kind)) {
        const document = await fetchWmsInitialSalesDocument(row.documentId)
        if (!document.customerId && !document.usingDepartmentId) {
          await confirmAction('领用部门和客户不能同时为空', '请补充业务归属', {
            showCancelButton: false,
            confirmButtonText: '返回补充'
          })
          return
        }
      }
      if (action === 'delete' && (await inspectDeleteReferences(resources))) return
      await confirmAction(
        `${action === 'withdraw' ? '撤回后恢复暂存，可修改或删除；关联审批待办将取消。' : ''}${action === 'approve' && !row.kind.startsWith('initial_') ? (['return', 'other_return'].includes(row.kind) ? '审核后实物退回将增加库存，仅退款不变更库存。' : '审核后将扣减库存并生成库存流水。') : ''}确定${label} ${row.documentNo}？`,
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
            onClick: async () => {
              await drawerRef.value?.handleOpen({ mode: 'create' })
              await drawerRef.value?.openSourceChoice({ key: 'issue_request', label: '出库申请单' })
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
      hidden: isDailySales.value,
      label: '下推',
      icon: 'ri:file-transfer-line',
      permission: permission.value.Push,
      buttonProps: { type: 'info', plain: true },
      onClick: () => pushDialogRef.value?.handleOpen(undefined, { title: '下推期初应收' })
    }
  ])
  const selectionActions = computed<ArtTableQueryHeaderAction[]>(() => [
    bulkDeleteAction(),
    ...(isDailySales.value
      ? [
          {
            key: 'sales-push',
            slot: 'sales-push',
            label: '下推',
            permission: permission.value.Push
          },
          {
            key: 'batch-print',
            label: '批量打印',
            icon: 'ri:printer-line',
            permission:
              props.kind === 'other_outbound'
                ? 'WmsOtherOutbound:Print'
                : props.kind === 'outbound'
                  ? 'WmsSalesOutbound:Print'
                  : 'WmsSalesReturnDocument:Print',
            buttonProps: { loading: printing.value },
            onClick: printSelection
          }
        ]
      : [])
  ])
  function statusLabel(value: WmsInitialSalesListRow['status']): string {
    return { draft: '暂存', submitted: '已提交', approved: '已审核' }[value]
  }

  function moreActions(row: WmsInitialSalesListRow): ButtonMoreItem[] {
    return [
      { key: 'copy', label: '复制单据', icon: 'ri:file-copy-line', auth: permission.value.Copy },
      ...(row.status === 'approved' && row.kind === props.kind && hasAuth(permission.value.Push)
        ? pushActions.value
        : []),
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
              key: 'withdraw',
              label: '撤回提交',
              icon: 'ri:arrow-go-back-line',
              auth: permission.value.Withdraw
            },
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
    if (pushActions.value.some((action) => action.key === item.key)) {
      void onSalesPush(item, [row])
    } else if (item.key === 'copy' || item.key === 'edit') {
      void openDocument(item.key, row)
    } else if (
      item.key === 'submit' ||
      item.key === 'approve' ||
      item.key === 'withdraw' ||
      item.key === 'delete'
    ) {
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
      ...wmsDocumentClassificationColumns<WmsInitialSalesListRow>(),
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
      ...(props.kind === 'other_outbound'
        ? [{ prop: 'departmentName', label: '领用部门', minWidth: 160 }]
        : []),
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
            {['return', 'other_outbound', 'other_return'].includes(row.kind) ? '￥' : ''}
            {Number(row.quantity).toFixed(4)}
          </span>
        )
      },
      ...(displayMode.value === 'line' &&
      ['initial_return', 'return', 'other_outbound', 'other_return'].includes(props.kind)
        ? ([
            {
              prop: 'baseQuantity',
              label: '基本数量',
              minWidth: 115,
              align: 'right',
              formatter: (row) =>
                `${['return', 'other_outbound', 'other_return'].includes(row.kind) ? '￥' : ''}${Number(row.baseQuantity).toFixed(4)}`
            },
            { prop: 'auxiliaryQuantity', label: '辅助数量', minWidth: 115, align: 'right' },
            { prop: 'auxiliaryQuantity2', label: '辅助数量2', minWidth: 125, align: 'right' }
          ] as ColumnOption<WmsInitialSalesListRow>[])
        : []),
      { prop: 'unitPrice', label: '单价(元)', minWidth: 108, align: 'right' },
      { prop: 'taxInclusiveUnitPrice', label: '含税单价(元)', minWidth: 125, align: 'right' },
      { prop: 'taxRate', label: '税率(%)', minWidth: 100, align: 'right' },
      {
        prop: 'amount',
        label: '金额(元)',
        minWidth: 110,
        align: 'right',
        formatter: (row) =>
          `${['return', 'other_outbound', 'other_return'].includes(row.kind) ? '￥' : ''}${Number(row.amount).toFixed(2)}`
      },
      ...(props.kind === 'initial_return'
        ? ([
            { prop: 'discountAmount', label: '折扣额(元)', minWidth: 115, align: 'right' }
          ] as ColumnOption<WmsInitialSalesListRow>[])
        : []),
      {
        prop: 'taxAmount',
        label: '税额(元)',
        minWidth: 110,
        align: 'right',
        formatter: (row) =>
          `${['return', 'other_outbound', 'other_return'].includes(row.kind) ? '￥' : ''}${Number(row.taxAmount).toFixed(2)}`
      },
      {
        prop: 'totalAmount',
        label: '价税合计(元)',
        minWidth: 130,
        align: 'right',
        formatter: (row) =>
          `${['return', 'other_outbound', 'other_return'].includes(row.kind) ? '￥' : ''}${Number(row.totalAmount).toFixed(2)}`
      },
      { prop: 'batchNo', label: '批号', minWidth: 120 },
      { prop: 'warehouseName', label: '仓库', minWidth: 140 },
      { prop: 'binName', label: '仓位', minWidth: 120 },
      {
        prop: 'stockType',
        label: '库存类型',
        minWidth: 100,
        formatter: (row) =>
          userStore.getDictItemByValue('wmsInitialStockType', row.stockType)?.label || row.stockType
      },
      {
        prop: 'stockStatus',
        label: '库存状态',
        minWidth: 100,
        formatter: (row) =>
          userStore.getDictItemByValue('wmsInitialStockCondition', row.stockStatus)?.label ||
          row.stockStatus
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
