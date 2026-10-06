<template>
  <ArtDialog ref="dialogRef" size="md" @close="handleClose">
    <div class="min-w-0 space-y-4">
      <ArtEntitySummary
        icon="ri:qr-scan-2-line"
        eyebrow="SERIAL CONTROL"
        :title="context?.action === 'bind' ? '装配 SN 绑定' : '工单 SN 预留'"
        :description="context?.serial.serialNo || ''"
      />
      <ArtAsyncState
        v-if="loadError"
        size="compact"
        :error="loadError"
        error-title="候选记录加载失败"
        error-description="请重新加载候选记录后办理，当前操作不会提交。"
        @retry="loadCandidates"
      />
      <ArtForm
        ref="formRef"
        v-model="form"
        :items="items"
        :rules="rules"
        :show-reset="false"
        :show-submit="false"
        label-position="top"
      />
      <ElAlert
        v-if="context?.action === 'reserve'"
        type="info"
        :closable="false"
        show-icon
        title="只能预留已由工单锁定该批次库存的 SN。"
      />
      <ElAlert
        v-else
        type="info"
        :closable="false"
        show-icon
        title="只能绑定同一工单已领用、同一项目施工号的关键件 SN。"
      />
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { cloneDeep, isEqual } from 'lodash-es'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { useDetailRecord } from '@/hooks/core/useDetailRecord'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import { ElMessage } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import {
    bindWmsAssemblySerials,
    fetchWmsAssemblyChildCandidates,
    fetchWmsSerialReservationOrders,
    reserveWmsSerial,
    type WmsAssemblyChildCandidate,
    type WmsSerial,
    type WmsSerialReservationOrder
  } from '@wms/api'

  interface Context {
    action: 'reserve' | 'bind'
    serial: WmsSerial
  }

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<Context>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const context = shallowRef<Context>()
  let contextVersion = 0
  const {
    detail: candidates,
    loading,
    loadError,
    loadDetail,
    openDetail
  } = useDetailRecord<{
    orders: WmsSerialReservationOrder[]
    children: WmsAssemblyChildCandidate[]
  }>(async () => {
    const data = context.value
    if (!data) throw new Error('操作已关闭，请重新打开')
    if (data.action === 'reserve') {
      if (!data.serial.batchId) throw new Error('序列号缺少库存批次，请检查档案后重试')
      return {
        data: { orders: await fetchWmsSerialReservationOrders(data.serial.batchId), children: [] }
      }
    }
    if (!data.serial.workOrderId) throw new Error('序列号缺少所属工单，请检查档案后重试')
    return {
      data: { orders: [], children: await fetchWmsAssemblyChildCandidates(data.serial.workOrderId) }
    }
  }, '候选记录加载失败，请重新加载后办理')
  const orders = computed(() => candidates.value?.orders ?? [])
  const children = computed(() => candidates.value?.children ?? [])
  watch([loading, loadError], () => {
    dialogRef.value?.setLoading(loading.value)
    dialogRef.value?.setOptions({ confirmDisabled: loading.value || Boolean(loadError.value) })
  })
  const form = ref({ workOrderId: '', childSerialIds: [] as string[] })
  const items = computed<FormItem[]>(() =>
    context.value?.action === 'reserve'
      ? [
          {
            key: 'workOrderId',
            label: '预留给工单',
            type: 'select',
            span: 24,
            options: orders.value
              .filter((row) => row.workOrder && ['REL', 'PCNF'].includes(row.workOrder.orderStatus))
              .map((row) => ({
                label: `${row.workOrder?.workOrderNo}${row.workOrder?.constructionNo ? ` · ${row.workOrder.constructionNo}` : ''}`,
                value: row.workOrderId
              })),
            props: {
              filterable: true,
              placeholder: '选择已预留该批次的工单',
              'aria-label': '预留给工单'
            }
          }
        ]
      : [
          {
            key: 'childSerialIds',
            label: '已领用的关键件 SN',
            type: 'select',
            span: 24,
            options: children.value.map((row) => ({
              label: `${row.serialNo} · ${row.material?.materialName || row.material?.materialCode || '关键件'}`,
              value: row.id
            })),
            props: {
              'aria-label': '已领用的关键件 SN',
              multiple: true,
              filterable: true,
              collapseTags: true,
              placeholder: '选择同工单的已出库关键件'
            }
          }
        ]
  )
  const rules = {
    workOrderId: [{ required: true, message: '请选择工单', trigger: 'change' }],
    childSerialIds: [
      {
        required: true,
        type: 'array' as const,
        min: 1,
        message: '请选择关键件 SN',
        trigger: 'change'
      }
    ]
  }

  async function submit(): Promise<boolean> {
    const data = context.value
    if (!data || loading.value || loadError.value) return false
    const version = contextVersion
    const selection = cloneDeep(form.value)
    const serial = cloneDeep(data.serial)
    const isCurrent = () => contextVersion === version && context.value === data
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (!isCurrent() || loading.value || loadError.value) return false
      if (!isEqual(selection, form.value) || !isEqual(serial, data.serial)) {
        ElMessage.warning('操作内容已变化，请检查后重新提交')
        return false
      }
      if (data.action === 'reserve') {
        if (
          !orders.value.some(
            (row) =>
              row.workOrderId === selection.workOrderId &&
              row.workOrder &&
              ['REL', 'PCNF'].includes(row.workOrder.orderStatus)
          )
        ) {
          ElMessage.warning('所选工单没有该批次的有效预留')
          return false
        }
        await reserveWmsSerial(selection.workOrderId, serial.id)
      } else {
        if (!serial.workOrderId || selection.childSerialIds.length === 0) return false
        if (
          !selection.childSerialIds.every(
            (id) => id !== serial.id && children.value.some((row) => row.id === id)
          )
        ) {
          ElMessage.warning('所选关键件已不在可绑定候选中，请重新选择')
          return false
        }
        await bindWmsAssemblySerials(serial.id, selection.childSerialIds)
      }
      emit('success')
      return isCurrent() && isEqual(selection, form.value)
    } catch (error) {
      if (isCurrent()) notifyFriendlyError(error, '序列号操作提交失败，请检查填写内容和网络后重试')
      return false
    }
  }

  async function handleOpen(data: Context): Promise<void> {
    contextVersion += 1
    context.value = data
    form.value.workOrderId = ''
    form.value.childSerialIds = []
    openDetail('')
    await dialogRef.value?.handleOpen(data, {
      title: data.action === 'bind' ? '绑定装配子件' : '预留关键件 SN',
      subtitle: '所有变更保留工单与序列号追溯关系',
      onConfirm: submit,
      onOpen: loadCandidates
    })
  }
  async function loadCandidates(): Promise<void> {
    const data = context.value
    if (!data) return
    await loadDetail(`${data.action}:${data.serial.id}`)
  }
  function handleClose(): void {
    contextVersion += 1
    context.value = undefined
    openDetail('')
  }
  onUnmounted(handleClose)
  defineExpose({ handleOpen })
</script>
