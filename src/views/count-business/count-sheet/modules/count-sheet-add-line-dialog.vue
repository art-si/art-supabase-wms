<template>
  <ArtDialog ref="dialogRef" size="lg">
    <div class="min-w-0 space-y-4">
      <ArtEntitySummary
        icon="ri:add-box-line"
        eyebrow="UNRECORDED STOCK"
        title="新增账外物料"
        :description="`${sheet?.documentNo || '盘点表'} · 账存数量为 0，审核时按实盘数量生成盘盈`"
      />
      <ElAlert v-if="optionsError" type="warning" :closable="false" show-icon>
        仓位或项目加载失败，暂不能新增明细。
        <ElButton link type="primary" @click="loadOptions">重新加载</ElButton>
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
            :api-fn="fetchMaterials"
            :label-key="(row) => row.description || row.materialName"
            title="参选账外物料"
            subtitle="先查即时库存，也可选择尚无库存记录的物料主数据"
            placeholder="选择一项或多项物料"
            dialog-width="960px"
          />
        </template>
      </ArtForm>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { ElMessage } from 'element-plus'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtMaterialSelect from '@/components/business/art-material-select/index.vue'
  import type { DataSelectFetchParams } from '@/components/core/forms/art-data-select/types'
  import {
    addWmsCountSheetLines,
    fetchWmsBins,
    fetchWmsCountMaterialOptions,
    fetchWmsProjects,
    type WmsBin,
    type WmsCountMaterialOption,
    type WmsCountSheet,
    type WmsProject
  } from '@wms/api'

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<WmsCountSheet>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const sheet = shallowRef<WmsCountSheet>()
  const bins = ref<WmsBin[]>([])
  const projects = ref<WmsProject[]>([])
  const selectedMaterials = ref<WmsCountMaterialOption[]>([])
  const optionsError = ref(false)
  const form = ref({ materialIds: [] as string[], projectId: '', constructionNo: '', binId: '' })

  async function fetchMaterials(params: DataSelectFetchParams) {
    if (!sheet.value) return { data: [], total: 0 }
    return fetchWmsCountMaterialOptions({
      organizationId: sheet.value.organizationId,
      warehouseIds: [sheet.value.warehouseId],
      keyword: params.keyword,
      page: params.page,
      pageSize: params.pageSize,
      includeUnstocked: true
    })
  }
  const items = computed<FormItem[]>(() => [
    { key: 'materialIds', label: '物料描述', type: 'text', span: 24 },
    {
      key: 'projectId',
      label: '项目名称',
      type: 'select',
      span: 12,
      options: projects.value
        .filter(
          (row) =>
            row.tenantId === sheet.value?.tenantId &&
            row.enabled &&
            !['closed', 'cancelled'].includes(row.projectStatus)
        )
        .map((row) => ({ label: `${row.projectName} · ${row.projectCode}`, value: row.id })),
      props: {
        clearable: true,
        filterable: true,
        placeholder: '公共库存可留空',
        onChange: () => (form.value.constructionNo = '')
      }
    },
    {
      key: 'constructionNo',
      label: '施工号',
      type: 'input',
      span: 12,
      props: {
        maxlength: 100,
        disabled: !form.value.projectId,
        placeholder: '选择项目后填写施工号'
      }
    },
    {
      key: 'binId',
      label: '仓位',
      type: 'select',
      span: 12,
      options: bins.value
        .filter((row) => row.status === 'available')
        .map((row) => ({ label: `${row.binName} · ${row.binCode}`, value: row.id })),
      props: {
        clearable: !sheet.value?.warehouse?.enableLocations,
        filterable: true,
        disabled: !sheet.value?.warehouse?.enableLocations,
        placeholder: sheet.value?.warehouse?.enableLocations ? '选择仓位' : '当前仓库未启用仓位'
      }
    }
  ])
  const rules = computed(() => ({
    constructionNo: form.value.projectId
      ? [{ required: true, message: '项目库存请填写施工号', trigger: 'blur' }]
      : [],
    binId: sheet.value?.warehouse?.enableLocations
      ? [{ required: true, message: '请选择仓位', trigger: 'change' }]
      : []
  }))
  async function loadOptions(): Promise<void> {
    if (!sheet.value) return
    optionsError.value = false
    try {
      const [binRows, projectRows] = await Promise.all([
        fetchWmsBins(sheet.value.warehouseId),
        fetchWmsProjects(sheet.value.tenantId)
      ])
      bins.value = binRows
      projects.value = projectRows
    } catch {
      optionsError.value = true
    }
  }
  async function submit(): Promise<boolean> {
    if (optionsError.value) return false
    if (!(await validateArtFormForSubmit(formRef.value))) return false
    if (!sheet.value || !form.value.materialIds.length) {
      ElMessage.warning('请选择至少一项账外物料')
      return false
    }
    try {
      await addWmsCountSheetLines({
        sheetId: sheet.value.id,
        materialIds: form.value.materialIds,
        projectId: form.value.projectId || null,
        constructionNo: normalizeNullableText(form.value.constructionNo),
        binId: form.value.binId || null
      })
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '账外明细新增失败，请检查物料、项目和仓位后重试')
      return false
    }
  }
  async function handleOpen(target: WmsCountSheet): Promise<void> {
    sheet.value = target
    bins.value = []
    projects.value = []
    selectedMaterials.value = []
    optionsError.value = false
    form.value = { materialIds: [], projectId: '', constructionNo: '', binId: '' }
    await dialogRef.value?.handleOpen(target, {
      title: '新增账外物料',
      subtitle: '选择实物物料和库存归属',
      onConfirm: submit,
      onOpen: async (_target, api) => {
        api.setLoading(true)
        try {
          await loadOptions()
        } finally {
          api.setLoading(false)
        }
      }
    })
  }
  defineExpose({ handleOpen })
</script>
