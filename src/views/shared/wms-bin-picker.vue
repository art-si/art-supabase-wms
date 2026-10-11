<template>
  <div class="flex w-full min-w-0 flex-col gap-2 sm:flex-row">
    <ElSelect
      :model-value="modelValue"
      :aria-label="label"
      class="min-w-0 flex-1"
      filterable
      clearable
      :disabled="!enabled || disabled || recommending"
      :placeholder="enabled ? `选择${label}` : '仓库直存'"
      @update:model-value="emit('update:modelValue', $event || null)"
    >
      <ElOption
        v-for="bin in availableBins"
        :key="bin.id"
        :label="`${bin.binCode} · ${bin.binName}`"
        :value="bin.id"
      />
    </ElSelect>
    <ElButton
      :loading="recommending"
      :disabled="!enabled || disabled || !warehouseId || !materialId || !quantity || quantity <= 0"
      @click="recommend"
    >
      <ArtSvgIcon icon="ri:magic-line" />自动选位
    </ElButton>
  </div>
</template>

<script setup lang="ts">
  import { ElMessage } from 'element-plus'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { fetchWmsBins, recommendWmsBin, type WmsBin } from '@wms/api'

  interface Props {
    modelValue?: string | null
    bins: WmsBin[]
    warehouseId?: string | null
    materialId?: string | null
    quantity?: number | null
    areaSqm?: number | null
    enabled: boolean
    serialManaged?: boolean
    disabled?: boolean
    label?: string
  }
  const props = withDefaults(defineProps<Props>(), {
    label: '入库库位',
    modelValue: null,
    warehouseId: null,
    materialId: null,
    quantity: null,
    areaSqm: null,
    serialManaged: false,
    disabled: false
  })
  const emit = defineEmits<{
    'update:modelValue': [value: string | null]
    'bins-loaded': [rows: WmsBin[]]
  }>()
  const recommending = ref(false)
  let contextRevision = 0
  watch(
    () => [
      props.warehouseId,
      props.materialId,
      props.quantity,
      props.areaSqm ?? null,
      props.serialManaged,
      props.enabled,
      props.disabled
    ],
    () => {
      contextRevision++
      recommending.value = false
    },
    { flush: 'sync' }
  )
  let active = true
  onBeforeUnmount(() => {
    active = false
  })
  const availableBins = computed(() =>
    props.bins.filter(
      (row) => row.status === 'available' && (!props.serialManaged || row.supportsSerial)
    )
  )
  async function recommend(): Promise<void> {
    if (recommending.value) return
    const revision = contextRevision
    const { warehouseId, materialId, quantity, areaSqm, serialManaged } = props
    const stillCurrent = () =>
      active &&
      revision === contextRevision &&
      props.enabled &&
      !props.disabled &&
      props.warehouseId === warehouseId &&
      props.materialId === materialId &&
      props.quantity === quantity &&
      props.serialManaged === serialManaged &&
      (props.areaSqm ?? null) === (areaSqm ?? null)
    if (!warehouseId || !materialId || !quantity || quantity <= 0 || !props.enabled) {
      ElMessage.warning('请先选择启用库位的仓库、入库物料并填写数量')
      return
    }
    recommending.value = true
    try {
      const binId = await recommendWmsBin({ warehouseId, materialId, quantity, areaSqm })
      if (!stillCurrent()) return
      if (!binId) {
        ElMessage.warning('当前没有符合物料、容量和库区规则的可用库位，请调整数量或联系仓管')
        return
      }
      let bins = props.bins
      if (!bins.some((row) => row.id === binId)) {
        bins = await fetchWmsBins(warehouseId)
        if (!stillCurrent()) return
        emit('bins-loaded', bins)
      }
      const bin = bins.find((row) => row.id === binId)
      if (!bin || bin.warehouseId !== warehouseId) throw new Error('推荐库位不在当前仓库')
      if (bin.status !== 'available' || (serialManaged && !bin.supportsSerial)) {
        ElMessage.warning('推荐库位不可用或不支持当前物料，请手动选择可用库位')
        return
      }
      emit('update:modelValue', binId)
      ElMessage.success(`已选库位 ${bin.binCode}，记账时将再次校验容量与状态`)
    } catch (error) {
      if (stillCurrent()) notifyFriendlyError(error, '自动选位失败，请重试或手动选择库位')
    } finally {
      if (revision === contextRevision) recommending.value = false
    }
  }
</script>
