<template>
  <ArtPermissionGuard permission="WmsIssueRequest:View" :resource-name="displayTitle">
    <div class="business-workspace-page art-full-height min-w-0">
      <BusinessWorkspaceHeader
        eyebrow="MATERIAL ISSUE REQUEST"
        :title="displayTitle"
        :description="displayDescription"
        icon="ri:file-list-3-line"
        density="compact"
        :tags="[
          { label: '申请类型与项目', type: 'primary' },
          { label: '审核后分批出库', type: 'success' }
        ]"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>
      <ElAlert v-if="optionError" type="warning" :closable="false" show-icon class="mb-3">
        筛选项加载失败。<ElButton link type="primary" :loading="optionsLoading" @click="loadOptions"
          >重新加载</ElButton
        >
      </ElAlert>
      <ElAlert
        v-if="linkedRequestError || linkedRequestLoading"
        :type="linkedRequestError ? 'error' : 'info'"
        :closable="false"
        show-icon
        class="mb-3"
      >
        <span>{{
          linkedRequestLoading
            ? '正在加载关联出库申请…'
            : '关联出库申请加载失败，请检查权限后重试。'
        }}</span>
        <ElButton link type="primary" :loading="linkedRequestLoading" @click="loadLinkedRequest">
          重新加载关联申请
        </ElButton>
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
        header-actions-placement="workspace"
        :search-bar-props="{ span: 6, labelWidth: 82 }"
        :table-props="{
          rowKey: getDocumentDetailRowKey,
          spanMethod: mergeDocumentCells,
          tableLayout: 'fixed',
          emptyText: `当前范围暂无${displayTitle}`,
          emptyDescription: '新增申请并填写申请类型、日期、项目、物料和数量。'
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
      <IssueRequestCreateDialog ref="createRef" @success="refresh" />
      <IssueRequestDetailDrawer ref="detailRef" @success="refresh" />
      <MasterDataDeleteGuard ref="deleteGuardRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { formatDateTimeValue } from '@/utils/ui/format'
  import { replaceReactiveModel } from '@/utils/form/model'
  import { formatUnitDisplayName } from '@/utils/business/unit-display'
  import { ElMessage, ElTag } from 'element-plus'
  import { useRoute, useRouter } from 'vue-router'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useRouteDocumentDrawer } from '@/hooks/core/useRouteDocumentDrawer'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { recordDeleteGuardOptions } from '@/hooks/core/useRecordDeleteGuard'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
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
    getDocumentDetailRowKey,
    documentGroupSpan,
    expandDocumentLines,
    loadAllLinePages,
    paginateDetailRows
  } from '@/utils/business/document-detail-list'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import {
    cancelWmsIssueRequest,
    copyWmsIssueRequest,
    deleteWmsIssueRequest,
    fetchWmsIssueRequestPage,
    fetchWmsIssueRequest,
    fetchWmsIssueRequestAllocations,
    fetchWmsIssueRequestLinesForDocuments,
    fetchWmsProjectSections,
    fetchWmsProjects,
    fetchWmsWarehouses,
    reviewWmsIssueRequest,
    submitWmsIssueRequest,
    type WmsIssueRequest,
    type WmsIssueRequestLine,
    type WmsIssueRequestStatus,
    type WmsProject,
    type WmsProjectSection,
    type WmsStockQuery,
    type WmsWarehouse
  } from '@wms/api'
  import IssueRequestCreateDialog from './modules/issue-request-create-dialog.vue'
  import IssueRequestDetailDrawer from './modules/issue-request-detail-drawer.vue'

  defineOptions({ name: 'WmsIssueRequest' })
  const props = withDefaults(defineProps<{ displayTitle?: string }>(), {
    displayTitle: '出库申请单'
  })
  const displayTitle = computed(() => props.displayTitle)
  const displayDescription = computed(() =>
    props.displayTitle === '出库申请单'
      ? '登记项目或工单的多物料出库申请，审核后按批次和序列号分次出库，申请余额随库存流水核销。'
      : 'MES 工单提出多物料领料需求，审核后按批次和 SN 分次出库，申请余额随库存流水核销。'
  )
  const { confirmAction } = useArtFeedback()
  const deleteGuardRef = ref<InstanceType<typeof MasterDataDeleteGuard>>()
  async function inspectDraftReferences(row: WmsIssueRequest): Promise<boolean> {
    if (!deleteGuardRef.value) {
      ElMessage.error('关联校验尚未就绪，请刷新页面后重试删除')
      return true
    }
    const options = recordDeleteGuardOptions(
      { table: 'wms_issue_request', ids: [row.id] },
      '出库申请',
      [{ id: row.id, label: row.documentNo }],
      {
        wms_issue_request_allocation: {
          label: '申请出库记录',
          routeName: 'WmsIssueRequest',
          canNavigate: () => hasAuth('WmsIssueRequest:View')
        }
      }
    )
    const fetchDependencies = options.fetchDependencies
    if (!fetchDependencies) return true
    return deleteGuardRef.value.inspect({
      ...options,
      fetchDependencies: async (ids) => {
        const dependencies = await fetchDependencies(ids)
        const allocations = dependencies.some(
          (item) => item.dependencyCode === 'wms_issue_request_allocation'
        )
          ? await fetchWmsIssueRequestAllocations(row.id)
          : []
        // 暂存申请的自有明细由受控删除函数清理；已发生的出库记录仍阻止删除。
        return dependencies
          .filter((item) => item.dependencyCode !== 'wms_issue_request_line')
          .map((item) => {
            if (item.dependencyCode !== 'wms_issue_request_allocation') return item
            const allocation = allocations.find((entry) => entry.id === item.targetId)
            return {
              ...item,
              targetId: row.id,
              recordNo: allocation?.movement?.referenceNo || `${row.documentNo} · 出库记录`,
              recordSummary: allocation
                ? `批次 ${allocation.batch?.batchNo || '待核对'} · 已出库 ${allocation.quantity}`
                : '当前账号无法查看出库明细，请联系有权限的人员核对',
              recordStatus: '已出库'
            }
          })
      }
    })
  }
  const { hasAnyAuth, hasAuth } = useAuth()
  const canPostStock = () => hasAnyAuth(['WmsStockOperation:Issue', 'MdmInventoryBatch:Issue'])
  const route = useRoute()
  const router = useRouter()
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const tableRef = ref<ArtTableQueryExpose>()
  const displayMode = ref<'document' | 'line'>('document')
  type IssueListRow = WmsIssueRequest & {
    detailRowId?: string
    detailLine?: WmsIssueRequestLine
    detailGroupStart?: boolean
  }
  const visibleRows = ref<IssueListRow[]>([])
  const lineProperties = new Set([
    'materialCodes',
    'materialDescriptions',
    'requestedQuantityTotal',
    'detailIssuedQuantity',
    'detailUnit'
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
  const createRef = ref<InstanceType<typeof IssueRequestCreateDialog>>()
  const detailRef = ref<InstanceType<typeof IssueRequestDetailDrawer>>()
  const warehouses = ref<WmsWarehouse[]>([])
  const projects = ref<WmsProject[]>([])
  const sections = ref<WmsProjectSection[]>([])
  const optionError = ref(false)
  const optionsLoading = ref(true)
  const workingId = ref<string>()
  const search = reactive({
    status: '',
    requestType: '',
    applicationDateRange: [] as string[],
    projectName: '',
    materialDescription: '',
    materialCode: '',
    applicantKeyword: ''
  })
  const filterTenantId = computed(() => effectiveTenantId.value || undefined)
  const statusLabels: Record<WmsIssueRequestStatus, string> = {
    draft: '暂存',
    submitted: '待审核',
    approved: '待领料',
    partially_issued: '部分领料',
    fulfilled: '已领完',
    rejected: '已驳回',
    cancelled: '已取消'
  }
  const requestTypeLabels: Record<string, string> = {
    damage_outbound: '货损出库',
    consumables_outbound: '耗材出库',
    scrap_outbound: '报废出库',
    welfare_use: '福利领用',
    office_supplies_use: '办公用品领用',
    labor_protection_use: '劳保用品领用'
  }
  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      permission: 'WmsIssueRequest:Add',
      type: 'add',
      label: `新增${displayTitle.value}`,
      buttonProps: { plain: false },
      disabled: () => optionError.value || optionsLoading.value,
      onClick: () => {
        if (optionError.value || optionsLoading.value) return
        void createRef.value?.handleOpen({
          tenantId: filterTenantId.value,
          warehouses: warehouses.value,
          projects: projects.value
        })
      }
    },
    {
      type: 'export',
      label: '导出当前范围',
      permission: 'WmsIssueRequest:Export',
      buttonProps: { type: 'warning', plain: true },
      exportFilename: displayTitle.value,
      exportData: async () =>
        (await fetchRows({ ...search, current: 1, size: 500, exportAll: true })).data.map(
          (row) => ({
            ...row,
            status: statusLabels[row.status],
            requestType: requestTypeLabels[row.requestType] || row.requestType
          })
        ),
      exportColumns: [
        { title: '单据编号', key: 'documentNo' },
        { title: '申请类型', key: 'requestType' },
        { title: '申请日期', key: 'applicationDate' },
        { title: '单据状态', key: 'status' },
        { title: '项目名称', key: 'projectName' },
        { title: '物料编码', key: 'materialCodes' },
        { title: '物料描述', key: 'materialDescriptions' },
        { title: '申请人', key: 'applicantName' }
      ]
    }
  ])
  const searchItems = computed<SearchFormItem[]>(() => [
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
      label: '申请类型',
      key: 'requestType',
      type: 'select',
      props: {
        clearable: true,
        placeholder: '全部类型',
        options: Object.entries(requestTypeLabels).map(([value, label]) => ({ value, label }))
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
      label: '申请人',
      key: 'applicantKeyword',
      type: 'input',
      props: { clearable: true, placeholder: '姓名或工号' }
    }
  ])
  function projectName(id: string | null): string {
    return id ? projects.value.find((row) => row.id === id)?.projectName || '历史项目' : '公共库存'
  }
  async function fetchRows(
    query: WmsStockQuery & { applicationDateRange?: string[]; exportAll?: boolean }
  ) {
    const exportAll = query.exportAll === true
    const applicationDateRange = Array.isArray(query.applicationDateRange)
      ? query.applicationDateRange
      : []
    const fetchPage = (page: WmsStockQuery) =>
      fetchWmsIssueRequestPage({
        ...page,
        applicationDateStart: applicationDateRange?.[0],
        applicationDateEnd: applicationDateRange?.[1],
        tenantId: filterTenantId.value
      })
    if (displayMode.value === 'document') {
      if (exportAll) {
        const data = await loadAllLinePages(fetchPage, query)
        return { data, total: data.length }
      }
      visibleRows.value = []
      return fetchPage(query)
    }
    const documents = await loadAllLinePages(fetchPage, query)
    const lines = await fetchWmsIssueRequestLinesForDocuments(
      documents.map((document) => document.id)
    )
    const linesByDocument = new Map<string, WmsIssueRequestLine[]>()
    for (const line of lines) {
      const group = linesByDocument.get(line.requestId) || []
      group.push(line)
      linesByDocument.set(line.requestId, group)
    }
    const rows = expandDocumentLines(
      documents,
      (document) => linesByDocument.get(document.id) || [],
      (line) => line.id
    )
    if (exportAll) {
      return {
        data: rows.map((row) => ({
          ...row,
          materialCodes: row.detailLine.material?.materialCode || row.materialCodes,
          materialDescriptions: row.detailLine.material?.materialName || row.materialDescriptions
        })),
        total: rows.length
      }
    }
    const result = paginateDetailRows(
      rows,
      (query.current - 1) * query.size,
      query.current * query.size - 1
    )
    visibleRows.value = result.data
    return result
  }
  function openDetail(row: WmsIssueRequest): void {
    void detailRef.value?.handleOpen(row, projectName(row.projectId))
  }
  async function refresh(): Promise<void> {
    await tableRef.value?.refreshUpdate()
  }
  async function loadOptions(): Promise<void> {
    optionsLoading.value = true
    optionError.value = false
    try {
      ;[warehouses.value, projects.value, sections.value] = await Promise.all([
        fetchWmsWarehouses(),
        fetchWmsProjects(),
        fetchWmsProjectSections()
      ])
    } catch {
      optionError.value = true
    } finally {
      optionsLoading.value = false
    }
  }
  async function review(row: WmsIssueRequest, decision: 'approve' | 'reject'): Promise<void> {
    if (workingId.value) return
    try {
      await confirmAction(
        decision === 'approve'
          ? `确认审核通过领料申请 ${row.documentNo}？通过后可按批次分次领料。`
          : `确认驳回领料申请 ${row.documentNo}？`,
        decision === 'approve' ? '审核领料申请' : '驳回领料申请',
        { type: 'warning', confirmButtonText: decision === 'approve' ? '审核通过' : '确认驳回' }
      )
      workingId.value = row.id
      await reviewWmsIssueRequest(row.id, decision)
      await refresh()
    } catch {
      // 取消确认与 API 错误由对应组件处理。
    } finally {
      workingId.value = undefined
    }
  }
  async function submit(row: WmsIssueRequest): Promise<void> {
    if (workingId.value) return
    try {
      await confirmAction(`确认提交出库申请 ${row.documentNo}？`, '提交出库申请', {
        type: 'info',
        confirmButtonText: '确认提交'
      })
      workingId.value = row.id
      await submitWmsIssueRequest(row.id)
      await refresh()
    } catch {
      // 取消确认与 API 错误由对应组件处理。
    } finally {
      workingId.value = undefined
    }
  }
  async function duplicate(row: WmsIssueRequest): Promise<void> {
    if (workingId.value) return
    try {
      await confirmAction(`确认复制出库申请 ${row.documentNo}？`, '复制出库申请', {
        type: 'info',
        confirmButtonText: '确认复制'
      })
      workingId.value = row.id
      await copyWmsIssueRequest(row.id)
      await refresh()
    } catch {
      // 取消确认与 API 错误由对应组件处理。
    } finally {
      workingId.value = undefined
    }
  }
  async function removeDraft(row: WmsIssueRequest): Promise<void> {
    if (workingId.value) return
    workingId.value = row.id
    try {
      if (await inspectDraftReferences(row)) return
      await confirmAction(`确认删除暂存申请 ${row.documentNo}？`, '删除出库申请', {
        type: 'warning',
        confirmButtonText: '确认删除'
      })
      await deleteWmsIssueRequest(row.id)
      await refresh()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close') await inspectDraftReferences(row)
      // 取消确认与 API 错误由对应组件处理。
    } finally {
      workingId.value = undefined
    }
  }
  async function cancel(row: WmsIssueRequest): Promise<void> {
    if (workingId.value) return
    try {
      await confirmAction(`确定取消领料申请 ${row.documentNo}？`, '取消领料申请', {
        type: 'warning',
        confirmButtonText: '确定取消'
      })
      workingId.value = row.id
      await cancelWmsIssueRequest(row.id)
      await refresh()
    } catch {
      // 取消确认与 API 错误由对应组件处理。
    } finally {
      workingId.value = undefined
    }
  }
  function columnsFactory(): ColumnOption<IssueListRow>[] {
    return [
      {
        prop: 'documentNo',
        label: '单据编号',
        minWidth: 195,
        fixed: 'left',
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.documentNo}
            secondary={formatDateTimeValue(row.createdAt, { emptyText: '' })}
            icon="ri:file-list-3-line"
          />
        )
      },
      {
        prop: 'requestType',
        label: '申请类型',
        minWidth: 120,
        formatter: (row) => requestTypeLabels[row.requestType] || row.requestType
      },
      { prop: 'applicationDate', label: '申请日期', minWidth: 118 },
      { prop: 'documentTypeName', label: '单据类型', minWidth: 150, showOverflowTooltip: true },
      {
        prop: 'status',
        label: '状态',
        width: 115,
        formatter: (row) => (
          <ElTag
            type={
              row.status === 'fulfilled'
                ? 'success'
                : row.status === 'partially_issued'
                  ? 'warning'
                  : row.status === 'approved'
                    ? 'primary'
                    : 'info'
            }
            size="small"
          >
            {statusLabels[row.status]}
          </ElTag>
        )
      },
      { prop: 'applicantName', label: '申请人', minWidth: 110 },
      { prop: 'departmentName', label: '领用部门', minWidth: 150, showOverflowTooltip: true },
      { prop: 'customerName', label: '客户', minWidth: 150, showOverflowTooltip: true },
      {
        prop: 'warehouseId',
        label: '仓库',
        minWidth: 170,
        formatter: (row) => row.warehouseName || row.warehouseCode || '—'
      },
      {
        prop: 'projectId',
        label: '项目 / 施工号',
        minWidth: 195,
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.projectName || projectName(row.projectId)}
            secondary={row.constructionNo || '非项目业务'}
          />
        )
      },
      {
        prop: 'materialCodes',
        label: '物料编码',
        minWidth: 170,
        showOverflowTooltip: true,
        formatter: (row) => row.detailLine?.material?.materialCode || row.materialCodes || '—'
      },
      {
        prop: 'materialDescriptions',
        label: '物料描述',
        minWidth: 210,
        showOverflowTooltip: true,
        formatter: (row) =>
          row.detailLine?.material?.materialName || row.materialDescriptions || '—'
      },
      {
        prop: 'requestedQuantityTotal',
        label: '申请数量',
        minWidth: 110,
        align: 'right',
        formatter: (row) => row.detailLine?.requestedQuantity ?? row.requestedQuantityTotal ?? '—'
      },
      ...(displayMode.value === 'line'
        ? [
            {
              prop: 'detailIssuedQuantity',
              label: '已出库数量',
              minWidth: 110,
              align: 'right' as const,
              formatter: (row: IssueListRow) => row.detailLine?.issuedQuantity ?? 0
            },
            {
              prop: 'detailUnit',
              label: '基本单位',
              minWidth: 100,
              formatter: (row: IssueListRow) =>
                formatUnitDisplayName(row.detailLine?.material?.baseUnit?.unitName)
            }
          ]
        : []),
      { prop: 'remark', label: '备注', minWidth: 180, showOverflowTooltip: true },
      {
        prop: 'operation',
        label: '操作',
        width: 220,
        fixed: 'right',
        formatter: (row) => (
          <BusinessTableRowActions>
            <ArtButtonTable
              type="view"
              label="查看明细"
              permission="WmsIssueRequest:View"
              onClick={() => openDetail(row)}
            />
            <ArtButtonTable
              type="edit"
              icon="ri:file-copy-line"
              label="复制"
              permission="WmsIssueRequest:Copy"
              disabled={Boolean(workingId.value)}
              onClick={() => duplicate(row)}
            />
            {row.status === 'draft' && (
              <>
                <ArtButtonTable
                  type="edit"
                  icon="ri:send-plane-line"
                  label="提交"
                  permission="WmsIssueRequest:Submit"
                  disabled={Boolean(workingId.value)}
                  onClick={() => submit(row)}
                />
                <ArtButtonTable
                  type="delete"
                  label="删除"
                  permission="WmsIssueRequest:Delete"
                  disabled={Boolean(workingId.value)}
                  onClick={() => removeDraft(row)}
                />
              </>
            )}
            {row.status === 'submitted' && (
              <>
                <ArtButtonTable
                  type="edit"
                  icon="ri:check-line"
                  label="审核通过"
                  permission="WmsIssueRequest:Approve"
                  disabled={Boolean(workingId.value)}
                  onClick={() => review(row, 'approve')}
                />
                <ArtButtonTable
                  type="edit"
                  icon="ri:close-line"
                  label="驳回"
                  permission="WmsIssueRequest:Approve"
                  disabled={Boolean(workingId.value)}
                  onClick={() => review(row, 'reject')}
                />
                <ArtButtonTable
                  type="delete"
                  label="取消"
                  permission="WmsIssueRequest:Cancel"
                  disabled={Boolean(workingId.value)}
                  onClick={() => cancel(row)}
                />
              </>
            )}
            {['approved', 'partially_issued'].includes(row.status) && canPostStock() && (
              <>
                <ArtButtonTable
                  type="edit"
                  icon="ri:logout-box-r-line"
                  label="办理出库"
                  permission="WmsIssueRequest:Issue"
                  onClick={() => openDetail(row)}
                />
              </>
            )}
          </BusinessTableRowActions>
        )
      }
    ]
  }
  onMounted(async () => {
    await loadOptions()
    const requestedWorkOrderId = route.query.workOrderId
    if (
      typeof requestedWorkOrderId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        requestedWorkOrderId
      ) ||
      optionError.value ||
      !hasAuth('WmsIssueRequest:Add')
    )
      return
    await createRef.value?.handleOpen({
      tenantId: filterTenantId.value,
      warehouses: warehouses.value,
      projects: projects.value,
      workOrderId: requestedWorkOrderId
    })
    await router.replace({ path: route.path, query: { ...route.query, workOrderId: undefined } })
  })
  const {
    loading: linkedRequestLoading,
    error: linkedRequestError,
    retry: loadLinkedRequest
  } = useRouteDocumentDrawer({
    routeName: 'WmsIssueRequest',
    queryKey: 'recordId',
    clearQueryOnOpen: false,
    canOpen: () =>
      route.query.resourceType === 'wms_issue_request' && hasAuth('WmsIssueRequest:View'),
    fetchDocument: fetchWmsIssueRequest,
    openDocument: async (request) => {
      await detailRef.value?.handleOpen(request, request.projectName || '未关联项目')
    }
  })
</script>
