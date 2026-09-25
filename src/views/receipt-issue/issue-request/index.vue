<template>
  <ArtPermissionGuard permission="WmsIssueRequest:View" resource-name="领料申请">
    <div class="business-workspace-page art-full-height min-w-0">
      <BusinessWorkspaceHeader
        eyebrow="MATERIAL ISSUE REQUEST"
        title="领料申请"
        description="MES 工单提出多物料领料需求，审核后按批次和 SN 分次出库，申请余额随库存流水核销。"
        icon="ri:file-list-3-line"
        density="compact"
        :tags="[
          { label: '工单与项目归属', type: 'primary' },
          { label: '分批领料核销', type: 'success' }
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
          emptyText: '当前范围暂无领料申请',
          emptyDescription: '选择已下达 MES 工单，填写所需物料和数量后提交申请。'
        }"
        focusable
      />
      <IssueRequestCreateDialog ref="createRef" @success="refresh" />
      <IssueRequestDetailDrawer ref="detailRef" @success="refresh" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { ElMessageBox, ElTag } from 'element-plus'
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
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import {
    cancelWmsIssueRequest,
    fetchWmsIssueRequestPage,
    fetchWmsProjectSections,
    fetchWmsProjects,
    fetchWmsWarehouses,
    reviewWmsIssueRequest,
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
    warehouseId: '',
    projectId: '',
    constructionNo: '',
    keyword: ''
  })
  const filterTenantId = computed(() => effectiveTenantId.value || undefined)
  const statusLabels: Record<WmsIssueRequestStatus, string> = {
    submitted: '待审核',
    approved: '待领料',
    partially_issued: '部分领料',
    fulfilled: '已领完',
    rejected: '已驳回',
    cancelled: '已取消'
  }
  const headerActions: ArtTableQueryHeaderAction[] = [
    {
      permission: 'WmsIssueRequest:Create',
      type: 'add',
      label: '提交领料申请',
      buttonProps: { plain: false },
      disabled: () => optionError.value,
      onClick: () =>
        void createRef.value?.handleOpen({
          tenantId: filterTenantId.value,
          warehouses: warehouses.value,
          projects: projects.value
        })
    }
  ]
  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '状态',
      key: 'status',
      type: 'select',
      props: {
        clearable: true,
        placeholder: '全部状态',
        options: Object.entries(statusLabels).map(([value, label]) => ({ value, label }))
      }
    },
    {
      label: '仓库',
      key: 'warehouseId',
      type: 'select',
      props: {
        clearable: true,
        filterable: true,
        placeholder: '全部仓库',
        options: warehouses.value
          .filter((row) => !filterTenantId.value || row.tenantId === filterTenantId.value)
          .map((row) => ({ label: `${row.warehouseName} · ${row.warehouseCode}`, value: row.id }))
      }
    },
    {
      label: '项目',
      key: 'projectId',
      type: 'select',
      props: {
        clearable: true,
        filterable: true,
        placeholder: '全部项目',
        options: projects.value
          .filter((row) => !filterTenantId.value || row.tenantId === filterTenantId.value)
          .map((row) => ({ label: `${row.projectName} · ${row.projectCode}`, value: row.id })),
        onChange: () => (search.constructionNo = '')
      }
    },
    {
      label: '施工号',
      key: 'constructionNo',
      type: 'select',
      props: {
        clearable: true,
        filterable: true,
        disabled: !search.projectId,
        placeholder: search.projectId ? '全部施工号' : '请先选项目',
        options: sections.value
          .filter((row) => row.projectId === search.projectId)
          .map((row) => ({
            label: `${row.constructionNo} · ${row.sectionName}`,
            value: row.constructionNo
          }))
      }
    },
    {
      label: '申请单号',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '输入领料申请单号' }
    }
  ])
  function projectName(id: string | null): string {
    return id ? projects.value.find((row) => row.id === id)?.projectName || '历史项目' : '公共库存'
  }
  function fetchRows(query: WmsStockQuery) {
    return fetchWmsIssueRequestPage({ ...query, tenantId: filterTenantId.value })
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
      await ElMessageBox.confirm(
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
  async function cancel(row: WmsIssueRequest): Promise<void> {
    if (workingId.value) return
    try {
      await ElMessageBox.confirm(`确定取消领料申请 ${row.documentNo}？`, '取消领料申请', {
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
        label: '领料申请单',
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
      {
        prop: 'workOrderId',
        label: 'MES 工单',
        minWidth: 170,
        formatter: (row) => row.workOrder?.workOrderNo || '—'
      },
      {
        prop: 'warehouseId',
        label: '领料仓库',
        minWidth: 170,
        formatter: (row) => row.warehouse?.warehouseName || row.warehouse?.warehouseCode || '—'
      },
      {
        prop: 'projectId',
        label: '项目 / 施工号',
        minWidth: 195,
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={projectName(row.projectId)}
            secondary={row.constructionNo || '非项目业务'}
          />
        )
      },
      { prop: 'remark', label: '申请说明', minWidth: 180, showOverflowTooltip: true },
      {
        prop: 'operation',
        label: '操作',
        width: 184,
        fixed: 'right',
        formatter: (row) => (
          <BusinessTableRowActions>
            <ArtButtonTable
              type="view"
              label="查看明细"
              permission="WmsIssueRequest:View"
              onClick={() => openDetail(row)}
            />
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
            {['approved', 'partially_issued'].includes(row.status) && (
              <ArtButtonTable
                type="edit"
                icon="ri:logout-box-r-line"
                label="办理领料"
                permission="WmsIssueRequest:Issue"
                onClick={() => openDetail(row)}
              />
            )}
          </BusinessTableRowActions>
        )
      }
    ]
  }
  onMounted(() => void loadOptions())
</script>
