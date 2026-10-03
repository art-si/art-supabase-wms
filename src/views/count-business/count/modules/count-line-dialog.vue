<template>
  <ArtDialog ref="dialogRef" size="md">
    <div class="space-y-4">
      <ArtEntitySummary
        icon="ri:checkbox-multiple-line"
        eyebrow="PHYSICAL COUNT"
        title="录入实盘"
        :description="`${line?.material?.materialName || '物料'} · ${line?.batch?.batchNo || ''}`"
      />
      <ElAlert type="info" :closable="false" show-icon>
        期初
        {{
          line?.expectedQuantity ?? '—'
        }}；实盘结果保存后仍可复核，确认整张盘点表后才生成盘盈盘亏单和库存流水。
      </ElAlert>
      <ElAlert v-if="loadError" type="error" :closable="false" show-icon>
        SN 清单加载失败或已变化，请重新生成盘点方案。
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
        <template #newSerialText>
          <ElInput
            v-model="newSerialText"
            type="textarea"
            :rows="4"
            placeholder="实物中多出的新 SN，每行一个"
          />
        </template>
      </ArtForm>
      <p v-if="isSerial" class="text-xs text-[var(--el-text-color-secondary)]">
        SN 实盘件数 = 已选择原 SN {{ form.countedSerialIds.length }} 件 + 新增
        {{ newSerialNos.length }} 件。
      </p>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { ElMessage } from 'element-plus'
  import { uniq } from 'lodash-es'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import {
    fetchWmsBatchSerials,
    recordWmsCountLine,
    type WmsBatchSerial,
    type WmsCountLine
  } from '@wms/api'

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<WmsCountLine>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const line = shallowRef<WmsCountLine>()
  const isSerial = computed(
    () =>
      Boolean(line.value?.material?.serialManagementEnabled) ||
      Boolean(line.value?.expectedSerialIds.length)
  )
  const serials = ref<WmsBatchSerial[]>([])
  const loadError = ref(false)
  const newSerialText = ref('')
  const form = reactive({ countedQuantity: 0, countedSerialIds: [] as string[] })
  const newSerialNos = computed(() =>
    newSerialText.value
      .split(/[\r\n,，]+/)
      .map((value) => value.trim())
      .filter(Boolean)
  )
  watch([() => form.countedSerialIds, newSerialNos], () => {
    if (isSerial.value)
      form.countedQuantity = form.countedSerialIds.length + newSerialNos.value.length
  })
  const items = computed<FormItem[]>(() => [
    {
      key: 'countedQuantity',
      label: '实盘数量',
      type: 'number',
      props: {
        min: 0,
        max: 999999999999,
        precision: isSerial.value ? 0 : 3,
        disabled: isSerial.value,
        style: { width: '100%' }
      }
    },
    ...(isSerial.value
      ? [
          {
            key: 'countedSerialIds',
            label: '实盘见到的原 SN',
            type: 'select' as const,
            options: serials.value.map((row) => ({ label: row.serialNo, value: row.id })),
            props: {
              multiple: true,
              filterable: true,
              collapseTags: true,
              placeholder: '逐件勾选实际见到的原 SN'
            },
            help: '未勾选的原 SN 将记为盘亏。'
          },
          {
            key: 'newSerialText',
            label: '实盘多出的新 SN',
            type: 'input' as const,
            help: '每行一个；新增 SN 将记为盘盈。'
          }
        ]
      : [])
  ])
  const rules = {
    countedQuantity: [
      {
        required: true,
        type: 'number' as const,
        min: 0,
        message: '请输入实盘数量',
        trigger: 'change'
      }
    ]
  }
  async function submit(): Promise<boolean> {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (!line.value || loadError.value) return false
      if (uniq(newSerialNos.value).length !== newSerialNos.value.length) {
        ElMessage.warning('新增 SN 不能重复')
        return false
      }
      await recordWmsCountLine({
        lineId: line.value.id,
        countedQuantity: form.countedQuantity,
        countedSerialIds: isSerial.value ? form.countedSerialIds : [],
        newSerialNos: isSerial.value ? newSerialNos.value : []
      })
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '盘点明细提交失败，请检查填写内容和网络后重试')
      return false
    }
  }
  async function handleOpen(data: WmsCountLine): Promise<void> {
    line.value = data
    serials.value = []
    loadError.value = false
    form.countedQuantity = data.countedQuantity ?? data.expectedQuantity
    form.countedSerialIds =
      data.countedQuantity === null ? [...data.expectedSerialIds] : [...data.countedSerialIds]
    newSerialText.value = data.newSerialNos.join('\n')
    await dialogRef.value?.handleOpen(data, {
      title: '录入实盘结果',
      subtitle: '一行对应一个库存批次与一个项目施工号',
      onConfirm: submit,
      onOpen: async (_data, api) => {
        if (!isSerial.value) return
        api.setLoading(true)
        try {
          serials.value = await fetchWmsBatchSerials(data.batchId)
          if (serials.value.length !== data.expectedSerialIds.length) loadError.value = true
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
