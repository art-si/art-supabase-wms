<template>
  <ArtPermissionGuard permission="WmsCountSheet:View" resource-name="盘点表">
    <div class="business-workspace-page art-full-height min-w-0">
      <BusinessWorkspaceHeader
        eyebrow="STOCK COUNT SHEETS"
        title="盘点表"
        description="按盘点方案分仓执行实盘、复盘与审核；差异在审核后自动形成盘盈盘亏流水。"
        icon="ri:clipboard-line"
        density="compact"
        :tags="[
          { label: '按方案生成', type: 'primary' },
          { label: '逐行实盘与复盘', type: 'info' },
          { label: '审核后结清差异', type: 'success' }
        ]"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>
      <ElAlert v-if="planId" type="info" :closable="false" show-icon class="mb-3">
        当前仅显示所选盘点方案生成的盘点表。
        <ElButton link type="primary" @click="showAllSheets">查看全部盘点表</ElButton>
      </ElAlert>
      <ElAlert v-if="optionError" type="warning" :closable="false" show-icon class="mb-3">
        库存组织选项加载失败。
        <ElButton link type="primary" :loading="optionsLoading" @click="loadOptions"
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
        :selection-actions="selectionActions"
        :search-bar-props="{ span: 6, labelWidth: 82 }"
        :table-props="{
          rowKey: 'id',
          tableLayout: 'fixed',
          emptyText: '当前条件下暂无盘点表',
          emptyDescription: '盘点表只能由盘点方案生成；请先创建并审核方案。'
        }"
        focusable
      />
      <CountSheetDrawer ref="drawerRef" @success="refresh" />
      <MasterDataDeleteGuard ref="deleteGuardRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { useRoute, useRouter } from 'vue-router'
  import { replaceReactiveModel } from '@/utils/form/model'
  import { formatDateTimeValue } from '@/utils/ui/format'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { useArtFeedback, notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtTableQuery, {
    type ArtTableQueryExpose,
    type ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import MasterDataDeleteGuard, {
    type MasterDataDeleteResource
  } from '@/components/business/master-data-delete-guard/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type { ColumnOption } from '@/types'
  import {
    approveWmsCountSheet,
    deleteWmsCountSheets,
    fetchWmsCountSheetDeleteDependencies,
    fetchWmsCountSheetPage,
    fetchWmsInventoryOrganizations,
    returnWmsCountSheet,
    submitWmsCountSheet,
    type WmsCountSheet,
    type WmsCountSheetQuery,
    type WmsInventoryOrganization
  } from '@wms/api'
  import CountSheetDrawer from './modules/count-sheet-drawer.vue'

  defineOptions({ name: 'WmsCountSheet' })
  const route = useRoute()
  const router = useRouter()
  const { hasAuth } = useAuth()
  const { confirmAction } = useArtFeedback()
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const methodOptions = useDictionaryOptions('wmsCountMethod')
  const statusOptions = useDictionaryOptions('wmsCountSheetStatus')
  const tableRef = ref<ArtTableQueryExpose>()
  const drawerRef = ref<InstanceType<typeof CountSheetDrawer>>()
  const organizations = ref<WmsInventoryOrganization[]>([])
  const optionError = ref(false)
  const optionsLoading = ref(false)
  const workingId = ref<string>()
  const planId = computed(() => (typeof route.query.planId === 'string' ? route.query.planId : ''))
  const search = reactive({
    organizationId: '',
    businessDateRange: [] as string[],
    countMethod: '',
    status: '',
    keyword: ''
  })
  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '库存组织',
      key: 'organizationId',
      type: 'select',
      props: {
        clearable: true,
        filterable: true,
        placeholder: '全部库存组织',
        options: organizations.value
          .filter((row) => !effectiveTenantId.value || row.tenantId === effectiveTenantId.value)
          .map((row) => ({
            label: `${row.organizationName} · ${row.organizationCode}`,
            value: row.id
          }))
      }
    },
    {
      label: '业务日期',
      key: 'businessDateRange',
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
      label: '盘点方式',
      key: 'countMethod',
      type: 'select',
      props: { clearable: true, placeholder: '全部方式', options: methodOptions }
    },
    {
      label: '单据状态',
      key: 'status',
      type: 'select',
      props: { clearable: true, placeholder: '全部状态', options: statusOptions }
    },
    {
      label: '单据编号',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '搜索盘点表编号' }
    }
  ])
  type TableQuery = WmsCountSheetQuery & { businessDateRange?: string[] }
  function fetchRows(query: TableQuery) {
    return fetchWmsCountSheetPage({
      ...query,
      tenantId: effectiveTenantId.value || undefined,
      planId: planId.value || undefined,
      businessDateStart: query.businessDateRange?.[0],
      businessDateEnd: query.businessDateRange?.[1]
    })
  }
  function showAllSheets(): void {
    void router.replace({ path: route.path, query: {} })
  }
  function openDetail(row: WmsCountSheet): void {
    void drawerRef.value?.handleOpen(row)
  }
  async function refresh(): Promise<void> {
    await tableRef.value?.refreshUpdate()
  }
  async function loadOptions(): Promise<void> {
    optionsLoading.value = true
    optionError.value = false
    try {
      const result = await fetchWmsInventoryOrganizations({
        current: 1,
        size: 2000,
        tenantId: effectiveTenantId.value || undefined
      })
      organizations.value = result.data
    } catch {
      optionError.value = true
    } finally {
      optionsLoading.value = false
    }
  }
  async function submit(row: WmsCountSheet): Promise<void> {
    if (workingId.value) return
    workingId.value = row.id
    try {
      await submitWmsCountSheet(row.id)
      await refresh()
    } catch (error) {
      notifyFriendlyError(error, '盘点表提交失败，请检查盘点人和全部明细后重试')
    } finally {
      workingId.value = undefined
    }
  }
  async function approve(row: WmsCountSheet): Promise<void> {
    if (workingId.value) return
    try {
      await confirmAction(
        `审核盘点表 ${row.documentNo}？审核后将按差异记账，已录入数量不可再改。`,
        '审核盘点表',
        { type: 'warning', confirmButtonText: '审核并记账', cancelButtonText: '返回复核' }
      )
      workingId.value = row.id
      await approveWmsCountSheet(row.id)
      await refresh()
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '盘点表审核失败，请核对账存、调整单据与库存后重试')
    } finally {
      workingId.value = undefined
    }
  }
  async function returnSheet(row: WmsCountSheet): Promise<void> {
    if (workingId.value) return
    workingId.value = row.id
    try {
      await returnWmsCountSheet(row.id)
      await refresh()
    } catch (error) {
      notifyFriendlyError(error, '盘点表退回失败，请刷新状态后重试')
    } finally {
      workingId.value = undefined
    }
  }
  const { deleteGuardRef, deleteRecords, deleteBusy } = useRecordDeleteGuard(
    'wms_count_sheet',
    '盘点表'
  )
  function remove(rows: WmsCountSheet[]): void {
    const resources: MasterDataDeleteResource[] = rows.map((row) => ({
      id: row.id,
      label: row.documentNo
    }))
    void deleteRecords({
      resources,
      permission: 'WmsCountSheet:Delete',
      confirmMessage:
        rows.length === 1
          ? `删除草稿盘点表 ${rows[0].documentNo}？方案的仓库范围将同步缩小。`
          : `删除选中的 ${rows.length} 张草稿盘点表？所属方案的仓库范围将同步缩小。`,
      remove: () => deleteWmsCountSheets(resources.map((item) => item.id)),
      onDeleted: refresh,
      inspectReferences: async (items) => {
        if (!deleteGuardRef.value) return true
        return deleteGuardRef.value.inspect({
          resourceLabel: '盘点表',
          resources: items,
          navigationResource: { type: 'wms_count_sheet', queryKey: 'sheetId' },
          fetchDependencies: fetchWmsCountSheetDeleteDependencies,
          dependencyMeta: {
            wms_count_sheet_status: {
              label: '不可删除的盘点表',
              unit: '张',
              description: '已提交、审核或方案已审核的盘点表需保留业务记录。',
              actionLabel: '查看盘点表',
              routeName: 'WmsCountSheet',
              routeQuery: (item) => ({ sheetId: item.resourceId }),
              statusDictCode: 'wmsCountSheetStatus',
              canNavigate: () => hasAuth('WmsCountSheet:View'),
              order: 1
            }
          }
        })
      }
    })
  }
  const selectionActions: ArtTableQueryHeaderAction[] = [
    {
      type: 'delete',
      label: '批量删除',
      permission: 'WmsCountSheet:Delete',
      confirm: false,
      disabled: () => deleteBusy.value,
      onClick: ({ selectedRows }) => remove(selectedRows as WmsCountSheet[])
    }
  ]
  function columnsFactory(): ColumnOption<WmsCountSheet>[] {
    return [
      {
        type: 'selection',
        width: 50,
        fixed: 'left',
        reserveSelection: true,
        selectable: (row: WmsCountSheet) =>
          hasAuth('WmsCountSheet:Delete') && row.status === 'draft' && row.plan?.status === 'draft'
      },
      {
        prop: 'documentNo',
        label: '单据编号',
        minWidth: 205,
        fixed: 'left',
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.documentNo}
            secondary={row.plan?.documentNo || '盘点方案'}
            icon="ri:clipboard-line"
          />
        )
      },
      {
        prop: 'organization',
        label: '库存组织',
        minWidth: 170,
        formatter: (row) => row.organization?.organizationName || '—'
      },
      {
        prop: 'warehouse',
        label: '仓库',
        minWidth: 170,
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.warehouse?.warehouseName || '仓库'}
            secondary={row.warehouse?.warehouseCode || ''}
          />
        )
      },
      { prop: 'businessDate', label: '业务日期', width: 120 },
      {
        prop: 'backupCondition',
        label: '数据备份条件',
        minWidth: 135,
        dict: { code: 'wmsCountBackupCondition', display: 'text' }
      },
      { prop: 'bookDate', label: '账存日期', width: 120 },
      {
        prop: 'countMethod',
        label: '盘点方式',
        width: 110,
        dict: { code: 'wmsCountMethod', display: 'text' }
      },
      {
        prop: 'status',
        label: '单据状态',
        width: 105,
        dict: { code: 'wmsCountSheetStatus', display: 'auto' }
      },
      {
        prop: 'counterEmployee',
        label: '盘点人',
        minWidth: 135,
        formatter: (row) => row.counterEmployee?.employeeName || '待指定'
      },
      {
        prop: 'keeperDepartment',
        label: '库管部门',
        minWidth: 140,
        formatter: (row) => row.keeperDepartment?.organizationName || '—'
      },
      {
        prop: 'keeperEmployee',
        label: '仓管员',
        minWidth: 125,
        formatter: (row) => row.keeperEmployee?.employeeName || '—'
      },
      {
        prop: 'quantityDefault',
        label: '数量默认值',
        minWidth: 110,
        dict: { code: 'wmsCountQuantityDefault', display: 'text' }
      },
      {
        prop: 'recountEnabled',
        label: '启用复盘',
        width: 95,
        formatter: (row) => (
          <ArtDictDisplay
            dictCode="commonBoolean"
            value={String(row.recountEnabled)}
            display="text"
          />
        )
      },
      {
        prop: 'createdAt',
        label: '生成时间',
        minWidth: 165,
        formatter: (row) => formatDateTimeValue(row.createdAt)
      },
      {
        prop: 'operation',
        label: '操作',
        width: 175,
        fixed: 'right',
        formatter: (row) => (
          <BusinessTableRowActions>
            <ArtButtonTable
              type="edit"
              icon="ri:file-search-line"
              label="查看盘点表"
              permission="WmsCountSheet:View"
              onClick={() => openDetail(row)}
            />
            {row.status === 'draft' && row.plan?.status === 'counting' ? (
              <ArtButtonTable
                type="edit"
                icon="ri:send-plane-line"
                label="提交盘点表"
                permission="WmsCountSheet:Submit"
                disabled={Boolean(workingId.value)}
                onClick={() => submit(row)}
              />
            ) : null}
            {row.status === 'submitted' ? (
              <>
                <ArtButtonTable
                  type="edit"
                  icon="ri:check-double-line"
                  label="审核盘点表"
                  permission="WmsCountSheet:Return"
                  disabled={Boolean(workingId.value)}
                  onClick={() => approve(row)}
                />
                <ArtButtonTable
                  type="edit"
                  icon="ri:arrow-go-back-line"
                  label="退回修改"
                  permission="WmsCountSheet:Approve"
                  disabled={Boolean(workingId.value)}
                  onClick={() => returnSheet(row)}
                />
              </>
            ) : null}
            {row.status === 'draft' && row.plan?.status === 'draft' ? (
              <ArtButtonTable
                type="delete"
                label="删除草稿盘点表"
                permission="WmsCountSheet:Delete"
                disabled={deleteBusy.value}
                onClick={() => remove([row])}
              />
            ) : null}
          </BusinessTableRowActions>
        )
      }
    ]
  }
  watch(planId, () => void tableRef.value?.refreshContext())
  onMounted(() => void loadOptions())
</script>
