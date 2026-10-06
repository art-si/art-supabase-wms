<template>
  <ArtDialog ref="dialogRef" size="md">
    <div class="min-w-0 space-y-4">
      <ArtEntitySummary
        icon="ri:swap-2-line"
        eyebrow="PROJECT INVENTORY TRANSFER"
        title="项目库存调拨"
        :description="sourceDescription"
      />
      <ArtEmptyState
        v-if="loadError"
        title="调拨信息加载失败"
        :description="loadError"
        size="compact"
        :visual-size="80"
      >
        <ElButton type="primary" @click="loadDetails">重新加载</ElButton>
      </ArtEmptyState>
      <template v-else-if="context">
        <ElAlert
          title="调拨后生成目标库存批次，并保留来源项目和调拨记录。"
          type="info"
          :closable="false"
          show-icon
        />
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
        />
      </template>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import { ElMessage, type FormRules } from 'element-plus'
  import { useMediaQuery } from '@vueuse/core'
  import dayjs from 'dayjs'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import {
    fetchWmsBatchSerials,
    fetchWmsProjectSections,
    fetchWmsProjects,
    fetchWmsStockPage,
    transferWmsProject
  } from '@wms/api'
  import type { WmsBatchSerial, WmsProject, WmsProjectSection, WmsStockBatch } from '@wms/api'

  interface OpenRequest {
    batchId: string
    batchNo: string
    materialName: string
    quantity: number
    sourceProjectName: string
    tenantId: string | null
  }

  interface Context {
    batch: WmsStockBatch
    projects: WmsProject[]
    sections: WmsProjectSection[]
    sourceProjectName: string
  }

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<OpenRequest>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const context = shallowRef<Context>()
  const openRequest = shallowRef<OpenRequest>()
  const serials = ref<WmsBatchSerial[]>([])
  const loadError = ref('')
  const isNarrowScreen = useMediaQuery('(max-width: 767px)')
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  let loadRequest = 0
  const form = ref({
    referenceNo: '',
    quantity: 1,
    targetProjectId: '',
    targetConstructionNo: '',
    serialIds: [] as string[],
    remark: ''
  })
  const sourceDescription = computed(() => {
    const batch = context.value?.batch
    if (!batch) {
      const request = openRequest.value
      return request
        ? `${request.materialName} · ${request.batchNo} · ${request.sourceProjectName} · 在库 ${request.quantity}`
        : ''
    }
    const scope = batch.projectId
      ? `${context.value?.sourceProjectName || '项目'} · ${batch.constructionNo || '未标施工号'}`
      : '公共库存'
    return `${batch.material?.materialName || '物料'} · ${batch.batchNo} · ${scope} · 在库 ${batch.quantity}`
  })
  const targetSections = computed(
    () =>
      context.value?.sections.filter(
        (section) => section.projectId === form.value.targetProjectId && section.status === 'active'
      ) ?? []
  )
  const items = computed<FormItem[]>(() => [
    {
      key: 'referenceNo',
      label: '项目调拨单号',
      type: 'input',
      span: isNarrowScreen.value ? 24 : 12,
      props: { maxlength: 80, placeholder: '自动生成，可按业务需要修改' }
    },
    {
      key: 'quantity',
      label: '调拨数量',
      type: 'number',
      span: isNarrowScreen.value ? 24 : 12,
      props: {
        min: context.value?.batch.packId ? context.value.batch.quantity : 0.001,
        max: context.value?.batch.quantity ?? 1,
        precision: 3,
        class: 'w-full!',
        disabled: Boolean(context.value?.batch.packId)
      },
      help: context.value?.batch.packId ? '垛包库存必须整包调拨；目标项目沿用原包号。' : undefined
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
        onChange: () => (form.value.targetConstructionNo = '')
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
        disabled: !form.value.targetProjectId,
        placeholder: form.value.targetProjectId ? '选择目标施工号' : '公共库存无施工号'
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
            help: '序列号物料必须逐件选择。在库子件须与主机一起调拨；已装配领用的子件保留原项目与工单追溯。'
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
  const rules = computed<FormRules>(() => ({
    referenceNo: [{ required: true, message: '请填写项目调拨单号', trigger: 'blur' }],
    quantity: [
      {
        required: true,
        type: 'number' as const,
        min: 0.001,
        message: '请输入有效数量',
        trigger: 'change'
      }
    ],
    targetConstructionNo: [
      {
        required: Boolean(form.value.targetProjectId),
        message: '请选择目标项目的施工号',
        trigger: 'change'
      }
    ],
    serialIds: [
      {
        validator: (_rule, value: string[], callback) => {
          if (
            (context.value?.batch.material?.serialManagementEnabled || serials.value.length > 0) &&
            value.length !== form.value.quantity
          ) {
            callback(new Error('序列号件数必须与调拨数量一致'))
          } else {
            callback()
          }
        },
        trigger: 'change'
      }
    ]
  }))

  async function submit(): Promise<boolean> {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      const batch = context.value?.batch
      if (!batch || loadError.value) return false
      if (form.value.quantity > batch.quantity) {
        ElMessage.warning('调拨数量不能超过当前在库数量')
        return false
      }
      if (batch.packId && form.value.quantity !== batch.quantity) {
        ElMessage.warning('垛包库存必须整包调拨')
        return false
      }
      if (
        batch.projectId === (form.value.targetProjectId || null) &&
        batch.constructionNo === (form.value.targetConstructionNo || null)
      ) {
        ElMessage.warning('目标项目和施工号与来源相同，无需调拨')
        return false
      }
      await transferWmsProject({
        batchId: batch.id,
        quantity: form.value.quantity,
        targetProjectId: form.value.targetProjectId || null,
        targetConstructionNo: form.value.targetConstructionNo || null,
        referenceNo: form.value.referenceNo.trim(),
        remark: normalizeNullableText(form.value.remark),
        serialIds: form.value.serialIds
      })
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '项目库存调拨提交失败，请检查填写内容和网络后重试')
      return false
    }
  }

  async function loadDetails(): Promise<void> {
    const opening = openRequest.value
    if (!opening) return
    const request = ++loadRequest
    context.value = undefined
    serials.value = []
    loadError.value = ''
    dialogRef.value?.setOptions({ confirmDisabled: true })
    dialogRef.value?.setLoading(true)
    try {
      const [{ data }, projects, sections, batchSerials] = await Promise.all([
        fetchWmsStockPage({ id: opening.batchId, current: 1, size: 1 }),
        fetchWmsProjects(opening.tenantId || undefined),
        fetchWmsProjectSections(),
        fetchWmsBatchSerials(opening.batchId)
      ])
      if (request !== loadRequest) return
      if (opening.tenantId !== (effectiveTenantId.value || null)) {
        loadError.value = '租户范围已变化，请关闭弹窗并重新选择库存批次。'
        return
      }
      const batch = data[0]
      if (!batch || batch.quantity <= 0) {
        loadError.value = '当前批次已不可用，请刷新即时库存后重试。'
        return
      }
      context.value = { batch, projects, sections, sourceProjectName: opening.sourceProjectName }
      serials.value = batchSerials
      form.value.quantity = batch.packId ? batch.quantity : Math.min(1, batch.quantity)
      dialogRef.value?.setOptions({ confirmDisabled: false })
    } catch {
      if (request === loadRequest) loadError.value = '请检查网络后重新加载调拨信息。'
    } finally {
      if (request === loadRequest) dialogRef.value?.setLoading(false)
    }
  }

  function handleOpen(data: OpenRequest): void {
    ++loadRequest
    openRequest.value = data
    context.value = undefined
    serials.value = []
    loadError.value = ''
    Object.assign(form.value, {
      referenceNo: `XMD-${dayjs().format('YYYYMMDD')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      quantity: 1,
      targetProjectId: '',
      targetConstructionNo: '',
      serialIds: [],
      remark: ''
    })
    void dialogRef.value?.handleOpen(data, {
      title: '办理项目调拨',
      subtitle: '调整库存所属项目，保留来源批次和调拨记录',
      loading: true,
      loadingText: '正在加载调拨信息…',
      confirmDisabled: true,
      onConfirm: submit,
      onOpen: loadDetails,
      onClose: () => {
        ++loadRequest
        return true
      }
    })
  }
  defineExpose({ handleOpen })
</script>
