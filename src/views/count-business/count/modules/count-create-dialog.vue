<template>
  <ArtDialog ref="dialogRef" size="xl">
    <div class="min-w-0 space-y-4">
      <ArtEntitySummary
        icon="ri:survey-line"
        eyebrow="STOCK COUNT PLAN"
        title="生成盘点方案"
        description="选择一个库存组织及盘点范围，生成各仓库的盘点表。"
      />
      <ElAlert v-if="binsError" type="warning" :closable="false" show-icon>
        仓位资料加载失败，暂不能生成方案。
        <ElButton link type="primary" :loading="binsLoading" @click="loadBins">重新加载</ElButton>
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
        scroll-to-error
      >
        <template #materialIds>
          <ArtMaterialSelect
            v-model:model-values="form.materialIds"
            v-model:selected-data="selectedMaterials"
            multiple
            :api-fn="fetchMaterialOptions"
            :disabled="!form.organizationId"
            :label-key="materialLabel"
            title="参选盘点物料"
            subtitle="从当前库存组织的即时库存选择；留空表示不限物料"
            placeholder="留空盘点全部物料"
            empty-description="当前范围没有即时库存物料，可调整仓库范围。"
            dialog-width="960px"
          />
        </template>
      </ArtForm>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import dayjs from 'dayjs'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtMaterialSelect from '@/components/business/art-material-select/index.vue'
  import type { DataSelectFetchParams } from '@/components/core/forms/art-data-select/types'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import {
    createWmsCountPlanV2,
    fetchWmsBins,
    fetchWmsCountMaterialOptions,
    type WmsBin,
    type WmsCountMaterialOption,
    type WmsCountPlanV2Input,
    type WmsInventoryOrganization,
    type WmsProject,
    type WmsProjectSection,
    type WmsWarehouse
  } from '@wms/api'

  interface Context {
    tenantId?: string
    organizations: WmsInventoryOrganization[]
    warehouses: WmsWarehouse[]
    projects: WmsProject[]
    sections: WmsProjectSection[]
  }

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<Context>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const context = shallowRef<Context>()
  const { defaultWriteTenantId } = useTenantScopeFormPolicy()
  const countMethodOptions = useDictionaryOptions('wmsCountMethod')
  const backupOptions = useDictionaryOptions('wmsCountBackupCondition')
  const quantityDefaultOptions = useDictionaryOptions('wmsCountQuantityDefault')
  const bins = ref<WmsBin[]>([])
  const binsLoading = ref(false)
  const binsError = ref(false)
  const selectedMaterials = ref<WmsCountMaterialOption[]>([])
  let binLoadVersion = 0
  const today = () => dayjs().format('YYYY-MM-DD')
  const form = ref<WmsCountPlanV2Input>({
    documentNo: '',
    organizationId: '',
    warehouseIds: [],
    binIds: [],
    materialIds: [],
    projectId: null,
    constructionNo: null,
    businessDate: today(),
    countMethod: 'regular',
    backupCondition: 'immediate',
    cutoffDate: null,
    includeZeroStock: false,
    freezeMovements: false,
    recountEnabled: false,
    countQuantityDefault: 'zero',
    remark: null
  })
  const availableOrganizations = computed(() =>
    (context.value?.organizations ?? []).filter(
      (row) =>
        row.enabledOn && (!context.value?.tenantId || row.tenantId === context.value.tenantId)
    )
  )
  const selectedOrganization = computed(() =>
    availableOrganizations.value.find((row) => row.id === form.value.organizationId)
  )
  const scopedWarehouses = computed(() =>
    (context.value?.warehouses ?? []).filter(
      (row) => row.organizationId === form.value.organizationId && row.status === 'enabled'
    )
  )
  const scopedBins = computed(() =>
    bins.value.filter(
      (row) =>
        row.status === 'available' &&
        (!form.value.warehouseIds.length || form.value.warehouseIds.includes(row.warehouseId))
    )
  )
  const materialLabel = (row: WmsCountMaterialOption): string => row.description || row.materialName
  async function fetchMaterialOptions(params: DataSelectFetchParams) {
    if (!form.value.organizationId) return { data: [], total: 0 }
    return fetchWmsCountMaterialOptions({
      organizationId: form.value.organizationId,
      warehouseIds: form.value.warehouseIds,
      keyword: params.keyword,
      page: params.page,
      pageSize: params.pageSize
    })
  }
  async function loadBins(): Promise<void> {
    const version = ++binLoadVersion
    binsLoading.value = true
    binsError.value = false
    try {
      const rows = await Promise.all(scopedWarehouses.value.map((row) => fetchWmsBins(row.id)))
      if (version === binLoadVersion) bins.value = rows.flat()
    } catch {
      if (version === binLoadVersion) binsError.value = true
    } finally {
      if (version === binLoadVersion) binsLoading.value = false
    }
  }
  function onOrganizationChange(): void {
    form.value.warehouseIds = []
    form.value.binIds = []
    form.value.materialIds = []
    form.value.projectId = null
    form.value.constructionNo = null
    selectedMaterials.value = []
    void loadBins()
  }
  function onWarehouseChange(): void {
    form.value.binIds = []
    form.value.materialIds = []
    selectedMaterials.value = []
  }
  function onBackupChange(): void {
    if (form.value.backupCondition === 'cutoff') {
      form.value.cutoffDate ||= today()
      form.value.includeZeroStock = false
    } else {
      form.value.cutoffDate = null
    }
  }
  const items = computed<FormItem[]>(() => [
    { key: 'identitySection', label: '基本信息', type: 'divider', span: 24 },
    {
      key: 'documentNo',
      label: '方案编号',
      type: 'input',
      span: 12,
      props: { maxlength: 80, placeholder: '输入方案编号' }
    },
    {
      key: 'organizationId',
      label: '库存组织',
      type: 'select',
      span: 12,
      options: availableOrganizations.value.map((row) => ({
        label: `${row.organizationName} · ${row.organizationCode}`,
        value: row.id
      })),
      props: { filterable: true, placeholder: '选择库存组织', onChange: onOrganizationChange },
      description: '每个方案仅针对一个库存组织。'
    },
    {
      key: 'businessDate',
      label: '业务日期',
      type: 'date',
      span: 8,
      props: { valueFormat: 'YYYY-MM-DD', style: { width: '100%' } }
    },
    {
      key: 'countMethod',
      label: '盘点方式',
      type: 'select',
      span: 8,
      options: countMethodOptions,
      props: { placeholder: '选择盘点方式' }
    },
    {
      key: 'backupCondition',
      label: '数据备份条件',
      type: 'radioGroup',
      span: 8,
      props: { optionType: 'button', options: backupOptions, onChange: onBackupChange }
    },
    ...(form.value.backupCondition === 'cutoff'
      ? [
          {
            key: 'cutoffDate',
            label: '截止日期',
            type: 'date' as const,
            span: 8,
            props: {
              valueFormat: 'YYYY-MM-DD',
              style: { width: '100%' },
              disabledDate: (date: Date) => dayjs(date).isAfter(today(), 'day')
            },
            description: '以截止日的结存数量作为账存。'
          }
        ]
      : []),
    { key: 'parameterSection', label: '盘点参数', type: 'divider', span: 24 },
    {
      key: 'countQuantityDefault',
      label: '盘点数量默认值',
      type: 'radioGroup',
      span: 12,
      props: { optionType: 'button', options: quantityDefaultOptions },
      description: '仅预填显示；提交前仍需确认并保存实盘结果。'
    },
    {
      key: 'includeZeroStock',
      label: '零库存参与盘点',
      type: 'switch',
      span: 12,
      props: { disabled: form.value.backupCondition === 'cutoff' },
      description:
        form.value.backupCondition === 'cutoff'
          ? '截止日期库存不适用零库存参与。'
          : '即时库存数量为 0 的批次也纳入盘点。'
    },
    {
      key: 'freezeMovements',
      label: '冻结出入库',
      type: 'switch',
      span: 12,
      description: '方案审核后冻结选定范围，全部盘点表审核完成后解除。'
    },
    {
      key: 'recountEnabled',
      label: '启用复盘',
      type: 'switch',
      span: 12,
      description: '盘点表增加复盘数量，最终差异按复盘结果计算。'
    },
    { key: 'scopeSection', label: '盘点范围', type: 'divider', span: 24 },
    {
      key: 'warehouseIds',
      label: '仓库',
      type: 'select',
      span: 12,
      options: scopedWarehouses.value.map((row) => ({
        label: `${row.warehouseName} · ${row.warehouseCode}`,
        value: row.id
      })),
      props: {
        multiple: true,
        filterable: true,
        collapseTags: true,
        collapseTagsTooltip: true,
        disabled: !form.value.organizationId,
        placeholder: '留空选择该库存组织全部仓库',
        onChange: onWarehouseChange
      }
    },
    {
      key: 'binIds',
      label: '仓位',
      type: 'select',
      span: 12,
      options: scopedBins.value.map((row) => ({
        label: `${row.binName} · ${row.binCode}`,
        value: row.id
      })),
      props: {
        multiple: true,
        filterable: true,
        collapseTags: true,
        collapseTagsTooltip: true,
        disabled: !form.value.organizationId || binsLoading.value || binsError.value,
        placeholder: '留空不限制仓位'
      }
    },
    { key: 'materialIds', label: '物料', type: 'text', span: 24 },
    {
      key: 'projectId',
      label: '项目范围',
      type: 'select',
      span: 12,
      options: (context.value?.projects ?? [])
        .filter(
          (row) =>
            row.tenantId === selectedOrganization.value?.tenantId &&
            row.enabled &&
            !['closed', 'cancelled'].includes(row.projectStatus)
        )
        .map((row) => ({ label: `${row.projectName} · ${row.projectCode}`, value: row.id })),
      props: {
        clearable: true,
        filterable: true,
        disabled: !form.value.organizationId,
        placeholder: '留空盘点全部项目',
        onChange: () => (form.value.constructionNo = null)
      }
    },
    {
      key: 'constructionNo',
      label: '施工号范围',
      type: 'select',
      span: 12,
      options: (context.value?.sections ?? [])
        .filter((row) => row.projectId === form.value.projectId && row.status === 'active')
        .map((row) => ({
          label: `${row.constructionNo} · ${row.sectionName}`,
          value: row.constructionNo
        })),
      props: {
        clearable: true,
        filterable: true,
        disabled: !form.value.projectId,
        placeholder: form.value.projectId ? '留空盘点项目全部施工号' : '请先选项目'
      }
    },
    {
      key: 'remark',
      label: '盘点说明',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 2, maxlength: 500, showWordLimit: true }
    }
  ])
  const rules = computed(() => ({
    documentNo: [{ required: true, message: '请填写盘点方案编号', trigger: 'blur' }],
    organizationId: [{ required: true, message: '请选择库存组织', trigger: 'change' }],
    cutoffDate:
      form.value.backupCondition === 'cutoff'
        ? [{ required: true, message: '请选择截止日期', trigger: 'change' }]
        : []
  }))
  async function submit(): Promise<boolean> {
    try {
      if (binsError.value || binsLoading.value) return false
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      await createWmsCountPlanV2({
        ...form.value,
        documentNo: form.value.documentNo.trim(),
        projectId: form.value.projectId || null,
        constructionNo: normalizeNullableText(form.value.constructionNo),
        remark: normalizeNullableText(form.value.remark)
      })
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '盘点方案生成失败，请检查范围、库存与网络后重试')
      return false
    }
  }
  async function handleOpen(data: Context): Promise<void> {
    context.value = data
    bins.value = []
    binsError.value = false
    selectedMaterials.value = []
    const options = data.organizations.filter(
      (row) => row.enabledOn && (!data.tenantId || row.tenantId === data.tenantId)
    )
    const preferred =
      options.find((row) => row.tenantId === defaultWriteTenantId.value && row.isDefault) ??
      options.find((row) => row.tenantId === defaultWriteTenantId.value) ??
      options.find((row) => row.isDefault) ??
      options[0]
    form.value = {
      documentNo: `PD-${dayjs().format('YYYYMMDD')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      organizationId: preferred?.id ?? '',
      warehouseIds: [],
      binIds: [],
      materialIds: [],
      projectId: null,
      constructionNo: null,
      businessDate: today(),
      countMethod: 'regular',
      backupCondition: 'immediate',
      cutoffDate: null,
      includeZeroStock: false,
      freezeMovements: false,
      recountEnabled: false,
      countQuantityDefault: 'zero',
      remark: null
    }
    await dialogRef.value?.handleOpen(data, {
      title: '生成盘点方案',
      subtitle: '库存组织 → 账存快照 → 分仓盘点表',
      onConfirm: submit,
      onOpen: async (_context, api) => {
        api.setLoading(true)
        try {
          await loadBins()
        } finally {
          api.setLoading(false)
        }
      }
    })
  }
  defineExpose({ handleOpen })
</script>
