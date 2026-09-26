<template>
  <ArtPermissionGuard permission="WmsInitializationClose:View" resource-name="结束初始化">
    <div class="business-workspace-page art-full-height min-w-0">
      <BusinessWorkspaceHeader
        eyebrow="INVENTORY INITIALIZATION"
        title="结束初始化"
        description="按库存组织生成期初余额快照。结束后初始化单据进入锁定状态。"
        icon="ri:checkbox-circle-line"
        density="compact"
        :tags="[
          { label: '组织级控制', type: 'primary' },
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
          emptyText: '暂无已启用的库存组织',
          emptyDescription: '请先在“启用库存”中设置库存组织启用日期。'
        }"
        focusable
      />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { ElTag } from 'element-plus'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtTableQuery, {
    type ArtTableQueryExpose
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
    changeWmsInitializationStatus,
    fetchWmsInitializationStatusPage,
    type WmsInitializationStatusRow
  } from '@/api/wms-purchase'

  defineOptions({ name: 'WmsInitializationClose' })

  const { confirmAction } = useArtFeedback()
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const tableRef = ref<ArtTableQueryExpose>()
  const workingId = ref<string>()
  const search = reactive({ keyword: '', status: '' })
  const searchItems: SearchFormItem[] = [
    {
      label: '初始化状态',
      key: 'status',
      type: 'select',
      props: {
        clearable: true,
        placeholder: '全部状态',
        options: [
          { label: '已初始化', value: 'initialized' },
          { label: '未初始化', value: 'not_initialized' }
        ]
      }
    },
    {
      label: '库存组织',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '组织名称或编码' }
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
      workingId.value = row.id
      await changeWmsInitializationStatus(row.id, action)
      await tableRef.value?.refreshUpdate()
    } catch {
      // 取消与接口错误由统一反馈处理。
    } finally {
      workingId.value = undefined
    }
  }

  function columnsFactory(): ColumnOption<WmsInitializationStatusRow>[] {
    return [
      {
        prop: 'organizationName',
        label: '库存组织',
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
        width: 88,
        formatter: (row) => (
          <BusinessTableRowActions>
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
