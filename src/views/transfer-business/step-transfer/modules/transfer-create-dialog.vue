<template>
  <ArtDialog ref="dialogRef" size="lg" :confirm-disabled="loadError" @close="handleClose">
    <div class="min-w-0 space-y-4">
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
        仓库、库存组织或序列号加载失败，请重试后办理。
        <ElButton class="ml-2" size="small" @click="loadCandidates">重新加载</ElButton>
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
          <TransferStockPicker
            :model-value="form.sourceBatchId || undefined"
            :selected-data="selectedBatch ? [selectedBatch] : []"
            :tenant-id="context?.tenantId"
            :projects="context?.projects"
            :units="units"
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
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { useMediaQuery } from '@vueuse/core'
  import dayjs from 'dayjs'
  import { ElMessage } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import TransferStockPicker from '../../shared/transfer-stock-picker.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import { isWmsBusinessTypeAvailable } from '@/utils/wms/business-type'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import {
    createWmsTransfer,
    fetchWmsInitialDocumentTypes,
    fetchWmsInitialMenuId,
    fetchWmsInitialOptions,
    fetchWmsInventoryOrganizations,
    fetchWmsBatchSerials,
    fetchWmsUnitOptions,
    fetchWmsWarehouses,
    type WmsBatchSerial,
    type WmsProject,
    type WmsTransferStockOption,
    type WmsUnitOption,
    type WmsWarehouse,
    type WmsInitializationOption,
    type WmsInventoryOrganization
  } from '@wms/api'

  interface Context {
    tenantId?: string
    projects: WmsProject[]
  }
  type BatchOption = WmsTransferStockOption
  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<Context>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const isNarrowScreen = useMediaQuery('(max-width: 767px)')
  const context = shallowRef<Context>()
  let generation = 0
  const warehouses = ref<WmsWarehouse[]>([])
  const organizations = ref<WmsInventoryOrganization[]>([])
  const documentTypes = ref<WmsInitializationOption[]>([])
  const businessTypes = ref<WmsInitializationOption[]>([])
  const menuId = ref('')
  const serials = ref<WmsBatchSerial[]>([])
  const units = ref<WmsUnitOption[]>([])
  const selectedBatch = shallowRef<BatchOption | null>(null)
  const loadError = ref(false)
  watch(loadError, (value) => dialogRef.value?.setOptions({ confirmDisabled: value }))
  const form = ref({
    documentNo: '',
    sourceBatchId: '',
    targetWarehouseId: '',
    targetOrganizationId: '',
    documentTypeId: '',
    businessTypeId: '',
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
  const availableBusinessTypes = computed(() =>
    businessTypes.value.filter((row) =>
      isWmsBusinessTypeAvailable(row, form.value.documentTypeId, menuId.value)
    )
  )
  const availableOrganizations = computed(() =>
    organizations.value.filter(
      (row) =>
        Boolean(row.enabledOn && row.initializationClosedAt) &&
        (!selectedBatch.value || row.tenantId === selectedBatch.value.tenantId)
    )
  )
  const items = computed<FormItem[]>(() => [
    {
      key: 'documentNo',
      label: '调拨单号',
      type: 'input',
      props: { maxlength: 80, placeholder: '自动生成，可修改' }
    },
    { key: 'sourceBatchId', label: '来源批次', type: 'input', span: 24 },
    {
      key: 'documentTypeId',
      label: '单据类型',
      type: 'select',
      options: documentTypes.value.map((row) => ({ label: row.name, value: row.id })),
      props: {
        filterable: true,
        disabled: !selectedBatch.value,
        placeholder: '选择分步调拨单类型',
        onChange: onDocumentTypeChange
      }
    },
    {
      key: 'businessTypeId',
      label: '业务类型',
      type: 'select',
      options: availableBusinessTypes.value.map((row) => ({ label: row.name, value: row.id })),
      props: {
        filterable: true,
        disabled: !form.value.documentTypeId,
        placeholder: '选择对应的业务类型'
      }
    },
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
          const warehouseOrganizationId = warehouses.value.find(
            (row) => row.id === form.value.targetWarehouseId
          )?.organizationId
          form.value.targetOrganizationId =
            availableOrganizations.value.find((row) => row.isDefault)?.id ||
            availableOrganizations.value.find((row) => row.id === warehouseOrganizationId)?.id ||
            ''
        }
      }
    },
    {
      key: 'targetOrganizationId',
      label: '目标库存组织',
      type: 'select',
      options: availableOrganizations.value.map((row) => ({
        label: `${row.organizationName} · ${row.organizationCode}`,
        value: row.id
      })),
      props: {
        filterable: true,
        disabled: !form.value.targetWarehouseId,
        placeholder: '选择已启用库存的目标组织'
      },
      help: `来源组织：${sourceOrganizationName.value}。跨组织调拨会在流水中保留两端归属。`
    },
    {
      key: 'quantity',
      label: '调拨数量',
      type: 'number',
      props: {
        min: selectedBatch.value?.packId ? selectedBatch.value.quantity : 0.001,
        max: selectedBatch.value?.availableQuantity ?? 1,
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
              collapseTagsTooltip: true,
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
    documentTypeId: [{ required: true, message: '请选择单据类型', trigger: 'change' }],
    businessTypeId: [{ required: true, message: '请选择业务类型', trigger: 'change' }],
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

  async function onBatchSelected(rows: WmsTransferStockOption[]): Promise<void> {
    generation++
    const row = rows[0]
    selectedBatch.value = row || null
    form.value.targetWarehouseId = ''
    form.value.targetOrganizationId = ''
    form.value.serialIds = []
    serials.value = []
    if (!selectedBatch.value) return
    form.value.quantity = selectedBatch.value.packId ? selectedBatch.value.quantity : 1
    await loadCandidates()
  }
  async function loadCandidates(): Promise<void> {
    const currentContext = context.value
    const batch = selectedBatch.value
    if (!currentContext) return
    const requestGeneration = ++generation
    loadError.value = false
    dialogRef.value?.setLoading(true)
    try {
      const [warehouseRows, unitRows] = await Promise.all([
        fetchWmsWarehouses(currentContext.tenantId),
        batch?.tenantId || currentContext.tenantId
          ? fetchWmsUnitOptions(batch?.tenantId || currentContext.tenantId || '')
          : Promise.resolve([])
      ])
      if (requestGeneration !== generation) return
      warehouses.value = warehouseRows
      units.value = unitRows
      if (batch) {
        const [serialRows, organizationResult, documentRows, businessRows, currentMenuId] =
          await Promise.all([
            fetchWmsBatchSerials(batch.id),
            fetchWmsInventoryOrganizations({
              tenantId: batch.tenantId,
              enabled: 'enabled',
              current: 1,
              size: 2000
            }),
            fetchWmsInitialDocumentTypes(batch.tenantId, 'WmsStepTransfer'),
            fetchWmsInitialOptions('mdm_business_type', batch.tenantId),
            fetchWmsInitialMenuId('WmsStepTransfer')
          ])
        if (requestGeneration !== generation) return
        serials.value = serialRows
        organizations.value = organizationResult.data
        documentTypes.value = documentRows
        businessTypes.value = businessRows
        menuId.value = currentMenuId
        if (!documentRows.some((row) => row.id === form.value.documentTypeId))
          form.value.documentTypeId = documentRows.find((row) => row.isDefault)?.id || ''
        onDocumentTypeChange()
      }
    } catch {
      if (requestGeneration === generation) loadError.value = true
    } finally {
      if (requestGeneration === generation) dialogRef.value?.setLoading(false)
    }
  }
  function onDocumentTypeChange(): void {
    if (!availableBusinessTypes.value.some((row) => row.id === form.value.businessTypeId))
      form.value.businessTypeId =
        availableBusinessTypes.value.find((row) => row.isDefault)?.id || ''
  }
  async function submit(): Promise<boolean> {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      const batch = selectedBatch.value
      if (!batch || loadError.value) return false
      if (
        form.value.quantity > batch.availableQuantity ||
        (batch.packId && form.value.quantity !== batch.quantity)
      ) {
        ElMessage.warning('调拨数量超过库存或未按整包办理')
        return false
      }
      if (
        (batch.material?.serialManagementEnabled || serials.value.length > 0) &&
        (form.value.quantity !== Math.trunc(form.value.quantity) ||
          form.value.serialIds.length !== form.value.quantity)
      ) {
        ElMessage.warning('SN 件数必须与调拨数量一致')
        return false
      }
      await createWmsTransfer({
        documentNo: form.value.documentNo.trim(),
        documentTypeId: form.value.documentTypeId,
        businessTypeId: form.value.businessTypeId,
        sourceBatchId: batch.id,
        targetWarehouseId: form.value.targetWarehouseId,
        targetOrganizationId: form.value.targetOrganizationId,
        quantity: form.value.quantity,
        serialIds: form.value.serialIds,
        remark: normalizeNullableText(form.value.remark)
      })
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '分步调拨创建提交失败，请检查填写内容和网络后重试')
      return false
    }
  }
  async function handleOpen(data: Context): Promise<void> {
    generation++
    context.value = data
    selectedBatch.value = null
    serials.value = []
    warehouses.value = []
    organizations.value = []
    documentTypes.value = []
    businessTypes.value = []
    menuId.value = ''
    loadError.value = false
    Object.assign(form.value, {
      documentNo: `DB-${dayjs().format('YYYYMMDD')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      sourceBatchId: '',
      targetWarehouseId: '',
      targetOrganizationId: '',
      documentTypeId: '',
      businessTypeId: '',
      quantity: 1,
      serialIds: [],
      remark: ''
    })
    await dialogRef.value?.handleOpen(data, {
      title: '新建分步调拨单',
      subtitle: '申请 → 调拨出库 → 在途 → 调拨入库',
      onConfirm: submit,
      onOpen: loadCandidates
    })
  }
  function handleClose(): void {
    generation++
  }
  defineExpose({ handleOpen })
</script>
