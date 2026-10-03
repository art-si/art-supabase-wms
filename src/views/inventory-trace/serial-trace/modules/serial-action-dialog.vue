<template>
  <ArtDialog ref="dialogRef" size="md">
    <div class="space-y-4">
      <ArtEntitySummary
        icon="ri:qr-scan-2-line"
        eyebrow="SERIAL CONTROL"
        :title="context?.action === 'bind' ? '装配 SN 绑定' : '工单 SN 预留'"
        :description="context?.serial.serialNo || ''"
      />
      <ElAlert
        v-if="loadError"
        type="error"
        :closable="false"
        show-icon
        title="候选记录加载失败"
        description="请关闭后重试，当前操作不会提交。"
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
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
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
  const loadError = ref(false)
  const orders = ref<WmsSerialReservationOrder[]>([])
  const children = ref<WmsAssemblyChildCandidate[]>([])
  const form = reactive({ workOrderId: '', childSerialIds: [] as string[] })
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
            props: { filterable: true, placeholder: '选择已预留该批次的工单' }
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
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      const data = context.value
      if (!data || loadError.value) return false
      if (data.action === 'reserve') {
        if (!orders.value.some((row) => row.workOrderId === form.workOrderId)) {
          ElMessage.warning('所选工单没有该批次的有效预留')
          return false
        }
        await reserveWmsSerial(form.workOrderId, data.serial.id)
      } else {
        if (!data.serial.workOrderId || form.childSerialIds.length === 0) return false
        await bindWmsAssemblySerials(data.serial.id, form.childSerialIds)
      }
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '序列号操作提交失败，请检查填写内容和网络后重试')
      return false
    }
  }

  async function handleOpen(data: Context): Promise<void> {
    context.value = data
    form.workOrderId = ''
    form.childSerialIds = []
    orders.value = []
    children.value = []
    loadError.value = false
    await dialogRef.value?.handleOpen(data, {
      title: data.action === 'bind' ? '绑定装配子件' : '预留关键件 SN',
      subtitle: '所有变更保留工单与序列号追溯关系',
      onConfirm: submit,
      onOpen: async (_openData, api) => {
        api.setLoading(true)
        try {
          if (data.action === 'reserve' && data.serial.batchId) {
            orders.value = await fetchWmsSerialReservationOrders(data.serial.batchId)
          } else if (data.action === 'bind' && data.serial.workOrderId) {
            children.value = await fetchWmsAssemblyChildCandidates(data.serial.workOrderId)
          }
        } catch {
          loadError.value = true
        } finally {
          api.setLoading(false)
        }
      }
    })
  }
  defineExpose({ handleOpen })
</script>
