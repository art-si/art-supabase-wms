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
        的目标仓库生成新批次，并将数量 {{ document?.quantity || 0 }} 的在途库存结清。
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
      >
        <template #targetBinId>
          <WmsBinPicker
            v-model="form.targetBinId"
            :bins="bins"
            :warehouse-id="document?.targetWarehouseId"
            :material-id="document?.materialId"
            :quantity="document?.quantity"
            :area-sqm="document?.areaSqm"
            :enabled="Boolean(document?.targetWarehouse?.enableLocations)"
            :serial-managed="Boolean(document?.serialIds.length)"
            :disabled="loadError"
            label="目标库位"
            @bins-loaded="bins = $event"
          />
        </template>
      </ArtForm>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import WmsBinPicker from '@wms/views/shared/wms-bin-picker.vue'
  import { fetchWmsBins, receiveWmsTransfer, type WmsBin, type WmsTransferDocument } from '@wms/api'

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<WmsTransferDocument>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const document = shallowRef<WmsTransferDocument>()
  const bins = ref<WmsBin[]>([])
  const loadError = ref(false)
  const form = reactive<{ targetBinId: string | null }>({ targetBinId: null })
  const items = computed<FormItem[]>(() => [
    {
      key: 'targetBinId',
      label: '目标库位',
      type: 'slot',
      help: document.value?.targetWarehouse?.enableLocations
        ? '自动推荐会校验容量与物料规则；也可手动选择，记账时再次复核。'
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
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (!document.value || loadError.value) return false
      await receiveWmsTransfer(document.value.id, form.targetBinId || null)
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '分步调拨接收提交失败，请检查填写内容和网络后重试')
      return false
    }
  }
  async function handleOpen(row: WmsTransferDocument): Promise<void> {
    document.value = row
    bins.value = []
    form.targetBinId = null
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
