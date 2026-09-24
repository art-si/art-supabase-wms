<template>
  <ArtDialog ref="dialogRef" size="md">
    <div class="space-y-4">
      <ArtEntitySummary
        icon="ri:swap-2-line"
        eyebrow="PROJECT INVENTORY TRANSFER"
        title="项目库存调拨"
        :description="sourceDescription"
      />
      <ElAlert
        title="调拨将生成新库存批次和不可变流水；来源项目归属不会被直接改写。"
        type="info"
        :closable="false"
        show-icon
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
      <ElAlert
        v-if="serialLoadError"
        title="序列号加载失败"
        description="请重新打开调拨单后再提交，避免漏选单件。"
        type="error"
        :closable="false"
      />
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { normalizeNullableText } from '@/utils/form/normalize'
  import { ElMessage } from 'element-plus'
  import dayjs from 'dayjs'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import { fetchWmsBatchSerials, transferWmsProject } from '@wms/api'
  import type { WmsBatchSerial, WmsProject, WmsProjectSection, WmsStockBatch } from '@wms/api'

  interface Context {
    batch: WmsStockBatch
    projects: WmsProject[]
    sections: WmsProjectSection[]
    sourceProjectName: string
  }

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<Context>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const context = shallowRef<Context>()
  const serials = ref<WmsBatchSerial[]>([])
  const serialLoadError = ref(false)
  const form = reactive({
    referenceNo: '',
    quantity: 1,
    targetProjectId: '',
    targetConstructionNo: '',
    serialIds: [] as string[],
    remark: ''
  })
  const sourceDescription = computed(() => {
    const batch = context.value?.batch
    if (!batch) return ''
    const scope = batch.projectId
      ? `${context.value?.sourceProjectName || '项目'} · ${batch.constructionNo || '未标施工号'}`
      : '公共库存'
    return `${batch.material?.materialName || '物料'} · ${batch.batchNo} · ${scope} · 在库 ${batch.quantity}`
  })
  const targetSections = computed(
    () =>
      context.value?.sections.filter(
        (section) => section.projectId === form.targetProjectId && section.status === 'active'
      ) ?? []
  )
  const items = computed<FormItem[]>(() => [
    {
      key: 'referenceNo',
      label: '项目调拨单号',
      type: 'input',
      span: 12,
      props: { maxlength: 80, placeholder: '用于幂等校验与审计追溯' }
    },
    {
      key: 'quantity',
      label: '调拨数量',
      type: 'number',
      span: 12,
      props: {
        min: context.value?.batch.packId ? context.value.batch.quantity : 0.001,
        max: context.value?.batch.quantity ?? 1,
        precision: 3,
        class: 'w-full!',
        disabled: Boolean(context.value?.batch.packId)
      },
      help: context.value?.batch.packId ? '垛包库存必须整包调拨；目标项目需重新排包。' : undefined
    },
    {
      key: 'targetProjectId',
      label: '目标项目',
      type: 'select',
      options: (context.value?.projects ?? [])
        .filter(
          (project) =>
            project.tenantId === context.value?.batch.tenantId &&
            project.enabled &&
            !['closed', 'cancelled'].includes(project.projectStatus)
        )
        .map((project) => ({
          label: `${project.projectName} · ${project.projectCode}`,
          value: project.id
        })),
      props: {
        clearable: true,
        filterable: true,
        placeholder: '留空表示调拨至公共库存',
        onChange: () => (form.targetConstructionNo = '')
      },
      help: '从项目库存转为公共库存时，清空目标项目。'
    },
    {
      key: 'targetConstructionNo',
      label: '目标施工号',
      type: 'select',
      options: targetSections.value.map((section) => ({
        label: `${section.constructionNo} · ${section.sectionName}`,
        value: section.constructionNo
      })),
      props: {
        clearable: true,
        filterable: true,
        disabled: !form.targetProjectId,
        placeholder: form.targetProjectId ? '选择目标施工号' : '公共库存无施工号'
      }
    },
    ...(serials.value.length || context.value?.batch.material?.serialManagementEnabled
      ? [
          {
            key: 'serialIds',
            label: '随批次调拨的序列号',
            type: 'select' as const,
            span: 24,
            options: serials.value.map((serial) => ({
              label: serial.serialNo,
              value: serial.id
            })),
            props: { multiple: true, filterable: true, collapseTags: true },
            help: '序列号物料必须逐件选择；已绑定的主机和子件需一起调拨。'
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
    referenceNo: [{ required: true, message: '请填写项目调拨单号', trigger: 'blur' }],
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

  async function submit(): Promise<boolean> {
    try {
      await formRef.value?.validate()
      const batch = context.value?.batch
      if (!batch || serialLoadError.value) return false
      if (form.quantity > batch.quantity) {
        ElMessage.warning('调拨数量不能超过当前在库数量')
        return false
      }
      if (batch.packId && form.quantity !== batch.quantity) {
        ElMessage.warning('垛包库存必须整包调拨')
        return false
      }
      if (form.targetProjectId && !form.targetConstructionNo) {
        ElMessage.warning('请选择目标项目的施工号')
        return false
      }
      if (
        batch.projectId === (form.targetProjectId || null) &&
        batch.constructionNo === (form.targetConstructionNo || null)
      ) {
        ElMessage.warning('目标项目和施工号与来源相同，无需调拨')
        return false
      }
      if (
        (batch.material?.serialManagementEnabled || serials.value.length > 0) &&
        form.serialIds.length !== form.quantity
      ) {
        ElMessage.warning('序列号件数必须与调拨数量一致')
        return false
      }
      await transferWmsProject({
        batchId: batch.id,
        quantity: form.quantity,
        targetProjectId: form.targetProjectId || null,
        targetConstructionNo: form.targetConstructionNo || null,
        referenceNo: form.referenceNo.trim(),
        remark: normalizeNullableText(form.remark),
        serialIds: form.serialIds
      })
      emit('success')
      return true
    } catch {
      return false
    }
  }

  async function handleOpen(data: Context): Promise<void> {
    context.value = data
    serials.value = []
    serialLoadError.value = false
    Object.assign(form, {
      referenceNo: `XMD-${dayjs().format('YYYYMMDD')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      quantity: data.batch.packId ? data.batch.quantity : 1,
      targetProjectId: '',
      targetConstructionNo: '',
      serialIds: [],
      remark: ''
    })
    await dialogRef.value?.handleOpen(data, {
      title: '办理项目调拨',
      subtitle: '保持来源批次与目标批次的完整审计链',
      onConfirm: submit,
      onOpen: async () => {
        dialogRef.value?.setLoading(true)
        try {
          serials.value = await fetchWmsBatchSerials(data.batch.id)
        } catch {
          serialLoadError.value = true
        } finally {
          dialogRef.value?.setLoading(false)
        }
      }
    })
  }
  defineExpose({ handleOpen })
</script>
