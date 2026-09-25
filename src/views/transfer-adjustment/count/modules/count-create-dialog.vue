<template>
  <ArtDialog ref="dialogRef" size="md">
    <div class="space-y-4">
      <ArtEntitySummary
        icon="ri:survey-line"
        eyebrow="STOCK COUNT PLAN"
        title="生成盘点方案"
        description="从当前有库存的批次生成盘点表，记录期初数量与 SN 清单。"
      />
      <ElAlert type="info" :closable="false" show-icon>
        可限定项目与施工号；留空时盘点所选仓库的全部项目及公共库存。确认差异前若库存发生变化，需重新生成方案。
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
      />
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import dayjs from 'dayjs'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import {
    createWmsCountPlan,
    type WmsProject,
    type WmsProjectSection,
    type WmsWarehouse
  } from '@wms/api'

  interface Context {
    tenantId?: string
    warehouses: WmsWarehouse[]
    projects: WmsProject[]
    sections: WmsProjectSection[]
  }
  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<Context>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const context = shallowRef<Context>()
  const form = reactive({
    documentNo: '',
    warehouseId: '',
    projectId: '',
    constructionNo: '',
    remark: ''
  })
  const selectedWarehouse = computed(() =>
    context.value?.warehouses.find((row) => row.id === form.warehouseId)
  )
  const items = computed<FormItem[]>(() => [
    {
      key: 'documentNo',
      label: '盘点单号',
      type: 'input',
      span: 24,
      props: { maxlength: 80, placeholder: '自动生成，可修改' }
    },
    {
      key: 'warehouseId',
      label: '盘点仓库',
      type: 'select',
      options: (context.value?.warehouses ?? [])
        .filter(
          (row) =>
            row.status === 'enabled' &&
            (!context.value?.tenantId || row.tenantId === context.value.tenantId)
        )
        .map((row) => ({ label: `${row.warehouseName} · ${row.warehouseCode}`, value: row.id })),
      props: {
        filterable: true,
        placeholder: '选择仓库',
        onChange: () => {
          form.projectId = ''
          form.constructionNo = ''
        }
      }
    },
    {
      key: 'projectId',
      label: '项目范围',
      type: 'select',
      options: (context.value?.projects ?? [])
        .filter(
          (row) =>
            row.tenantId === selectedWarehouse.value?.tenantId &&
            row.enabled &&
            !['closed', 'cancelled'].includes(row.projectStatus)
        )
        .map((row) => ({ label: `${row.projectName} · ${row.projectCode}`, value: row.id })),
      props: {
        clearable: true,
        filterable: true,
        disabled: !form.warehouseId,
        placeholder: '留空盘点全部项目',
        onChange: () => (form.constructionNo = '')
      }
    },
    {
      key: 'constructionNo',
      label: '施工号范围',
      type: 'select',
      options: (context.value?.sections ?? [])
        .filter((row) => row.projectId === form.projectId && row.status === 'active')
        .map((row) => ({
          label: `${row.constructionNo} · ${row.sectionName}`,
          value: row.constructionNo
        })),
      props: {
        clearable: true,
        filterable: true,
        disabled: !form.projectId,
        placeholder: form.projectId ? '留空盘点项目全部施工号' : '请先选项目'
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
  const rules = {
    documentNo: [{ required: true, message: '请填写盘点单号', trigger: 'blur' }],
    warehouseId: [{ required: true, message: '请选择盘点仓库', trigger: 'change' }]
  }
  async function submit(): Promise<boolean> {
    try {
      await formRef.value?.validate()
      await createWmsCountPlan({
        documentNo: form.documentNo.trim(),
        warehouseId: form.warehouseId,
        projectId: form.projectId || null,
        constructionNo: form.constructionNo || null,
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
      documentNo: `PD-${dayjs().format('YYYYMMDD')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      warehouseId: '',
      projectId: '',
      constructionNo: '',
      remark: ''
    })
    await dialogRef.value?.handleOpen(data, {
      title: '生成盘点方案',
      subtitle: '即时库存 → 盘点表 → 盘盈盘亏流水',
      onConfirm: submit
    })
  }
  defineExpose({ handleOpen })
</script>
