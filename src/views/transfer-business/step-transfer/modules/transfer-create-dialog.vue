<template>
  <ArtDialog ref="dialogRef" size="lg">
    <div class="space-y-4">
      <ArtEntitySummary
        icon="ri:truck-line"
        eyebrow="TWO STEP TRANSFER"
        title="申请分步调拨"
        description="先从来源仓库调出，在途确认后由目标仓库收货。"
      />
      <ElAlert type="info" :closable="false" show-icon>
        调拨单保留来源库存组织、项目、施工号和批次。垛包必须整包调拨，目标仓库收货后沿用原包号。
      </ElAlert>
      <ElAlert v-if="loadError" type="error" :closable="false" show-icon>
        仓库或序列号加载失败，请重试后办理。
      </ElAlert>
      <ArtForm
        ref="formRef"
        v-model="form"
        :items="items"
        :rules="rules"
        :span="isNarrowScreen ? 24 : 12"
        :gutter="20"
        label-position="top"
        :show-reset="false"
        :show-submit="false"
      >
        <template #sourceBatchId>
          <ArtTableSingleSelect
            :model-value="form.sourceBatchId || undefined"
            :api-fn="batchApi"
            :selected-data="selectedBatch ? [selectedBatch] : []"
            :columns="batchColumns"
            title="选择来源库存"
            subtitle="仅显示有库存的批次；项目归属随来源锁定"
            placeholder="选择来源批次"
            search-placeholder="输入批号或备注"
            label-key="batchLabel"
            :show-pagination="true"
            :page-size="20"
            @update:selected-data="onBatchSelected"
            @update:model-value="form.sourceBatchId = String($event || '')"
          />
        </template>
      </ArtForm>
      <ElAlert v-if="selectedBatch" type="success" :closable="false" show-icon>
        来源：{{ sourceOrganizationName }} · {{ selectedBatch.warehouse?.warehouseName }} ·
        {{ selectedBatch.material?.materialName }} · {{ selectedBatch.batchNo }} · 在库
        {{ selectedBatch.quantity }} · {{ projectName
        }}{{ selectedBatch.constructionNo ? ` / ${selectedBatch.constructionNo}` : '' }}
      </ElAlert>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { useMediaQuery } from '@vueuse/core'
  import dayjs from 'dayjs'
  import { ElMessage } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtTableSingleSelect from '@/components/core/forms/art-data-select/table-single.vue'
  import type {
    DataSelectColumn,
    DataSelectFetchParams,
    DataSelectRecord
  } from '@/components/core/forms/art-data-select/types'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import { fetchGetEnableOrganizationTree } from '@/api/system-manage'
  import TreeUtils from '@/utils/tree'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import {
    createWmsTransfer,
    fetchWmsBatchSerials,
    fetchWmsStockPage,
    fetchWmsWarehouses,
    type WmsBatchSerial,
    type WmsProject,
    type WmsStockBatch,
    type WmsWarehouse
  } from '@wms/api'

  interface Context {
    tenantId?: string
    projects: WmsProject[]
  }
  type BatchOption = WmsStockBatch & { batchLabel: string }
  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<Context>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const isNarrowScreen = useMediaQuery('(max-width: 767px)')
  const context = shallowRef<Context>()
  const warehouses = ref<WmsWarehouse[]>([])
  const organizationTree = ref<Api.SystemManage.OrganizationListItem[]>([])
  const organizationTreeUtils = new TreeUtils({
    idKey: 'id',
    parentKey: 'parentId',
    childrenKey: 'children'
  })
  const organizations = computed(() => organizationTreeUtils.treeToList(organizationTree.value))
  const serials = ref<WmsBatchSerial[]>([])
  const selectedBatch = shallowRef<BatchOption | null>(null)
  const loadError = ref(false)
  const form = reactive({
    documentNo: '',
    sourceBatchId: '',
    targetWarehouseId: '',
    targetOrganizationId: '',
    quantity: 1,
    serialIds: [] as string[],
    remark: ''
  })
  const projectName = computed(() =>
    selectedBatch.value?.projectId
      ? context.value?.projects.find((row) => row.id === selectedBatch.value?.projectId)
          ?.projectName || '历史项目'
      : '公共库存'
  )
  const targetWarehouses = computed(() =>
    warehouses.value.filter(
      (row) =>
        row.status === 'enabled' &&
        row.tenantId === selectedBatch.value?.tenantId &&
        row.id !== selectedBatch.value?.warehouseId
    )
  )
  const sourceOrganizationName = computed(
    () =>
      organizations.value.find((row) => row.id === selectedBatch.value?.organizationId)
        ?.organizationName || '来源组织'
  )
  const batchColumns: DataSelectColumn[] = [
    { prop: 'batchLabel', label: '物料 / 批号', minWidth: 260 },
    { prop: 'warehouseName', label: '来源仓库', minWidth: 150 },
    { prop: 'constructionNo', label: '施工号', minWidth: 130 },
    { prop: 'quantity', label: '在库', width: 90, align: 'right' }
  ]
  const items = computed<FormItem[]>(() => [
    {
      key: 'documentNo',
      label: '调拨单号',
      type: 'input',
      props: { maxlength: 80, placeholder: '自动生成，可修改' }
    },
    { key: 'sourceBatchId', label: '来源批次', type: 'input', span: 24 },
    {
      key: 'targetWarehouseId',
      label: '目标仓库',
      type: 'select',
      options: targetWarehouses.value.map((row) => ({
        label: `${row.warehouseName} · ${row.warehouseCode}`,
        value: row.id
      })),
      props: {
        filterable: true,
        disabled: !selectedBatch.value,
        placeholder: '选择异地目标仓库',
        onChange: () => {
          form.targetOrganizationId =
            warehouses.value.find((row) => row.id === form.targetWarehouseId)?.organizationId || ''
        }
      }
    },
    {
      key: 'targetOrganizationId',
      label: '目标库存组织',
      type: 'treeSelect',
      options: organizationTree.value,
      valueField: 'id',
      labelField: 'organizationName',
      childrenField: 'children',
      labelFn: (row) => `${row.organizationName ?? ''} · ${row.organizationCode ?? ''}`,
      props: {
        filterable: true,
        checkStrictly: true,
        defaultExpandAll: true,
        renderAfterExpand: false,
        disabled: !form.targetWarehouseId,
        placeholder: '选择调入后的归属组织'
      },
      help: `来源组织：${sourceOrganizationName.value}。跨组织调拨会在流水中保留两端归属。`
    },
    {
      key: 'quantity',
      label: '调拨数量',
      type: 'number',
      props: {
        min: selectedBatch.value?.packId ? selectedBatch.value.quantity : 0.001,
        max: selectedBatch.value?.quantity ?? 1,
        precision: 3,
        class: 'w-full!',
        disabled: Boolean(selectedBatch.value?.packId)
      },
      help: selectedBatch.value?.packId ? '垛包必须整包调拨。' : undefined
    },
    ...(selectedBatch.value?.material?.serialManagementEnabled || serials.value.length
      ? [
          {
            key: 'serialIds',
            label: '随货序列号',
            type: 'select' as const,
            span: 24,
            options: serials.value
              .filter((row) => !row.reservedWorkOrderId)
              .map((row) => ({ label: row.serialNo, value: row.id })),
            props: {
              multiple: true,
              filterable: true,
              collapseTags: true,
              placeholder: '逐件选择，件数须等于调拨数量'
            }
          }
        ]
      : []),
    {
      key: 'remark',
      label: '调拨原因',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 2, maxlength: 500, showWordLimit: true }
    }
  ])
  const rules = {
    documentNo: [{ required: true, message: '请填写调拨单号', trigger: 'blur' }],
    sourceBatchId: [{ required: true, message: '请选择来源批次', trigger: 'change' }],
    targetWarehouseId: [{ required: true, message: '请选择目标仓库', trigger: 'change' }],
    targetOrganizationId: [{ required: true, message: '请选择目标库存组织', trigger: 'change' }],
    quantity: [
      {
        required: true,
        type: 'number' as const,
        min: 0.001,
        message: '请输入有效数量',
        trigger: 'change'
      }
    ]
  }

  async function batchApi(params: DataSelectFetchParams) {
    const result = await fetchWmsStockPage({
      tenantId: context.value?.tenantId,
      positiveOnly: true,
      status: 'normal',
      keyword: params.keyword,
      current: params.page,
      size: params.pageSize
    })
    return {
      data: result.data.map((row) => ({
        ...row,
        batchLabel: `${row.material?.materialName || '物料'} · ${row.batchNo}`,
        warehouseName: row.warehouse?.warehouseName || '—'
      })),
      total: result.total
    }
  }
  async function onBatchSelected(rows: DataSelectRecord[]): Promise<void> {
    const row = rows[0]
    selectedBatch.value =
      row && typeof row.id === 'string' && typeof row.quantity === 'number'
        ? (row as BatchOption)
        : null
    form.targetWarehouseId = ''
    form.targetOrganizationId = ''
    form.serialIds = []
    serials.value = []
    if (!selectedBatch.value) return
    form.quantity = selectedBatch.value.packId ? selectedBatch.value.quantity : 1
    loadError.value = false
    try {
      const [serialRows, organizationResult] = await Promise.all([
        fetchWmsBatchSerials(selectedBatch.value.id),
        fetchGetEnableOrganizationTree({ tenantId: selectedBatch.value.tenantId })
      ])
      serials.value = serialRows
      organizationTree.value = organizationResult.data ?? []
    } catch {
      loadError.value = true
    }
  }
  async function submit(): Promise<boolean> {
    try {
      await formRef.value?.validate()
      const batch = selectedBatch.value
      if (!batch || loadError.value) return false
      if (form.quantity > batch.quantity || (batch.packId && form.quantity !== batch.quantity)) {
        ElMessage.warning('调拨数量超过库存或未按整包办理')
        return false
      }
      if (
        (batch.material?.serialManagementEnabled || serials.value.length > 0) &&
        (form.quantity !== Math.trunc(form.quantity) || form.serialIds.length !== form.quantity)
      ) {
        ElMessage.warning('SN 件数必须与调拨数量一致')
        return false
      }
      await createWmsTransfer({
        documentNo: form.documentNo.trim(),
        sourceBatchId: batch.id,
        targetWarehouseId: form.targetWarehouseId,
        targetOrganizationId: form.targetOrganizationId,
        quantity: form.quantity,
        serialIds: form.serialIds,
        remark: normalizeNullableText(form.remark)
      })
      emit('success')
      return true
    } catch {
      return false
    }
  }
  async function handleOpen(data: Context): Promise<void> {
    context.value = data
    selectedBatch.value = null
    serials.value = []
    warehouses.value = []
    organizationTree.value = []
    loadError.value = false
    Object.assign(form, {
      documentNo: `DB-${dayjs().format('YYYYMMDD')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      sourceBatchId: '',
      targetWarehouseId: '',
      targetOrganizationId: '',
      quantity: 1,
      serialIds: [],
      remark: ''
    })
    await dialogRef.value?.handleOpen(data, {
      title: '新建分步调拨单',
      subtitle: '申请 → 调拨出库 → 在途 → 调拨入库',
      onConfirm: submit,
      onOpen: async (_data, api) => {
        api.setLoading(true)
        try {
          warehouses.value = await fetchWmsWarehouses(data.tenantId)
        } catch {
          loadError.value = true
        } finally {
          api.setLoading(false)
        }
      }
    })
  }
  defineExpose({ handleOpen })
</script>
