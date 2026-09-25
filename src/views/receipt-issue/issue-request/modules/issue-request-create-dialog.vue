<template>
  <ArtDialog ref="dialogRef" size="xl">
    <div class="flex flex-col gap-4">
      <ArtEntitySummary
        icon="ri:file-list-3-line"
        eyebrow="MATERIAL ISSUE REQUEST"
        title="提交领料申请"
        description="先按工单列出所需物料；审核通过后，再按批次和 SN 分次领料。"
      />
      <ElAlert type="info" :closable="false" show-icon>
        项目、施工号与库存组织从 MES 工单继承。工单预留物料会自动带入，可补充其他物料。
      </ElAlert>
      <ElAlert v-if="loadError" type="error" :closable="false" show-icon>
        工单或预留物料加载失败，请重新选择仓库与工单。
      </ElAlert>
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
        <template #scope>
          <span class="flex min-h-9 items-center text-sm">{{ scopeLabel }}</span>
        </template>
      </ArtForm>
      <ArtSectionCard
        title="申请物料"
        :subtitle="`已列 ${lines.length} 种物料；最多 50 种，同一物料只需一行。`"
        :empty="!lines.length"
        :empty-title="form.workOrderId ? '请添加申请物料' : '请先选择 MES 工单'"
        empty-description="每行填写申请数量；出库时可由多个库存批次分次满足。"
      >
        <template #actions>
          <ElButton
            v-auth="'WmsIssueRequest:Create'"
            :disabled="!form.workOrderId || lines.length >= 50"
            @click="addLine"
          >
            添加物料
          </ElButton>
        </template>
        <div class="divide-y divide-[var(--el-border-color-light)]">
          <div
            v-for="(line, index) in lines"
            :key="line.key"
            class="grid min-w-0 gap-3 py-3 md:grid-cols-[minmax(0,1fr)_150px_48px] md:items-end"
          >
            <label class="grid min-w-0 gap-1 text-sm">
              <span>物料 {{ index + 1 }}</span>
              <ArtTableSingleSelect
                :model-value="line.materialId || undefined"
                :api-fn="materialApi"
                :selected-data="line.material ? [line.material] : []"
                :columns="materialColumns"
                title="选择领料物料"
                placeholder="按编码或名称选择物料"
                search-placeholder="输入物料编码或名称"
                label-key="materialName"
                :show-pagination="true"
                :page-size="20"
                @update:selected-data="onMaterialSelected(line, $event)"
              />
            </label>
            <label class="grid gap-1 text-sm">
              <span>申请数量</span>
              <ElInputNumber
                v-model="line.quantity"
                :min="0.001"
                :precision="3"
                :controls="false"
                class="w-full!"
                :aria-label="`第 ${index + 1} 行申请数量`"
              />
            </label>
            <ElButton
              text
              type="danger"
              :aria-label="`移除第 ${index + 1} 行`"
              @click="removeLine(line.key)"
            >
              移除
            </ElButton>
          </div>
        </div>
      </ArtSectionCard>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { ElMessage } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtTableSingleSelect from '@/components/core/forms/art-data-select/table-single.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import type {
    DataSelectColumn,
    DataSelectFetchParams,
    DataSelectRecord
  } from '@/components/core/forms/art-data-select/types'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import {
    createWmsIssueRequest,
    fetchWmsIssueReservationLines,
    fetchWmsMaterialOptions,
    fetchWmsWorkOrderOptions,
    type WmsMaterialOption,
    type WmsProject,
    type WmsWarehouse,
    type WmsWorkOrderOption
  } from '@wms/api'

  interface Context {
    tenantId?: string
    warehouses: WmsWarehouse[]
    projects: WmsProject[]
  }
  interface DraftLine {
    key: string
    materialId: string
    material: WmsMaterialOption | null
    quantity: number
  }
  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<Context>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const context = shallowRef<Context>()
  const orders = ref<WmsWorkOrderOption[]>([])
  const lines = ref<DraftLine[]>([])
  const loadError = ref(false)
  const form = reactive({ warehouseId: '', workOrderId: '', documentNo: '', remark: '' })
  const selectedWarehouse = computed(() =>
    context.value?.warehouses.find((row) => row.id === form.warehouseId)
  )
  const selectedOrder = computed(() => orders.value.find((row) => row.id === form.workOrderId))
  const scopeLabel = computed(() => {
    const order = selectedOrder.value
    if (!order) return '选择工单后自动带入'
    const project = context.value?.projects.find((row) => row.id === order.projectId)
    return project
      ? `${project.projectName} / ${order.constructionNo || '施工号未设置'}`
      : '普通非项目工单'
  })
  const materialColumns: DataSelectColumn[] = [
    { prop: 'materialCode', label: '物料编码', minWidth: 160 },
    { prop: 'materialName', label: '物料名称', minWidth: 210 },
    { prop: 'specificationModel', label: '规格型号', minWidth: 150 }
  ]
  const items = computed<FormItem[]>(() => [
    {
      key: 'warehouseId',
      label: '领料仓库',
      type: 'select',
      options: (context.value?.warehouses || [])
        .filter(
          (row) =>
            row.status === 'enabled' &&
            (!context.value?.tenantId || row.tenantId === context.value.tenantId)
        )
        .map((row) => ({ label: `${row.warehouseName} · ${row.warehouseCode}`, value: row.id })),
      props: { filterable: true, placeholder: '选择工单领料仓库', onChange: onWarehouseChange }
    },
    {
      key: 'workOrderId',
      label: 'MES 工单',
      type: 'select',
      options: orders.value.map((row) => ({
        label: `${row.workOrderNo}${row.constructionNo ? ` · ${row.constructionNo}` : ''}`,
        value: row.id
      })),
      props: {
        filterable: true,
        remote: true,
        remoteMethod: searchOrders,
        disabled: !form.warehouseId,
        placeholder: '选择已下达工单',
        onChange: onOrderChange
      }
    },
    {
      key: 'documentNo',
      label: '申请单号',
      type: 'input',
      props: { maxlength: 80, placeholder: '留空自动生成' }
    },
    {
      key: 'scope',
      label: '项目 / 施工号',
      type: 'slot'
    },
    {
      key: 'remark',
      label: '申请说明',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 2, maxlength: 500, showWordLimit: true }
    }
  ])
  const rules = {
    warehouseId: [{ required: true, message: '请选择领料仓库', trigger: 'change' }],
    workOrderId: [{ required: true, message: '请选择 MES 工单', trigger: 'change' }]
  }
  async function searchOrders(keyword = ''): Promise<void> {
    if (!form.warehouseId) return
    loadError.value = false
    try {
      orders.value = await fetchWmsWorkOrderOptions(form.warehouseId, keyword)
    } catch {
      loadError.value = true
    }
  }
  function onWarehouseChange(): void {
    form.workOrderId = ''
    orders.value = []
    lines.value = []
    void searchOrders()
  }
  async function onOrderChange(): Promise<void> {
    lines.value = []
    if (!form.workOrderId || !form.warehouseId) return
    loadError.value = false
    try {
      const reservations = await fetchWmsIssueReservationLines(form.workOrderId, form.warehouseId)
      lines.value = reservations.map((row) => ({
        key: crypto.randomUUID(),
        materialId: row.materialId,
        material: {
          id: row.materialId,
          materialCode: row.material?.materialCode || '',
          materialName: row.material?.materialName || '预留物料',
          specificationModel: null,
          description: null,
          serialManagementEnabled: false
        },
        quantity: row.reservedQuantity
      }))
    } catch {
      loadError.value = true
    }
  }
  function addLine(): void {
    if (lines.value.length < 50)
      lines.value.push({ key: crypto.randomUUID(), materialId: '', material: null, quantity: 1 })
  }
  function removeLine(key: string): void {
    lines.value = lines.value.filter((row) => row.key !== key)
  }
  async function materialApi(params: DataSelectFetchParams) {
    const tenantId = selectedWarehouse.value?.tenantId
    if (!tenantId) return { data: [], total: 0 }
    return fetchWmsMaterialOptions(tenantId, params.keyword, params.page, params.pageSize)
  }
  function onMaterialSelected(line: DraftLine, rows: DataSelectRecord[]): void {
    const row = rows[0]
    line.material = row && typeof row.id === 'string' ? (row as WmsMaterialOption) : null
    line.materialId = line.material?.id || ''
  }
  async function submit(): Promise<boolean> {
    try {
      await formRef.value?.validate()
      if (loadError.value || !selectedOrder.value || !selectedWarehouse.value) return false
      if (!lines.value.length || lines.value.some((row) => !row.materialId || row.quantity <= 0)) {
        ElMessage.warning('请填写至少一条有效物料和申请数量')
        return false
      }
      if (new Set(lines.value.map((row) => row.materialId)).size !== lines.value.length) {
        ElMessage.warning('同一物料只能申请一行，请合并数量')
        return false
      }
      await createWmsIssueRequest({
        warehouseId: form.warehouseId,
        workOrderId: form.workOrderId,
        documentNo: normalizeNullableText(form.documentNo),
        remark: normalizeNullableText(form.remark),
        lines: lines.value.map((row) => ({ materialId: row.materialId, quantity: row.quantity }))
      })
      emit('success')
      return true
    } catch {
      return false
    }
  }
  async function handleOpen(data: Context): Promise<void> {
    context.value = data
    orders.value = []
    lines.value = []
    loadError.value = false
    Object.assign(form, { warehouseId: '', workOrderId: '', documentNo: '', remark: '' })
    await dialogRef.value?.handleOpen(data, {
      title: '提交领料申请',
      subtitle: '工单需求 → 审核 → 分批领料',
      onConfirm: submit
    })
  }
  defineExpose({ handleOpen })
</script>
