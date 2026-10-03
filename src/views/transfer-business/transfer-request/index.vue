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
          rowKey: 'lineId',
          tableLayout: 'fixed',
          emptyText: '当前范围暂无调拨申请单',
          emptyDescription: '新建申请单并填写物料、调出仓库和调入仓库。'
        }"
        focusable
      />
      <TransferRequestDrawer ref="drawerRef" @success="refresh" />
      <ArtDialog ref="pushDialogRef" size="sm" :show-footer="false">
        <ArtEntitySummary
          icon="ri:route-line"
          eyebrow="TRANSFER MODE"
          title="选择下推方式"
          :description="`调拨申请 ${pushRow?.documentNo || ''} 已审核，请选择执行方式。`"
        />
        <div class="mt-5 grid gap-3 sm:grid-cols-2">
          <ElButton type="primary" @click="push('direct')">直接调拨</ElButton>
          <ElButton type="warning" plain @click="push('in_transit')">调出在途</ElButton>
        </div>
      </ArtDialog>
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { ElMessage, ElTag } from 'element-plus'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
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
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import {
    changeWmsTransferRequestStatus,
    fetchWmsInitialOptions,
    fetchWmsTransferRequestPage,
    pushWmsTransferRequest,
    type WmsInitializationOption,
    type WmsStockQuery,
    type WmsTransferRequestRow
  } from '@wms/api'
  import TransferRequestDrawer from './modules/transfer-request-drawer.vue'

  defineOptions({ name: 'WmsTransfer' })
  const { confirmAction } = useArtFeedback()
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const { defaultWriteTenantId } = useTenantScopeFormPolicy()
  const tableRef = ref<ArtTableQueryExpose>()
  const drawerRef = ref<InstanceType<typeof TransferRequestDrawer>>()
  const pushDialogRef = ref<ArtDialogExpose>()
  const pushRow = ref<WmsTransferRequestRow>()
  const workingId = ref<string>()
  const documentTypes = ref<WmsInitializationOption[]>([])
  const search = reactive({
    status: '',
    documentTypeId: '',
    applicationDateRange: [] as string[],
    projectName: '',
    materialDescription: '',
    materialCode: '',
    keyword: ''
  })
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
  const searchItems = computed<SearchFormItem[]>(() => [
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
      key: 'documentTypeId',
      type: 'select',
      props: {
        clearable: true,
        filterable: true,
        placeholder: '全部类型',
        options: documentTypes.value.map((row) => ({ value: row.id, label: row.name }))
      }
    },
    {
      label: '申请日期',
      key: 'applicationDateRange',
      type: 'daterange',
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
  function fetchRows(query: WmsStockQuery & { applicationDateRange?: string[] }) {
    return fetchWmsTransferRequestPage({
      ...query,
      tenantId: effectiveTenantId.value || undefined,
      applicationDateStart: query.applicationDateRange?.[0],
      applicationDateEnd: query.applicationDateRange?.[1]
    })
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
    action: 'submit' | 'approve' | 'delete'
  ): Promise<void> {
    if (workingId.value) return
    const label = { submit: '提交', approve: '审核', delete: '删除' }[action]
    try {
      await confirmAction(`确定${label} ${row.documentNo}？`, `${label}调拨申请单`, {
        type: action === 'delete' ? 'warning' : 'info',
        confirmButtonText: `确定${label}`
      })
      workingId.value = row.documentId
      await changeWmsTransferRequestStatus(row.documentId, action)
      await refresh()
    } catch {
      /* 取消和接口错误由组件处理。 */
    } finally {
      workingId.value = undefined
    }
  }
  async function openPush(row: WmsTransferRequestRow): Promise<void> {
    pushRow.value = row
    await pushDialogRef.value?.handleOpen(undefined, { title: '下推调拨申请' })
  }
  async function push(mode: 'direct' | 'in_transit'): Promise<void> {
    if (!pushRow.value) return
    try {
      await pushWmsTransferRequest(pushRow.value.documentId, mode)
      await pushDialogRef.value?.handleClose()
      await refresh()
    } catch {
      /* 接口层统一提示。 */
    }
  }
  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      type: 'add',
      label: '新增调拨申请单',
      permission: 'WmsTransfer:Create',
      buttonProps: { plain: false },
      onClick: openCreate
    },
    {
      key: 'import',
      label: '导入',
      icon: 'ri:file-upload-line',
      permission: 'WmsTransfer:Import',
      buttonProps: { type: 'success', plain: true },
      onClick: openCreate
    },
    {
      type: 'export',
      label: '导出当前范围',
      permission: 'WmsTransfer:Export',
      buttonProps: { type: 'warning', plain: true },
      exportFilename: '调拨申请单',
      exportData: async () => (await fetchRows({ ...search, current: 1, size: 5000 })).data,
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
              key: 'approve',
              label: '审核单据',
              icon: 'ri:checkbox-circle-line',
              auth: 'WmsTransfer:Approve'
            }
          ]
        : []),
      ...(row.status === 'approved' && !row.pushedAt
        ? [{ key: 'push', label: '下推调拨', icon: 'ri:route-line', auth: 'WmsTransfer:Push' }]
        : [])
    ]
  }
  function onMoreAction(item: ButtonMoreItem, row: WmsTransferRequestRow): void {
    if (item.key === 'copy' || item.key === 'edit') void openDocument(item.key, row)
    else if (item.key === 'submit' || item.key === 'approve' || item.key === 'delete')
      void transition(row, item.key)
    else if (item.key === 'push') void openPush(row)
  }
  function columnsFactory(): ColumnOption<WmsTransferRequestRow>[] {
    return [
      {
        prop: 'documentNo',
        label: '单据编号',
        fixed: 'left',
        minWidth: 185,
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.documentNo}
            secondary={`第 ${row.lineNo} 行 · ${row.documentTypeName}`}
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
      { prop: 'materialCode', label: '物料编码', minWidth: 125 },
      { prop: 'materialDescription', label: '物料描述', minWidth: 180, showOverflowTooltip: true },
      { prop: 'specificationModel', label: '规格型号', minWidth: 125 },
      { prop: 'projectName', label: '项目名称', minWidth: 150, showOverflowTooltip: true },
      { prop: 'constructionNo', label: '施工号', minWidth: 115 },
      { prop: 'inventoryUnitName', label: '库存单位', width: 98 },
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
        formatter: (row) => stockTypeLabels[row.stockType] || row.stockType || '—'
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
  }
  watch(
    effectiveTenantId,
    async (tenantId) => {
      documentTypes.value = tenantId
        ? (await fetchWmsInitialOptions('mdm_document_type', tenantId)).filter(
            (row) => row.code === 'WMS_TRANSFER_REQUEST_STANDARD' || row.name.includes('调拨')
          )
        : []
    },
    { immediate: true }
  )
</script>
