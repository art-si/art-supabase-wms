<template>
  <ArtDialog ref="dialogRef" size="md">
    <div class="space-y-4">
      <ArtEntitySummary
        icon="ri:inbox-archive-line"
        eyebrow="TRANSFER ARRIVAL"
        title="确认调拨入库"
        :description="`${document?.documentNo || ''} · ${document?.targetWarehouse?.warehouseName || ''}`"
      />
      <ElAlert type="info" :closable="false" show-icon>
        确认后将在
        {{ document?.targetOrganization?.organizationName || '目标组织' }}
        的目标仓库生成新批次，并将 {{ document?.quantity || 0 }} 件在途库存结清。
      </ElAlert>
      <ElAlert v-if="loadError" type="error" :closable="false" show-icon>
        库位加载失败，请关闭后重试。
      </ElAlert>
      <ArtForm
        ref="formRef"
        v-model="form"
        :items="items"
        :rules="rules"
        label-position="top"
        :show-reset="false"
        :show-submit="false"
      />
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import { fetchWmsBins, receiveWmsTransfer, type WmsBin, type WmsTransferDocument } from '@wms/api'

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<WmsTransferDocument>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const document = shallowRef<WmsTransferDocument>()
  const bins = ref<WmsBin[]>([])
  const loadError = ref(false)
  const form = reactive({ targetBinId: '' })
  const items = computed<FormItem[]>(() => [
    {
      key: 'targetBinId',
      label: '目标库位',
      type: 'select',
      options: bins.value
        .filter((row) => row.status === 'enabled')
        .map((row) => ({ label: `${row.binName} · ${row.binCode}`, value: row.id })),
      props: {
        clearable: !document.value?.targetWarehouse?.enableLocations,
        filterable: true,
        placeholder: document.value?.targetWarehouse?.enableLocations
          ? '请选择入库库位'
          : '仓库直存，无需库位'
      },
      help: document.value?.targetWarehouse?.enableLocations
        ? '目标仓库启用库位管理，入库时必须指定库位。'
        : undefined
    }
  ])
  const rules = computed(() => ({
    targetBinId: document.value?.targetWarehouse?.enableLocations
      ? [{ required: true, message: '请选择目标库位', trigger: 'change' }]
      : []
  }))
  async function submit(): Promise<boolean> {
    try {
      await formRef.value?.validate()
      if (!document.value || loadError.value) return false
      await receiveWmsTransfer(document.value.id, form.targetBinId || null)
      emit('success')
      return true
    } catch {
      return false
    }
  }
  async function handleOpen(row: WmsTransferDocument): Promise<void> {
    document.value = row
    bins.value = []
    form.targetBinId = ''
    loadError.value = false
    await dialogRef.value?.handleOpen(row, {
      title: '确认调拨入库',
      subtitle: '在途库存将在确认后转入目标仓库',
      onConfirm: submit,
      onOpen: async (_row, api) => {
        if (!row.targetWarehouse?.enableLocations) return
        api.setLoading(true)
        try {
          bins.value = await fetchWmsBins(row.targetWarehouseId)
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
