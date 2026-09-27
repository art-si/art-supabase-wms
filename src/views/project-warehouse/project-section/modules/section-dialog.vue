<template>
  <ArtDialog ref="dialogRef" size="md">
    <div class="space-y-4">
      <ArtEntitySummary
        icon="ri:building-2-line"
        eyebrow="PROJECT DELIVERY SCOPE"
        :title="form.id ? '维护施工号' : '新建施工号'"
        description="施工号归属于一个项目；关闭后保留历史库存和单据，但不能再建立新的业务记录。"
      />
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
      />
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import { saveWmsProjectSection, type WmsProject, type WmsProjectSection } from '@wms/api'

  const wmsProjectSectionStatusOptions = useDictionaryOptions('wmsProjectSectionStatus')

  interface Context {
    row?: WmsProjectSection
    projects: WmsProject[]
    tenantId?: string
  }

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<Context>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const context = shallowRef<Context>()
  const form = reactive({
    id: '',
    projectId: '',
    constructionNo: '',
    sectionName: '',
    status: 'active' as 'active' | 'closed',
    remark: ''
  })
  const items = computed<FormItem[]>(() => [
    {
      key: 'projectId',
      label: '所属项目',
      type: 'select',
      span: 24,
      options: (context.value?.projects ?? [])
        .filter(
          (project) =>
            (!context.value?.tenantId || project.tenantId === context.value.tenantId) &&
            (form.id === ''
              ? project.enabled && !['closed', 'cancelled'].includes(project.projectStatus)
              : true)
        )
        .map((project) => ({
          label: `${project.projectName} · ${project.projectCode}`,
          value: project.id
        })),
      props: { disabled: !!form.id, filterable: true, placeholder: '选择项目' }
    },
    {
      key: 'constructionNo',
      label: '施工号',
      props: { disabled: !!form.id, maxlength: 80, placeholder: '例如 1# 外墙标段' }
    },
    {
      key: 'sectionName',
      label: '施工分项名称',
      props: { maxlength: 120, placeholder: '面向作业与报表的易读名称' }
    },
    {
      key: 'status',
      label: '状态',
      type: 'select',
      options: wmsProjectSectionStatusOptions,
      props: { disabled: !form.id }
    },
    {
      key: 'remark',
      label: '说明',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 2, maxlength: 500, showWordLimit: true }
    }
  ])
  const rules = {
    projectId: [{ required: true, message: '请选择项目', trigger: 'change' }],
    constructionNo: [{ required: true, message: '请输入施工号', trigger: 'blur' }],
    sectionName: [{ required: true, message: '请输入施工分项名称', trigger: 'blur' }]
  }

  async function submit(): Promise<boolean> {
    try {
      await formRef.value?.validate()
      await saveWmsProjectSection({
        id: form.id || undefined,
        projectId: form.projectId,
        constructionNo: form.constructionNo.trim(),
        sectionName: form.sectionName.trim(),
        status: form.status,
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
    Object.assign(form, {
      id: data.row?.id || '',
      projectId: data.row?.projectId || '',
      constructionNo: data.row?.constructionNo || '',
      sectionName: data.row?.sectionName || '',
      status: data.row?.status || 'active',
      remark: data.row?.remark || ''
    })
    await dialogRef.value?.handleOpen(data, {
      title: data.row ? '维护施工号' : '新建施工号',
      subtitle: data.row?.constructionNo || '项目交付范围',
      onConfirm: submit,
      onOpen: () => formRef.value?.clearValidate()
    })
  }
  defineExpose({ handleOpen })
</script>
