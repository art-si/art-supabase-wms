<template>
  <ArtDialog ref="dialogRef" size="lg" :show-footer="editable">
    <div class="min-w-0 space-y-4">
      <ArtEntitySummary
        icon="ri:qr-code-line"
        eyebrow="SERIAL COUNT"
        :title="editable ? (recount ? '录入复盘序列号' : '录入盘点序列号') : '序列号记录'"
        :description="`${line?.material?.description || line?.material?.materialName || '物料'} · ${line?.material?.materialCode || ''}`"
      />
      <ElAlert v-if="loadError" type="error" :closable="false" show-icon>
        序列号资料加载失败，请重新加载后核对。
        <ElButton link type="primary" @click="loadOptions">重新加载</ElButton>
      </ElAlert>
      <ArtDescriptions v-if="line" :data="line" :items="descriptionItems" :columns="3" />
      <div v-if="editable" class="flex justify-end">
        <ArtExcelImport
          v-auth="'WmsCountSheet:ImportSerial'"
          icon="ri:file-upload-line"
          :context-key="`${line?.id || ''}:${recount}`"
          :button-props="{ type: 'primary', plain: true }"
          @import-success="importSerials"
          @import-error="notifyFriendlyError($event, '序列号文件读取失败，请检查 Excel 格式后重试')"
          >导入序列号</ArtExcelImport
        >
      </div>
      <ArtForm
        v-if="editable"
        ref="formRef"
        v-model="form"
        :items="items"
        :span="12"
        :gutter="20"
        label-position="top"
        :show-reset="false"
        :show-submit="false"
      >
        <template #newSerialText>
          <ElInput
            v-model="form.newSerialText"
            type="textarea"
            :rows="5"
            placeholder="每行一个实物中新增的 SN"
          />
        </template>
      </ArtForm>
      <ArtSectionCard
        v-else
        title="初盘序列号"
        :empty="!initialSerialNumbers.length"
        empty-title="初盘未录入序列号"
        empty-description="请核对盘点表初盘记录。"
      >
        <ElScrollbar max-height="260px">
          <ul class="grid gap-2 sm:grid-cols-2">
            <li
              v-for="serial in initialSerialNumbers"
              :key="serial.key"
              class="rounded-lg bg-[var(--el-fill-color-light)] px-3 py-2 font-mono text-sm"
              >{{ serial.label }}</li
            >
          </ul>
        </ElScrollbar>
      </ArtSectionCard>
      <ArtSectionCard
        v-if="!editable && sheet?.recountEnabled"
        title="复盘序列号"
        :empty="!recountSerialNumbers.length"
        empty-title="复盘未录入序列号"
        empty-description="请核对盘点表复盘记录。"
      >
        <ElScrollbar max-height="260px">
          <ul class="grid gap-2 sm:grid-cols-2">
            <li
              v-for="serial in recountSerialNumbers"
              :key="serial.key"
              class="rounded-lg bg-[var(--el-fill-color-light)] px-3 py-2 font-mono text-sm"
              >{{ serial.label }}</li
            >
          </ul>
        </ElScrollbar>
      </ArtSectionCard>
      <p v-if="editable" class="text-sm text-[var(--el-text-color-secondary)]">
        实盘件数：原 SN {{ form.serialIds.length }} 件 + 新增 SN {{ newSerialNos.length }} 件 =
        <strong class="tabular-nums text-[var(--el-text-color-primary)]">{{ quantity }}</strong>
        件。
      </p>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { uniq } from 'lodash-es'
  import { ElMessage } from 'element-plus'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { useAuth } from '@/hooks/core/useAuth'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtExcelImport from '@/components/core/forms/art-excel-import/index.vue'
  import {
    fetchWmsCountSerialOptions,
    recordWmsCountSheetLine,
    type WmsCountLine,
    type WmsCountSerialOption,
    type WmsCountSheet
  } from '@wms/api'

  interface Context {
    sheet: WmsCountSheet
    line: WmsCountLine
    recount: boolean
    recheckerEmployeeId: string | null
  }

  const emit = defineEmits<{ success: [] }>()
  const { hasAuth } = useAuth()
  const dialogRef = ref<ArtDialogExpose<Context>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const context = shallowRef<Context>()
  const options = ref<WmsCountSerialOption[]>([])
  const loadError = ref(false)
  const form = ref({ serialIds: [] as string[], newSerialText: '' })
  const sheet = computed(() => context.value?.sheet)
  const line = computed(() => context.value?.line)
  const recount = computed(() => Boolean(context.value?.recount))
  const editable = computed(
    () =>
      sheet.value?.status === 'draft' &&
      sheet.value?.plan?.status === 'counting' &&
      hasAuth(recount.value ? 'WmsCountSheet:Recount' : 'WmsCountSheet:Count')
  )
  const newSerialNos = computed(() =>
    form.value.newSerialText
      .split(/[\r\n,，]+/)
      .map((value) => value.trim())
      .filter(Boolean)
  )
  const quantity = computed(() => form.value.serialIds.length + newSerialNos.value.length)
  function serialEntries(ids: string[], newNos: string[]) {
    return [
      ...ids.map((id) => ({
        key: id,
        label: options.value.find((row) => row.id === id)?.serialNo || '序列号资料不可用'
      })),
      ...newNos.map((serial, index) => ({ key: `new-${index}-${serial}`, label: serial }))
    ]
  }
  const initialSerialNumbers = computed(() =>
    serialEntries(line.value?.countedSerialIds ?? [], line.value?.newSerialNos ?? [])
  )
  const recountSerialNumbers = computed(() =>
    serialEntries(line.value?.recountSerialIds ?? [], line.value?.recountNewSerialNos ?? [])
  )
  const descriptionItems: ArtDescriptionItem<WmsCountLine>[] = [
    { key: 'lineNo', label: '行号', field: 'lineNo' },
    { key: 'expectedQuantity', label: '账存数量', field: 'expectedQuantity' },
    { key: 'adjustmentQuantity', label: '调整数量', field: 'adjustmentQuantity' }
  ]
  const items = computed<FormItem[]>(() => [
    {
      key: 'serialIds',
      label: '实物中找到的原 SN',
      type: 'select',
      span: 24,
      options: options.value.map((row) => ({
        label: `${row.serialNo}${row.status === 'in_stock' ? '' : ' · 历史 SN'}`,
        value: row.id
      })),
      props: {
        multiple: true,
        filterable: true,
        collapseTags: true,
        collapseTagsTooltip: true,
        placeholder: '逐件选择实物中找到的原 SN'
      }
    },
    { key: 'newSerialText', label: '实物中新增的 SN', type: 'text', span: 24 }
  ])
  async function loadOptions(): Promise<void> {
    if (!line.value) return
    loadError.value = false
    try {
      options.value = await fetchWmsCountSerialOptions(line.value)
      if (form.value.serialIds.some((id) => !options.value.some((row) => row.id === id)))
        loadError.value = true
    } catch {
      loadError.value = true
    }
  }
  function importSerials(rows: Array<Record<string, unknown>>): void {
    const values = rows
      .map((row) => {
        const key = Object.keys(row).find((name) =>
          ['序列号', 'sn', 'serialno', 'serial_no'].includes(name.trim().toLowerCase())
        )
        return key ? String(row[key] ?? '').trim() : ''
      })
      .filter(Boolean)
    if (!values.length) {
      ElMessage.warning('Excel 需包含“序列号”列和至少一条 SN')
      return
    }
    const selected = new Set(form.value.serialIds)
    const added = [...newSerialNos.value]
    for (const serial of values) {
      const existing = options.value.find((item) => item.serialNo === serial)
      if (existing) selected.add(existing.id)
      else added.push(serial)
    }
    form.value.serialIds = [...selected]
    form.value.newSerialText = uniq(added).join('\n')
    ElMessage.success(`已导入 ${values.length} 条序列号，请核对后保存`)
  }
  async function submit(): Promise<boolean> {
    if (!context.value || loadError.value) return false
    if (recount.value && !context.value.recheckerEmployeeId) {
      ElMessage.warning('请先选择复盘人')
      return false
    }
    if (!recount.value && !sheet.value?.counterEmployeeId) {
      ElMessage.warning('请先保存盘点人')
      return false
    }
    if (uniq(newSerialNos.value).length !== newSerialNos.value.length) {
      ElMessage.warning('新增 SN 不能重复')
      return false
    }
    try {
      await recordWmsCountSheetLine({
        lineId: context.value.line.id,
        quantity: quantity.value,
        serialIds: form.value.serialIds,
        newSerialNos: newSerialNos.value,
        recount: recount.value,
        recheckerEmployeeId: recount.value ? context.value.recheckerEmployeeId : null
      })
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '序列号保存失败，请核对 SN 与实盘件数后重试')
      return false
    }
  }
  async function handleOpen(data: Context): Promise<void> {
    context.value = data
    options.value = []
    loadError.value = false
    form.value = {
      serialIds: [
        ...(data.recount ? (data.line.recountSerialIds ?? []) : data.line.countedSerialIds)
      ],
      newSerialText: (data.recount
        ? (data.line.recountNewSerialNos ?? [])
        : data.line.newSerialNos
      ).join('\n')
    }
    await dialogRef.value?.handleOpen(data, {
      title: editable.value ? (data.recount ? '复盘序列号' : '盘点序列号') : '序列号记录',
      subtitle: editable.value ? '逐件录入、导入与查看' : '核对初盘与复盘的逐件记录',
      showFooter: editable.value,
      onConfirm: submit,
      onOpen: async (_data, api) => {
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
