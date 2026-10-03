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
        筛选项加载失败。<ElButton link type="primary" @click="loadOptions">重新加载</ElButton>
      </ElAlert>
      <ArtTableQuery
        ref="tableRef"
        v-model="search"
        :api-fn="fetchRows"
        :search-items="searchItems"
        :columns-factory="columnsFactory"
        :header-actions="headerActions"
        header-actions-placement="workspace"
        :search-bar-props="{ span: 6, labelWidth: 82 }"
        :table-props="{
          rowKey: 'id',
          tableLayout: 'fixed',
          emptyText: `当前范围暂无${displayTitle}`,
          emptyDescription: '新增申请并填写申请类型、日期、项目、物料和数量。'
        }"
        focusable
      />
      <IssueRequestCreateDialog ref="createRef" @success="refresh" />
      <IssueRequestDetailDrawer ref="detailRef" @success="refresh" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { ElTag } from 'element-plus'
  import { useRoute, useRouter } from 'vue-router'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
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
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import {
    cancelWmsIssueRequest,
    copyWmsIssueRequest,
    deleteWmsIssueRequest,
    fetchWmsIssueRequestPage,
    fetchWmsProjectSections,
    fetchWmsProjects,
    fetchWmsWarehouses,
    reviewWmsIssueRequest,
    submitWmsIssueRequest,
    type WmsIssueRequest,
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
  const { hasAnyAuth, hasAuth } = useAuth()
  const canPostStock = () => hasAnyAuth(['WmsStockOperation:Issue', 'MdmInventoryBatch:Issue'])
  const route = useRoute()
  const router = useRouter()
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const tableRef = ref<ArtTableQueryExpose>()
  const createRef = ref<InstanceType<typeof IssueRequestCreateDialog>>()
  const detailRef = ref<InstanceType<typeof IssueRequestDetailDrawer>>()
  const warehouses = ref<WmsWarehouse[]>([])
  const projects = ref<WmsProject[]>([])
  const sections = ref<WmsProjectSection[]>([])
  const optionError = ref(false)
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
      disabled: () => optionError.value,
      onClick: () =>
        void createRef.value?.handleOpen({
          tenantId: filterTenantId.value,
          warehouses: warehouses.value,
          projects: projects.value
        })
    },
    {
      type: 'export',
      label: '导出当前范围',
      permission: 'WmsIssueRequest:Export',
      buttonProps: { type: 'warning', plain: true },
      exportFilename: displayTitle.value,
      exportData: async () => (await fetchRows({ ...search, current: 1, size: 5000 })).data,
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
  function fetchRows(query: WmsStockQuery) {
    const applicationDateRange = Array.isArray(
      (query as WmsStockQuery & { applicationDateRange?: string[] }).applicationDateRange
    )
      ? (query as WmsStockQuery & { applicationDateRange?: string[] }).applicationDateRange
      : []
    return fetchWmsIssueRequestPage({
      ...query,
      applicationDateStart: applicationDateRange?.[0],
      applicationDateEnd: applicationDateRange?.[1],
      tenantId: filterTenantId.value
    })
  }
  function openDetail(row: WmsIssueRequest): void {
    void detailRef.value?.handleOpen(row, projectName(row.projectId))
  }
  async function refresh(): Promise<void> {
    await tableRef.value?.refreshUpdate()
  }
  async function loadOptions(): Promise<void> {
    optionError.value = false
    try {
      ;[warehouses.value, projects.value, sections.value] = await Promise.all([
        fetchWmsWarehouses(),
        fetchWmsProjects(),
        fetchWmsProjectSections()
      ])
    } catch {
      optionError.value = true
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
    try {
      await confirmAction(`确认删除暂存申请 ${row.documentNo}？`, '删除出库申请', {
        type: 'warning',
        confirmButtonText: '确认删除'
      })
      workingId.value = row.id
      await deleteWmsIssueRequest(row.id)
      await refresh()
    } catch {
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
  function columnsFactory(): ColumnOption<WmsIssueRequest>[] {
    return [
      {
        prop: 'documentNo',
        label: '单据编号',
        minWidth: 195,
        fixed: 'left',
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.documentNo}
            secondary={row.createdAt?.replace('T', ' ').slice(0, 19)}
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
      { prop: 'materialCodes', label: '物料编码', minWidth: 170, showOverflowTooltip: true },
      { prop: 'materialDescriptions', label: '物料描述', minWidth: 210, showOverflowTooltip: true },
      { prop: 'requestedQuantityTotal', label: '申请数量', minWidth: 110, align: 'right' },
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
</script>
