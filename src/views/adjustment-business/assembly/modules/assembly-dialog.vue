<template>
  <ArtDialog ref="dialogRef" size="lg">
    <div class="flex flex-col gap-4">
      <ArtEntitySummary
        icon="ri:apps-2-add-line"
        eyebrow="INVENTORY ASSEMBLY"
        title="办理库存组装"
        description="同仓、同库存组织且归属一致的多个原料批次，扣减后生成一个成品批次。"
      />
      <ElAlert type="info" :closable="false" show-icon>
        项目、施工号与货权从来源批次继承。带 SN 的关键件和主机请通过 MES 装配工单办理。
      </ElAlert>
      <ElAlert v-if="loadError" type="error" :closable="false" show-icon>
        目标库位加载失败，请重新打开单据。
      </ElAlert>
      <section
        aria-label="来源组件"
        class="rounded-xl border border-[var(--el-border-color-light)] p-4"
      >
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 class="font-semibold"
              >来源组件
              <span class="text-[var(--el-color-primary)]">{{ components.length }}</span></h3
            >
            <p class="mt-1 text-xs text-[var(--el-text-color-secondary)]"
              >至少两条，最多 50 条；同一批次只能添加一次。</p
            >
          </div>
          <ElTag v-if="firstBatch" type="success" size="small">
            {{ firstBatch.warehouse?.warehouseName }} · {{ projectName
            }}{{ firstBatch.constructionNo ? ` / ${firstBatch.constructionNo}` : '' }}
          </ElTag>
        </div>
        <ArtTableSingleSelect
          :key="selectKey"
          :model-value="undefined"
          :api-fn="batchApi"
          :selected-data="[]"
          :columns="batchColumns"
          title="添加来源批次"
          subtitle="首次选择后锁定仓库、库存组织、项目施工号及货权"
          placeholder="选择一个库存批次加入组件"
          search-placeholder="输入批号或备注"
          label-key="batchLabel"
          :show-pagination="true"
          :page-size="20"
          :disabled="components.length >= 50"
          @update:selected-data="onBatchSelected"
        />
        <div v-if="components.length" class="mt-3 divide-y divide-[var(--el-border-color-light)]">
          <div
            v-for="item in components"
            :key="item.batch.id"
            class="flex min-w-0 flex-wrap items-center gap-3 py-3"
          >
            <div class="min-w-0 flex-1">
              <strong
                class="block truncate text-sm"
                :title="item.batch.material?.materialName || '物料'"
              >
                {{ item.batch.material?.materialName || '物料' }}
              </strong>
              <p class="mt-1 truncate text-xs text-[var(--el-text-color-secondary)]">
                {{ item.batch.batchNo }} · {{ item.batch.bin?.binCode || '仓库直存' }} · 可见在库
                {{ item.batch.quantity }}
              </p>
            </div>
            <ElInputNumber
              v-model="item.quantity"
              :min="0.001"
              :max="item.batch.quantity"
              :precision="3"
              :controls="false"
              class="w-28!"
              :aria-label="`${item.batch.batchNo} 用量`"
            />
            <ElButton
              text
              type="danger"
              :aria-label="`移除 ${item.batch.batchNo}`"
              @click="removeBatch(item.batch.id)"
              >移除</ElButton
            >
          </div>
        </div>
        <ArtEmptyState
          v-else
          title="先添加来源批次"
          description="选择至少两个不同批次，再填写成品物料与数量。"
          size="compact"
          :visual-size="84"
          class="min-h-40"
        />
      </section>
      <ArtForm
        ref="formRef"
        v-model="form"
        :items="items"
        :rules="rules"
        :span="12"
        :gutter="20"
        label-position="top"
        :show-reset="false"
        :show-submit="false"
      >
        <template #targetMaterialId>
          <ArtTableSingleSelect
            :model-value="form.targetMaterialId || undefined"
            :api-fn="materialApi"
            :selected-data="selectedMaterial"
            :columns="materialColumns"
            title="选择成品物料"
            subtitle="成品物料须不同于所有来源组件"
            placeholder="选择成品物料"
            search-placeholder="输入物料编码或名称"
            label-key="materialName"
            :show-pagination="true"
            :page-size="20"
            :disabled="!firstBatch"
            @update:selected-data="onMaterialSelected"
            @update:model-value="form.targetMaterialId = String($event || '')"
          />
        </template>
      </ArtForm>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { ElMessage } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtTableSingleSelect from '@/components/core/forms/art-data-select/table-single.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import type {
    DataSelectColumn,
    DataSelectFetchParams,
    DataSelectRecord
  } from '@/components/core/forms/art-data-select/types'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import {
    fetchWmsBatchSerials,
    fetchWmsBins,
    fetchWmsMaterialOptions,
    fetchWmsStockPage,
    fetchWmsWarehouses,
    postWmsAssembly,
    type WmsAssemblyInput,
    type WmsBin,
    type WmsMaterialOption,
    type WmsProject,
    type WmsStockBatch
  } from '@wms/api'

  interface Context {
    tenantId?: string
    projects: WmsProject[]
  }
  type BatchOption = WmsStockBatch & { batchLabel: string; warehouseName: string }
  interface ComponentLine {
    batch: BatchOption
    quantity: number
  }
  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<Context>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const context = shallowRef<Context>()
  const components = ref<ComponentLine[]>([])
  const selectedMaterial = ref<WmsMaterialOption[]>([])
  const bins = ref<WmsBin[]>([])
  const loadError = ref(false)
  const warehouseRequiresLocation = ref(false)
  const selectKey = ref(0)
  const form = ref({
    documentNo: '',
    targetMaterialId: '',
    targetBinId: '',
    targetBatchNo: '',
    targetQuantity: 1,
    targetAreaSqm: undefined as number | undefined,
    lengthMm: undefined as number | undefined,
    widthMm: undefined as number | undefined,
    thicknessMm: undefined as number | undefined,
    remark: ''
  })
  const firstBatch = computed(() => components.value[0]?.batch)
  const projectName = computed(() =>
    firstBatch.value?.projectId
      ? context.value?.projects.find((row) => row.id === firstBatch.value?.projectId)
          ?.projectName || '历史项目'
      : '公共库存'
  )
  const batchColumns: DataSelectColumn[] = [
    { prop: 'batchLabel', label: '物料 / 批号', minWidth: 260 },
    { prop: 'warehouseName', label: '仓库', minWidth: 130 },
    { prop: 'constructionNo', label: '施工号', minWidth: 120 },
    { prop: 'quantity', label: '在库', width: 90, align: 'right' }
  ]
  const materialColumns: DataSelectColumn[] = [
    { prop: 'materialCode', label: '物料编码', minWidth: 160 },
    { prop: 'materialName', label: '物料名称', minWidth: 210 },
    { prop: 'specificationModel', label: '规格型号', minWidth: 150 }
  ]
  const items = computed<FormItem[]>(() => [
    {
      key: 'documentNo',
      label: '组装单号',
      type: 'input',
      props: { maxlength: 80, placeholder: '留空自动生成' }
    },
    {
      key: 'targetBatchNo',
      label: '成品批号',
      type: 'input',
      props: { maxlength: 80, placeholder: '留空沿用组装单号' }
    },
    { key: 'targetMaterialId', label: '成品物料', type: 'input', span: 24 },
    {
      key: 'targetQuantity',
      label: '成品数量',
      type: 'number',
      props: { min: 0.001, precision: 3, class: 'w-full!' }
    },
    {
      key: 'targetAreaSqm',
      label: '成品面积（㎡）',
      type: 'number',
      props: { min: 0, precision: 3, class: 'w-full!', placeholder: '非板材可留空' }
    },
    {
      key: 'lengthMm',
      label: '长度（mm）',
      type: 'number',
      props: { min: 0.001, precision: 2, class: 'w-full!', placeholder: '板材可填写' }
    },
    {
      key: 'widthMm',
      label: '宽度（mm）',
      type: 'number',
      props: { min: 0.001, precision: 2, class: 'w-full!', placeholder: '板材可填写' }
    },
    {
      key: 'thicknessMm',
      label: '厚度（mm）',
      type: 'number',
      props: { min: 0.001, precision: 2, class: 'w-full!', placeholder: '板材可填写' }
    },
    {
      key: 'targetBinId',
      label: '成品库位',
      type: 'select',
      options: bins.value
        .filter((row) => row.status === 'available')
        .map((row) => ({ label: `${row.binCode} · ${row.binName}`, value: row.id })),
      props: {
        clearable: true,
        filterable: true,
        disabled: !firstBatch.value,
        placeholder: warehouseRequiresLocation.value ? '必选成品库位' : '可选成品库位'
      }
    },
    {
      key: 'remark',
      label: '组装说明',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 2, maxlength: 500, showWordLimit: true }
    }
  ])
  const rules = {
    targetMaterialId: [{ required: true, message: '请选择成品物料', trigger: 'change' }],
    targetBinId: [
      {
        validator: (_rule: unknown, value: string, callback: (error?: Error) => void) =>
          callback(
            warehouseRequiresLocation.value && !value ? new Error('请选择成品库位') : undefined
          ),
        trigger: 'change'
      }
    ],
    targetQuantity: [
      {
        required: true,
        type: 'number' as const,
        min: 0.001,
        message: '请输入成品数量',
        trigger: 'change'
      }
    ]
  }

  async function batchApi(params: DataSelectFetchParams) {
    const first = firstBatch.value
    const result = await fetchWmsStockPage({
      tenantId: context.value?.tenantId,
      warehouseId: first?.warehouseId,
      organizationId: first?.organizationId,
      projectId: first?.projectId || undefined,
      publicOnly: first ? !first.projectId : false,
      constructionNo: first?.constructionNo || undefined,
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
    if (!row || typeof row.id !== 'string' || typeof row.quantity !== 'number') return
    const batch = row as BatchOption
    if (components.value.some((item) => item.batch.id === batch.id))
      return void ElMessage.warning('该批次已加入组件')
    if (batch.packId || batch.material?.serialManagementEnabled)
      return void ElMessage.warning('垛包或 SN 批次请通过对应生产流程办理')
    const first = firstBatch.value
    if (
      first &&
      (batch.warehouseId !== first.warehouseId ||
        batch.organizationId !== first.organizationId ||
        batch.projectId !== first.projectId ||
        batch.constructionNo !== first.constructionNo ||
        batch.ownerType !== first.ownerType ||
        batch.ownerId !== first.ownerId)
    ) {
      return void ElMessage.warning('组件仓库、库存组织、项目施工号与货权必须一致')
    }
    try {
      const serials = await fetchWmsBatchSerials(batch.id)
      if (serials.length) return void ElMessage.warning('该批次含 SN，请通过 MES 装配工单办理')
      if (!first) {
        const [binRows, warehouseRows] = await Promise.all([
          fetchWmsBins(batch.warehouseId),
          fetchWmsWarehouses(batch.tenantId)
        ])
        bins.value = binRows
        warehouseRequiresLocation.value = Boolean(
          warehouseRows.find((item) => item.id === batch.warehouseId)?.enableLocations
        )
      }
      components.value.push({ batch, quantity: Math.min(1, batch.quantity) })
      selectKey.value += 1
      loadError.value = false
    } catch {
      loadError.value = true
    }
  }
  function removeBatch(id: string): void {
    components.value = components.value.filter((item) => item.batch.id !== id)
    if (!components.value.length) {
      bins.value = []
      warehouseRequiresLocation.value = false
      form.value.targetBinId = ''
    }
    selectKey.value += 1
  }
  async function materialApi(params: DataSelectFetchParams) {
    const result = await fetchWmsMaterialOptions(
      firstBatch.value?.tenantId || context.value?.tenantId || '',
      params.keyword,
      params.page,
      params.pageSize,
      true
    )
    return { data: result.data, total: result.total }
  }
  function onMaterialSelected(rows: DataSelectRecord[]): void {
    const row = rows[0]
    selectedMaterial.value = row && typeof row.id === 'string' ? [row as WmsMaterialOption] : []
    form.value.targetMaterialId = selectedMaterial.value[0]?.id || ''
  }
  async function submit(): Promise<boolean> {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (loadError.value || components.value.length < 2) {
        ElMessage.warning('请添加至少两条有效组件')
        return false
      }
      if (components.value.some((item) => !item.quantity || item.quantity > item.batch.quantity)) {
        ElMessage.warning('组件用量须大于零且不能超过在库')
        return false
      }
      if (components.value.some((item) => item.batch.materialId === form.value.targetMaterialId)) {
        ElMessage.warning('成品物料不能同时作为来源组件')
        return false
      }
      if (selectedMaterial.value[0]?.serialManagementEnabled) {
        ElMessage.warning('SN 成品请通过 MES 装配工单办理')
        return false
      }
      if (!firstBatch.value) return false
      const payload: WmsAssemblyInput = {
        documentNo: normalizeNullableText(form.value.documentNo),
        targetMaterialId: form.value.targetMaterialId,
        targetBinId: form.value.targetBinId || null,
        targetBatchNo: normalizeNullableText(form.value.targetBatchNo),
        targetQuantity: form.value.targetQuantity,
        targetAreaSqm: form.value.targetAreaSqm ?? null,
        lengthMm: form.value.lengthMm ?? null,
        widthMm: form.value.widthMm ?? null,
        thicknessMm: form.value.thicknessMm ?? null,
        remark: normalizeNullableText(form.value.remark),
        components: components.value.map((item) => ({
          batchId: item.batch.id,
          quantity: item.quantity
        }))
      }
      await postWmsAssembly(payload)
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '组装业务提交失败，请检查填写内容和网络后重试')
      return false
    }
  }
  async function handleOpen(data: Context): Promise<void> {
    context.value = data
    components.value = []
    selectedMaterial.value = []
    bins.value = []
    warehouseRequiresLocation.value = false
    loadError.value = false
    selectKey.value += 1
    Object.assign(form.value, {
      documentNo: '',
      targetMaterialId: '',
      targetBinId: '',
      targetBatchNo: '',
      targetQuantity: 1,
      targetAreaSqm: undefined,
      lengthMm: undefined,
      widthMm: undefined,
      thicknessMm: undefined,
      remark: ''
    })
    await dialogRef.value?.handleOpen(data, {
      title: '办理库存组装',
      subtitle: '多组件出库 → 成品批次入库',
      onConfirm: submit
    })
  }
  defineExpose({ handleOpen })
</script>
