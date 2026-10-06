<template>
  <ArtPermissionGuard permission="WmsInventoryEnable:View" resource-name="启用库存">
    <div class="business-workspace-page art-full-height min-w-0">
      <BusinessWorkspaceHeader
        eyebrow="INVENTORY ACTIVATION"
        title="启用库存"
        description="为公司库存组织设置启用日期和默认组织。初始库存单新增时自动带出默认组织。"
        icon="ri:toggle-line"
        density="compact"
        :tags="[
          { label: '按组织启用', type: 'primary' },
          { label: '业务日期校验', type: 'success' }
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
        :search-bar-props="{ span: 8, labelWidth: 82 }"
        :table-props="{
          rowKey: 'id',
          emptyText: '当前范围暂无库存组织',
          emptyDescription: '请先在组织管理中维护组织类型为公司的启用组织，再回到这里设置启用日期。'
        }"
        focusable
      />
      <ArtDialog ref="dialogRef" size="sm">
        <div class="space-y-5">
          <ArtEntitySummary
            icon="ri:calendar-check-line"
            eyebrow="ACTIVATION DATE"
            title="库存启用日期设置"
            :description="`将为 ${selectedCount} 个库存组织记录启用日期。`"
          />
          <ElAlert type="info" :closable="false" show-icon>
            期初单据的业务日期须不晚于此日期。单次启用一个组织时可同时将其设为默认组织。
          </ElAlert>
          <ArtForm
            ref="activationFormRef"
            :model-value="activationForm"
            @update:model-value="replaceReactiveModel(activationForm, $event)"
            :items="activationItems"
            :rules="activationRules"
            :show-reset="false"
            :show-submit="false"
            label-position="top"
          />
        </div>
      </ArtDialog>
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { replaceReactiveModel } from '@/utils/form/model'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import dayjs from 'dayjs'
  import { ElTag, ElMessage } from 'element-plus'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtTableQuery, {
    type ArtTableQueryExpose
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type { ColumnOption } from '@/types'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import {
    fetchWmsInventoryOrganizations,
    setWmsInventoryEnabled,
    setWmsDefaultInventoryOrganization,
    type WmsInventoryOrganization
  } from '@wms/api'

  const wmsInventoryEnableStatusOptions = useDictionaryOptions('wmsInventoryEnableStatus')

  defineOptions({ name: 'WmsInventoryEnable' })
  const { confirmAction } = useArtFeedback()
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const tableRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<ArtDialogExpose>()
  const activationFormRef = ref<InstanceType<typeof ArtForm>>()
  const selectedCount = ref(0)
  const defaultOrganizationLoading = ref(false)
  const activationForm = reactive({ enabledOn: dayjs().format('YYYY-MM-DD'), isDefault: true })
  const activationItems = computed<FormItem[]>(() => [
    {
      key: 'enabledOn',
      label: '启用日期',
      type: 'date',
      span: 24,
      props: { valueFormat: 'YYYY-MM-DD', placeholder: '选择启用日期', class: 'w-full!' }
    },
    {
      key: 'isDefault',
      label: '默认库存组织',
      type: 'segment',
      span: 24,
      props: {
        options: [
          { label: '否', value: false },
          { label: '是', value: true, disabled: selectedCount.value > 1 }
        ]
      },
      description:
        selectedCount.value > 1
          ? '批量启用时请在列表中为其中一个组织设置默认。'
          : '每个租户只能有一个默认库存组织。'
    }
  ])
  const activationRules = {
    enabledOn: [{ required: true, message: '请选择启用日期', trigger: 'change' }]
  }
  const search = reactive({ enabled: '', keyword: '' })
  const searchItems: SearchFormItem[] = [
    {
      label: '启用状态',
      key: 'enabled',
      type: 'select',
      props: {
        clearable: true,
        placeholder: '全部状态',
        options: wmsInventoryEnableStatusOptions
      }
    },
    {
      label: '库存组织',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '搜索组织名称或编码' }
    }
  ]
  function fetchRows(query: { enabled?: string; keyword?: string; current: number; size: number }) {
    return fetchWmsInventoryOrganizations({
      ...query,
      tenantId: effectiveTenantId.value || undefined,
      organizationType: 'company'
    })
  }
  async function refresh(): Promise<void> {
    selectedCount.value = 0
    await tableRef.value?.refreshUpdate()
  }
  async function openEnable(ids: string[]): Promise<void> {
    if (!ids.length) return void ElMessage.warning('请先勾选库存组织')
    selectedCount.value = ids.length
    activationForm.enabledOn = dayjs().format('YYYY-MM-DD')
    activationForm.isDefault = ids.length === 1
    await dialogRef.value?.handleOpen(undefined, {
      title: '设置库存启用日期',
      subtitle: `${ids.length} 个库存组织`,
      onOpen: () => activationFormRef.value?.clearValidate(),
      onConfirm: async () => {
        if (!(await validateArtFormForSubmit(activationFormRef.value))) return false
        await setWmsInventoryEnabled(ids, activationForm.enabledOn, activationForm.isDefault)
        await refresh()
        return true
      }
    })
  }
  async function setDefaultOrganization(id: string): Promise<void> {
    if (defaultOrganizationLoading.value) return
    defaultOrganizationLoading.value = true
    try {
      await setWmsDefaultInventoryOrganization(id)
      await refresh()
    } catch {
      // API provider 已展示业务错误，保留列表供重试。
    } finally {
      defaultOrganizationLoading.value = false
    }
  }
  async function disable(ids: string[]): Promise<void> {
    if (!ids.length) return void ElMessage.warning('请先勾选库存组织')
    try {
      await confirmAction(
        `确定反启用所选 ${ids.length} 个库存组织？启用日期将清除。已有初始库存单的组织不能反启用。`,
        '反启用库存',
        { type: 'warning', confirmButtonText: '确定反启用' }
      )
      await setWmsInventoryEnabled(ids, null)
      await refresh()
    } catch {
      // 确认取消和接口错误由相应组件处理。
    }
  }
  function columnsFactory(): ColumnOption<WmsInventoryOrganization>[] {
    return [
      {
        prop: 'organizationName',
        label: '库存组织',
        minWidth: 260,
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.organizationName}
            secondary={row.organizationCode}
            icon="ri:building-2-line"
          />
        )
      },
      {
        prop: 'enabledStatus',
        label: '启用状态',
        width: 120,
        formatter: (row) => (
          <ElTag type={row.enabledOn ? 'success' : 'info'} size="small" effect="light">
            {row.enabledOn ? '已启用' : '未启用'}
          </ElTag>
        )
      },
      {
        prop: 'isDefault',
        label: '默认库存组织',
        width: 135,
        formatter: (row) => (
          <ElTag type={row.isDefault ? 'primary' : 'info'} size="small" effect="light">
            {row.isDefault ? '是' : '否'}
          </ElTag>
        )
      },
      {
        prop: 'enabledOn',
        label: '启用日期',
        minWidth: 150,
        formatter: (row) => row.enabledOn || '—'
      },
      {
        prop: 'initializationClosedAt',
        label: '初始化进度',
        minWidth: 150,
        formatter: (row) =>
          row.initializationClosedAt ? '已结束' : row.enabledOn ? '进行中' : '待启用'
      },
      {
        prop: 'operation',
        label: '操作',
        width: 170,
        fixed: 'right',
        align: 'center',
        formatter: (row) =>
          row.enabledOn ? (
            <div class="flex items-center justify-center gap-1">
              {!row.isDefault && (
                <ArtButtonTable
                  type="sign"
                  icon="ri:star-line"
                  label="设为默认"
                  permission="WmsInventoryEnable:Enable"
                  loading={defaultOrganizationLoading.value}
                  onClick={() => setDefaultOrganization(row.id)}
                />
              )}
              <ArtButtonTable
                type="delete"
                icon="ri:close-circle-line"
                label="反启用"
                permission="WmsInventoryEnable:Disable"
                onClick={() => disable([row.id])}
              />
            </div>
          ) : (
            <ArtButtonTable
              type="sign"
              icon="ri:checkbox-circle-line"
              label="启用"
              permission="WmsInventoryEnable:Enable"
              onClick={() => openEnable([row.id])}
            />
          )
      }
    ]
  }
</script>
