<template>
  <ArtPermissionGuard permission="WmsInitializationClose:View" resource-name="结束初始化">
    <div class="business-workspace-page art-full-height min-w-0">
      <BusinessWorkspaceHeader
        eyebrow="INVENTORY INITIALIZATION"
        title="结束初始化"
        description="仅对已启用的公司级库存组织生成期初余额快照。结束后初始化单据进入锁定状态。"
        icon="ri:checkbox-circle-line"
        density="compact"
        :tags="[
          { label: '公司级控制', type: 'primary' },
          { label: '期初余额', type: 'success' },
          { label: '可安全反初始化', type: 'info' }
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
        :search-bar-props="{ span: 6, labelWidth: 82 }"
        :table-props="{
          rowKey: 'id',
          emptyText: '未找到符合条件的公司库存组织',
          emptyDescription: '可调整查询条件；若尚未启用，请先在“启用库存”为公司设置启用日期。'
        }"
        focusable
      />

      <ArtDialog ref="pendingDialogRef" size="lg" :show-footer="false">
        <ArtEntitySummary
          icon="ri:file-search-line"
          eyebrow="INITIALIZATION DOCUMENTS"
          :title="pendingOrganization?.organizationName || '待处理初始化单据'"
          :description="
            pendingDocuments.length
              ? `共 ${pendingDocuments.length} 张单据尚未审核，处理完成后再结束初始化。`
              : '按当前公司库存组织排查尚未审核的初始化单据。'
          "
        />
        <ArtAsyncState
          class="mt-5"
          :loading="pendingLoading"
          loading-mode="skeleton"
          :error="pendingError"
          error-title="单据排查失败"
          :empty="!pendingCloseFailure && pendingDocuments.length === 0"
          empty-text="没有待处理初始化单据"
          empty-description="该公司库存组织的初始化单据均已审核，可以返回结束初始化。"
          @retry="loadPendingDocuments"
        >
          <ElAlert
            v-if="pendingCloseFailure && pendingDocuments.length === 0"
            type="warning"
            :closable="false"
            :title="pendingCloseFailure"
            description="当前列表没有查到待处理单据，请刷新后重试；若仍无法结束初始化，请联系管理员核对服务端校验。"
          />
          <div v-else class="min-w-0">
            <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
              <span class="text-sm text-[var(--el-text-color-secondary)]">
                暂存单需先提交；已提交单需审核。
              </span>
              <ElButton :loading="pendingLoading" @click="loadPendingDocuments">刷新列表</ElButton>
            </div>
            <ArtTable
              :data="pendingDocuments"
              :columns="pendingColumns"
              :pagination="false"
              row-key="id"
              table-layout="fixed"
              max-height="420"
              class="w-full"
            />
          </div>
        </ArtAsyncState>
      </ArtDialog>
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { useRouter } from 'vue-router'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { ElButton, ElMessage, ElTag } from 'element-plus'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtTableQuery, {
    type ArtTableQueryExpose
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type { ColumnOption } from '@/types'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import {
    changeWmsInitializationStatus,
    fetchWmsInitializationStatusPage,
    fetchWmsPendingInitializationDocuments,
    type WmsPendingInitializationDocument,
    type WmsInitializationStatusRow
  } from '@/api/wms-purchase'

  const wmsInitializationStatusOptions = useDictionaryOptions('wmsInitializationStatus')

  defineOptions({ name: 'WmsInitializationClose' })

  const { confirmAction } = useArtFeedback()
  const { hasAuth } = useAuth()
  const router = useRouter()
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const tableRef = ref<ArtTableQueryExpose>()
  const pendingDialogRef = ref<ArtDialogExpose>()
  const workingId = ref<string>()
  const pendingOrganization = ref<WmsInitializationStatusRow | null>(null)
  const pendingDocuments = ref<WmsPendingInitializationDocument[]>([])
  const pendingLoading = ref(false)
  const pendingError = ref('')
  const pendingCloseFailure = ref('')
  let pendingRequestId = 0
  const search = reactive({ keyword: '', status: '' })

  const pendingPages: Record<string, { label: string; name: string; permission: string }> = {
    stock: { label: '初始库存单', name: 'WmsInitialStock', permission: 'WmsInitialStock:View' },
    'purchase:initial_inbound': {
      label: '期初采购入库单',
      name: 'WmsInitialPurchaseInbound',
      permission: 'WmsInitialPurchaseInbound:View'
    },
    'purchase:initial_return': {
      label: '期初采购退货单',
      name: 'WmsInitialPurchaseReturn',
      permission: 'WmsInitialPurchaseReturn:View'
    },
    'sales:initial_outbound': {
      label: '期初销售出库单',
      name: 'WmsInitialSalesOutbound',
      permission: 'WmsInitialSalesOutbound:View'
    },
    'sales:initial_return': {
      label: '期初销售退货单',
      name: 'WmsInitialSalesReturn',
      permission: 'WmsInitialSalesReturn:View'
    },
    'sales:return': {
      label: '销售退货单',
      name: 'WmsSalesReturnDocument',
      permission: 'WmsSalesReturnDocument:View'
    }
  }

  function pendingDocumentPage(document: WmsPendingInitializationDocument) {
    return pendingPages[
      document.source === 'stock' ? 'stock' : `${document.source}:${document.kind}`
    ]
  }

  function fallbackDocumentLabel(document: WmsPendingInitializationDocument): string {
    return document.source === 'purchase' ? '其他期初采购单' : '其他期初销售单'
  }

  function pendingStatusLabel(status: string): string {
    return status === 'draft' ? '暂存' : status === 'submitted' ? '已提交' : '待处理'
  }

  function canOpenPendingDocument(document: WmsPendingInitializationDocument): boolean {
    const page = pendingDocumentPage(document)
    return Boolean(page && hasAuth(page.permission))
  }

  async function openPendingDocument(document: WmsPendingInitializationDocument): Promise<void> {
    const page = pendingDocumentPage(document)
    if (!page || !hasAuth(page.permission)) return
    try {
      await pendingDialogRef.value?.handleClose()
      await router.push({ name: page.name, query: { documentId: document.id } })
    } catch {
      ElMessage.error('单据页面无法打开，请从仓储管理菜单查找该单号')
    }
  }

  const pendingColumns: ColumnOption<WmsPendingInitializationDocument>[] = [
    {
      prop: 'kind',
      label: '单据类型',
      minWidth: 160,
      formatter: (row) => pendingDocumentPage(row)?.label || fallbackDocumentLabel(row)
    },
    { prop: 'documentNo', label: '单据编号', minWidth: 200, showOverflowTooltip: true },
    {
      prop: 'status',
      label: '当前状态',
      width: 105,
      formatter: (row) => (
        <ElTag type={row.status === 'submitted' ? 'warning' : 'info'} size="small">
          {pendingStatusLabel(row.status)}
        </ElTag>
      )
    },
    {
      prop: 'operation',
      label: '处理',
      width: 110,
      fixed: 'right',
      formatter: (row) =>
        canOpenPendingDocument(row) ? (
          <ElButton link type="primary" onClick={() => openPendingDocument(row)}>
            查看单据
          </ElButton>
        ) : (
          <span class="text-xs text-[var(--el-text-color-secondary)]">
            {pendingDocumentPage(row) ? '无查看权限' : '请按单号查找'}
          </span>
        )
    }
  ]

  async function loadPendingDocuments(): Promise<void> {
    const organization = pendingOrganization.value
    if (!organization) return
    const requestId = ++pendingRequestId
    pendingLoading.value = true
    pendingError.value = ''
    try {
      const documents = await fetchWmsPendingInitializationDocuments(
        organization.tenantId,
        organization.id
      )
      if (requestId === pendingRequestId) pendingDocuments.value = documents
    } catch (error) {
      if (requestId === pendingRequestId) {
        pendingError.value = getFriendlySupabaseErrorMessage(
          error,
          '待处理初始化单据加载失败，请重试'
        )
      }
    } finally {
      if (requestId === pendingRequestId) pendingLoading.value = false
    }
  }

  async function showPendingDocuments(
    organization: WmsInitializationStatusRow,
    closeFailure = ''
  ): Promise<void> {
    if (pendingLoading.value && pendingOrganization.value?.id === organization.id) return
    pendingRequestId += 1
    pendingOrganization.value = organization
    pendingDocuments.value = []
    pendingError.value = ''
    pendingLoading.value = true
    pendingCloseFailure.value = closeFailure
    await pendingDialogRef.value?.handleOpen(undefined, { title: '待处理初始化单据' })
    await loadPendingDocuments()
  }

  watch(effectiveTenantId, () => {
    pendingRequestId += 1
    pendingDocuments.value = []
    pendingOrganization.value = null
    void pendingDialogRef.value?.handleClose()
  })
  const searchItems: SearchFormItem[] = [
    {
      label: '初始化状态',
      key: 'status',
      type: 'select',
      props: {
        clearable: true,
        placeholder: '全部状态',
        options: wmsInitializationStatusOptions
      }
    },
    {
      label: '公司名称',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '公司名称或编码' }
    }
  ]

  function fetchRows(query: { keyword?: string; status?: string; current: number; size: number }) {
    return fetchWmsInitializationStatusPage({
      ...query,
      tenantId: effectiveTenantId.value || undefined
    })
  }

  async function change(row: WmsInitializationStatusRow): Promise<void> {
    if (workingId.value) return
    const action = row.initializationStatus === 'initialized' ? 'reopen' : 'close'
    const actionLabel = action === 'close' ? '结束初始化' : '反初始化'
    const message =
      action === 'close'
        ? `确定结束“${row.organizationName}”的库存初始化？系统将校验全部期初单据并生成期初余额。`
        : `确定对“${row.organizationName}”执行反初始化？系统将清除该组织的期初余额快照。`
    try {
      await confirmAction(message, actionLabel, {
        type: action === 'close' ? 'warning' : 'info',
        confirmButtonText: `确定${actionLabel}`
      })
    } catch {
      return
    }
    workingId.value = row.id
    try {
      await changeWmsInitializationStatus(row.id, action)
      ElMessage.success(
        action === 'close' ? '库存初始化已结束，期初余额已生成' : '库存组织已反初始化'
      )
    } catch (error) {
      if (action === 'close') {
        await showPendingDocuments(
          row,
          getFriendlySupabaseErrorMessage(error, '结束初始化失败，请重试')
        )
      } else {
        ElMessage.error(getFriendlySupabaseErrorMessage(error, '反初始化失败，请重试'))
      }
      return
    } finally {
      workingId.value = undefined
    }
    try {
      await tableRef.value?.refreshUpdate()
    } catch {
      ElMessage.warning('库存初始化状态已更新，列表刷新失败，请手动查询')
    }
  }

  function columnsFactory(): ColumnOption<WmsInitializationStatusRow>[] {
    return [
      {
        prop: 'organizationName',
        label: '公司库存组织',
        minWidth: 280,
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.organizationName}
            secondary={row.organizationCode}
            icon="ri:building-2-line"
          />
        )
      },
      { prop: 'enabledOn', label: '启用日期', minWidth: 130 },
      {
        prop: 'initializationStatus',
        label: '初始化状态',
        minWidth: 130,
        formatter: (row) => (
          <ElTag type={row.initializationStatus === 'initialized' ? 'success' : 'info'}>
            {row.initializationStatus === 'initialized' ? '已初始化' : '未初始化'}
          </ElTag>
        )
      },
      {
        prop: 'operation',
        label: '操作',
        fixed: 'right',
        width: 120,
        formatter: (row) => (
          <BusinessTableRowActions>
            {row.initializationStatus !== 'initialized' && (
              <ArtButtonTable
                type="view"
                label="查看待处理单据"
                icon="ri:file-search-line"
                permission="WmsInitializationClose:View"
                onClick={() => showPendingDocuments(row)}
              />
            )}
            <ArtButtonTable
              type={row.initializationStatus === 'initialized' ? 'edit' : 'sign'}
              label={row.initializationStatus === 'initialized' ? '反初始化' : '结束初始化'}
              icon={
                row.initializationStatus === 'initialized'
                  ? 'ri:restart-line'
                  : 'ri:checkbox-circle-line'
              }
              permission={
                row.initializationStatus === 'initialized'
                  ? 'WmsInitializationClose:Reopen'
                  : 'WmsInitializationClose:Close'
              }
              loading={workingId.value === row.id}
              onClick={() => change(row)}
            />
          </BusinessTableRowActions>
        )
      }
    ]
  }
</script>
