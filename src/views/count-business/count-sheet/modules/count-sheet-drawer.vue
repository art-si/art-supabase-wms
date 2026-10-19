<template>
  <ArtDrawer
    ref="drawerRef"
    :loading="loading"
    size="88%"
    :show-footer="false"
    show-fullscreen-button
    @close="handleClose"
  >
    <div v-if="sheet" class="min-w-0 space-y-5">
      <ArtEntitySummary
        icon="ri:clipboard-line"
        eyebrow="STOCK COUNT SHEET"
        :title="sheet.documentNo"
        :description="`${sheet.organization?.organizationName || '库存组织'} · ${sheet.warehouse?.warehouseName || '仓库'}`"
      >
        <template #aside>
          <ArtDictDisplay dict-code="wmsCountSheetStatus" :value="sheet.status" display="tag" />
        </template>
      </ArtEntitySummary>

      <ArtSectionCard title="基本信息" subtitle="方案和账存口径由系统带入，盘点表不能手工新增。">
        <ArtDescriptions :data="sheet" :items="descriptionItems" :columns="3" label-width="124px" />
      </ArtSectionCard>

      <ElAlert v-if="sheet.plan?.status === 'draft'" type="info" :closable="false" show-icon>
        盘点方案待审核；审核通过后可录入盘点结果。
      </ElAlert>
      <ElAlert v-else-if="sheet.status === 'submitted'" type="warning" :closable="false" show-icon>
        盘点表已提交，审核前可退回修改；审核将自动生成盘盈盘亏流水。
      </ElAlert>
      <ElAlert v-else-if="sheet.status === 'approved'" type="success" :closable="false" show-icon>
        {{
          sheet.plan?.completionStatus === 'completed'
            ? '盘点表已审核并记账；方案全部完成，盘点冻结已解除。'
            : '本张盘点表已审核并记账；其他盘点表完成后解除冻结。'
        }}
      </ElAlert>

      <ArtSectionCard
        title="库管与盘点人员"
        :subtitle="
          sheet.recountEnabled
            ? '选择执行人员；复盘须由另一位员工完成。'
            : '选择库管和盘点执行人员。'
        "
      >
        <template #actions>
          <ElButton
            v-if="canEditHeader"
            v-auth="'WmsCountSheet:Count'"
            type="primary"
            plain
            :loading="headerSaving"
            @click="saveHeader"
            >保存人员信息</ElButton
          >
        </template>
        <ElAlert v-if="departmentError" type="warning" :closable="false" show-icon class="mb-3">
          库管部门加载失败。<ElButton link type="primary" @click="loadDepartments"
            >重新加载</ElButton
          >
        </ElAlert>
        <ArtForm
          v-if="canEditHeader"
          v-model="headerForm"
          :items="headerItems"
          :span="8"
          :gutter="20"
          label-position="top"
          :show-reset="false"
          :show-submit="false"
        >
          <template #keeperDepartmentId>
            <ElSelect
              v-model="headerForm.keeperDepartmentId"
              filterable
              clearable
              :disabled="departmentError"
              placeholder="选择库管部门"
              class="w-full"
            >
              <ElOption
                v-for="row in departments"
                :key="row.id"
                :value="row.id"
                :label="`${row.organizationName} · ${row.organizationCode}`"
              />
            </ElSelect>
          </template>
          <template #keeperEmployeeId>
            <ArtEmployeeSelect
              v-model="headerForm.keeperEmployeeId"
              v-model:selected-data="selectedKeeper"
              :tenant-id="sheet.tenantId"
              :api-fn="fetchWmsCountEmployeeOptions"
              :display-fields="['organization', 'jobTitle', 'employmentStatus']"
              placeholder="选择仓管员"
            />
          </template>
          <template #counterEmployeeId>
            <ArtEmployeeSelect
              v-model="headerForm.counterEmployeeId"
              v-model:selected-data="selectedCounter"
              :tenant-id="sheet.tenantId"
              :api-fn="fetchWmsCountEmployeeOptions"
              :display-fields="['organization', 'jobTitle', 'employmentStatus']"
              placeholder="选择盘点人"
            />
          </template>
        </ArtForm>
        <ArtDescriptions
          v-else
          :data="sheet"
          :items="staffDescriptionItems"
          :columns="3"
          label-width="100px"
        />
        <div v-if="sheet.recountEnabled && canEditLines" class="mt-3 min-w-0 max-w-sm">
          <span class="mb-1 block text-sm text-[var(--el-text-color-regular)]">本次复盘人</span>
          <ArtEmployeeSelect
            v-model="recheckerEmployeeId"
            v-model:selected-data="selectedRechecker"
            :tenant-id="sheet.tenantId"
            :api-fn="fetchWmsCountEmployeeOptions"
            :display-fields="['organization', 'jobTitle', 'employmentStatus']"
            placeholder="选择与初盘不同的员工"
          />
        </div>
      </ArtSectionCard>

      <div class="grid gap-3 sm:grid-cols-3">
        <div class="rounded-xl bg-[var(--el-fill-color-light)] p-4">
          <small class="text-[var(--el-text-color-secondary)]">应盘明细</small>
          <strong class="mt-1 block text-xl tabular-nums">{{ savedLines.length }}</strong>
        </div>
        <div class="rounded-xl bg-[var(--el-fill-color-light)] p-4">
          <small class="text-[var(--el-text-color-secondary)]">已完成初盘</small>
          <strong class="mt-1 block text-xl tabular-nums"
            >{{ initialCount }} / {{ savedLines.length }}</strong
          >
        </div>
        <div class="rounded-xl bg-[var(--el-fill-color-light)] p-4">
          <small class="text-[var(--el-text-color-secondary)]">{{
            sheet.recountEnabled ? '已完成复盘' : '有差异明细'
          }}</small>
          <strong class="mt-1 block text-xl tabular-nums">{{
            sheet.recountEnabled ? `${recountCount} / ${savedLines.length}` : varianceCount
          }}</strong>
        </div>
      </div>

      <ArtSectionCard
        title="物料明细"
        subtitle="行号按 10 递增；账存、调整和盘盈盘亏由系统计算。"
        :loading="linesLoading"
        :error="linesError ? '盘点明细加载失败，请重试' : null"
        :empty="!linesLoading && !linesError && !lines.length"
        empty-title="暂无盘点明细"
        empty-description="可在方案审核后新增账外物料，或重新生成包含库存的盘点方案。"
        @retry="loadLines"
      >
        <template #actions>
          <ElButton
            v-if="canEditLines"
            v-auth="'WmsCountSheet:AddLine'"
            type="primary"
            plain
            @click="openAddLine"
            >新增账外物料</ElButton
          >
        </template>
        <ElScrollbar v-if="lines.length">
          <ArtTable
            ref="lineTableRef"
            class="wms-editable-line-table"
            :data="lines"
            :columns="lineColumns"
            :pagination="false"
            row-key="id"
            table-layout="fixed"
          >
            <template #material="{ row }">
              <strong
                class="block truncate"
                :title="row.material?.description || row.material?.materialName || ''"
              >
                {{ row.material?.description || row.material?.materialName || '物料' }}
              </strong>
              <small class="block truncate text-[var(--el-text-color-secondary)]">
                {{ row.material?.materialCode || '—' }}
                {{
                  row.material?.specificationModel ? ` · ${row.material.specificationModel}` : ''
                }}
              </small>
            </template>
            <template #batch="{ row }">
              {{ row.batch?.batchNo || (row.manualEntry ? '账外新增' : '—') }}
            </template>
            <template #project="{ row }">
              {{ projectLabel(row.projectId)
              }}{{ row.constructionNo ? ` / ${row.constructionNo}` : '' }}
            </template>
            <template #countedQuantity="{ row }">
              <ElInputNumber
                v-if="canEditLines && hasAuth('WmsCountSheet:Count') && !isSerial(row)"
                v-model="row.countedQuantity"
                :min="0"
                :max="999999999999"
                :precision="3"
                :controls="false"
                class="w-full!"
              />
              <span v-else class="tabular-nums">{{
                savedLine(row.id)?.countedQuantity ?? '待录入'
              }}</span>
            </template>
            <template #recountQuantity="{ row }">
              <ElInputNumber
                v-if="canEditLines && hasAuth('WmsCountSheet:Recount') && !isSerial(row)"
                v-model="row.recountQuantity"
                :min="0"
                :max="999999999999"
                :precision="3"
                :controls="false"
                :disabled="savedLine(row.id)?.countedQuantity == null"
                class="w-full!"
              />
              <span v-else class="tabular-nums">{{
                savedLine(row.id)?.recountQuantity ?? '待录入'
              }}</span>
            </template>
            <template #gain="{ row }">
              <span
                class="tabular-nums"
                :class="varianceFor(row)?.gain ? 'text-[var(--el-color-success)]' : ''"
              >
                {{ varianceFor(row)?.gain ?? '—' }}
              </span>
            </template>
            <template #loss="{ row }">
              <span
                class="tabular-nums"
                :class="varianceFor(row)?.loss ? 'text-[var(--el-color-warning)]' : ''"
              >
                {{ varianceFor(row)?.loss ?? '—' }}
              </span>
            </template>
            <template #serial="{ row }">
              <template v-if="isSerial(row)">
                <ElButton
                  v-auth="canEditLines ? 'WmsCountSheet:Count' : 'WmsCountSheet:View'"
                  link
                  type="primary"
                  @click="openSerial(row, !canEditLines && sheet.recountEnabled)"
                  >{{ canEditLines ? '录入 / 查看 SN' : '查看序列号' }}</ElButton
                >
              </template>
              <span v-else>—</span>
            </template>
            <template #operation="{ row }">
              <BusinessTableRowActions v-if="canEditLines">
                <template v-if="!isSerial(row)">
                  <ElButton
                    v-auth="'WmsCountSheet:Count'"
                    link
                    type="primary"
                    :loading="savingLineId === row.id"
                    @click="saveLine(row, false)"
                    >保存初盘</ElButton
                  >
                  <ElButton
                    v-if="sheet.recountEnabled"
                    v-auth="'WmsCountSheet:Recount'"
                    link
                    type="primary"
                    :loading="savingLineId === row.id"
                    @click="saveLine(row, true)"
                    >保存复盘</ElButton
                  >
                </template>
                <ElButton
                  v-else-if="sheet.recountEnabled"
                  v-auth="'WmsCountSheet:Recount'"
                  link
                  type="primary"
                  @click="openSerial(row, true)"
                  >录入复盘 SN</ElButton
                >
                <ElButton
                  v-if="!row.manualEntry"
                  v-auth="'WmsCountSheet:Adjust'"
                  link
                  type="primary"
                  @click="openAdjustment(row)"
                  >选单调整</ElButton
                >
              </BusinessTableRowActions>
              <span v-else>{{ sheet.status === 'approved' ? '已记账' : '只读' }}</span>
            </template>
          </ArtTable>
        </ElScrollbar>
        <template #empty-action>
          <ElButton
            v-if="canEditLines"
            v-auth="'WmsCountSheet:AddLine'"
            type="primary"
            plain
            @click="openAddLine"
            >新增账外物料</ElButton
          >
        </template>
      </ArtSectionCard>

      <div v-if="sheet.plan?.status === 'counting'" class="flex flex-wrap justify-end gap-2">
        <ElButton
          v-if="sheet.status === 'draft'"
          v-auth="'WmsCountSheet:Submit'"
          type="primary"
          :loading="actionLoading"
          :disabled="linesError || !savedLines.length"
          @click="submitSheet"
          >提交审核</ElButton
        >
        <template v-else-if="sheet.status === 'submitted'">
          <ElButton v-auth="'WmsCountSheet:Return'" :loading="actionLoading" @click="returnSheet">
            退回修改
          </ElButton>
          <ElButton
            v-auth="'WmsCountSheet:Approve'"
            type="primary"
            :loading="actionLoading"
            @click="approveSheet"
            >审核并记账</ElButton
          >
        </template>
      </div>
    </div>
    <CountSheetAddLineDialog ref="addLineRef" @success="handleChanged" />
    <CountSheetSerialDialog ref="serialRef" @success="handleChanged" />
    <CountSheetAdjustmentDialog ref="adjustmentRef" @success="handleChanged" />
  </ArtDrawer>
</template>

<script setup lang="ts">
  import { ElMessage } from 'element-plus'
  import { useAuth } from '@/hooks/core/useAuth'
  import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtTable, { type ArtTableExpose } from '@/components/core/tables/art-table/index.vue'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import type { ColumnOption } from '@/types'
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import {
    approveWmsCountSheet,
    fetchWmsCountDepartments,
    fetchWmsCountEmployeeOptions,
    fetchWmsCountSheet,
    fetchWmsCountSheetLines,
    fetchWmsProjects,
    recordWmsCountSheetLine,
    returnWmsCountSheet,
    submitWmsCountSheet,
    updateWmsCountSheet,
    type WmsCountDepartmentOption,
    type WmsCountLine,
    type WmsCountSheet,
    type WmsProject
  } from '@wms/api'
  import { countLineVariance } from '../../count/count-variance'
  import CountSheetAddLineDialog from './count-sheet-add-line-dialog.vue'
  import CountSheetSerialDialog from './count-sheet-serial-dialog.vue'
  import CountSheetAdjustmentDialog from './count-sheet-adjustment-dialog.vue'

  const emit = defineEmits<{ success: [] }>()
  const { hasAuth } = useAuth()
  const { confirmAction } = useArtFeedback()
  const drawerRef = ref<ArtDrawerExpose<WmsCountSheet>>()
  const addLineRef = ref<InstanceType<typeof CountSheetAddLineDialog>>()
  const serialRef = ref<InstanceType<typeof CountSheetSerialDialog>>()
  const adjustmentRef = ref<InstanceType<typeof CountSheetAdjustmentDialog>>()
  const lineTableRef = ref<ArtTableExpose>()
  const sheet = shallowRef<WmsCountSheet>()
  const savedLines = ref<WmsCountLine[]>([])
  const lines = ref<WmsCountLine[]>([])
  const projects = ref<WmsProject[]>([])
  const departments = ref<WmsCountDepartmentOption[]>([])
  const departmentError = ref(false)
  const loading = ref(false)
  const linesLoading = ref(false)
  const linesError = ref(false)
  const headerSaving = ref(false)
  const actionLoading = ref(false)
  const savingLineId = ref<string>()
  const selectedKeeper = ref<EmployeeIntegrationItem[]>([])
  const selectedCounter = ref<EmployeeIntegrationItem[]>([])
  const selectedRechecker = ref<EmployeeIntegrationItem[]>([])
  const recheckerEmployeeId = ref<string>()
  const headerForm = ref({
    keeperDepartmentId: '',
    keeperEmployeeId: undefined as string | undefined,
    counterEmployeeId: undefined as string | undefined
  })
  let openVersion = 0
  const canEditLines = computed(
    () => sheet.value?.plan?.status === 'counting' && sheet.value.status === 'draft'
  )
  const canEditHeader = computed(() => canEditLines.value && hasAuth('WmsCountSheet:Count'))
  const savedById = computed(() => new Map(savedLines.value.map((row) => [row.id, row])))
  const initialCount = computed(
    () => savedLines.value.filter((row) => row.countedQuantity !== null).length
  )
  const recountCount = computed(
    () => savedLines.value.filter((row) => row.recountQuantity != null).length
  )
  const varianceCount = computed(
    () =>
      savedLines.value.filter((row) => {
        const variance = countLineVariance(row, sheet.value?.recountEnabled)
        return variance && (variance.gain > 0 || variance.loss > 0)
      }).length
  )
  const descriptionItems: ArtDescriptionItem<WmsCountSheet>[] = [
    {
      key: 'organization',
      label: '库存组织',
      value: (row: WmsCountSheet) => row.organization?.organizationName
    },
    {
      key: 'warehouse',
      label: '仓库',
      value: (row: WmsCountSheet) => row.warehouse?.warehouseName
    },
    { key: 'planNo', label: '盘点方案编号', value: (row: WmsCountSheet) => row.plan?.documentNo },
    { key: 'businessDate', label: '业务日期', field: 'businessDate' },
    {
      key: 'backupCondition',
      label: '数据备份条件',
      field: 'backupCondition',
      dictCode: 'wmsCountBackupCondition',
      dictDisplay: 'text'
    },
    { key: 'bookDate', label: '账存日期', field: 'bookDate' },
    {
      key: 'countMethod',
      label: '盘点方式',
      field: 'countMethod',
      dictCode: 'wmsCountMethod',
      dictDisplay: 'text'
    },
    {
      key: 'quantityDefault',
      label: '盘点数量默认值',
      field: 'quantityDefault',
      dictCode: 'wmsCountQuantityDefault',
      dictDisplay: 'text'
    },
    {
      key: 'recountEnabled',
      label: '启用复盘',
      value: (row: WmsCountSheet) => String(row.recountEnabled),
      dictCode: 'commonBoolean',
      dictDisplay: 'text'
    }
  ]
  const staffDescriptionItems: ArtDescriptionItem<WmsCountSheet>[] = [
    {
      key: 'keeperDepartment',
      label: '库管部门',
      value: (row: WmsCountSheet) => row.keeperDepartment?.organizationName
    },
    {
      key: 'keeperEmployee',
      label: '仓管员',
      value: (row: WmsCountSheet) => row.keeperEmployee?.employeeName
    },
    {
      key: 'counterEmployee',
      label: '盘点人',
      value: (row: WmsCountSheet) => row.counterEmployee?.employeeName
    }
  ]
  const headerItems: FormItem[] = [
    { key: 'keeperDepartmentId', label: '库管部门', type: 'text', span: 8 },
    { key: 'keeperEmployeeId', label: '仓管员', type: 'text', span: 8 },
    { key: 'counterEmployeeId', label: '盘点人', type: 'text', span: 8 }
  ]
  const lineColumns = computed<ColumnOption<WmsCountLine>[]>(() => [
    { prop: 'lineNo', label: '行号', width: 70, fixed: 'left' },
    { prop: 'material', label: '物料描述 / 编码', minWidth: 230, fixed: 'left', useSlot: true },
    { prop: 'batch', label: '库存批次', minWidth: 145, useSlot: true },
    { prop: 'project', label: '项目 / 施工号', minWidth: 180, useSlot: true },
    { prop: 'expectedQuantity', label: '账存数量', width: 120, align: 'right' },
    { prop: 'adjustmentQuantity', label: '调整数量', width: 120, align: 'right' },
    {
      prop: 'countedQuantity',
      label: '盘点数量',
      minWidth: 150,
      useSlot: true,
      rules: {
        validator: ({ row, value }: { row: WmsCountLine; value: unknown }) =>
          isSerial(row) || (typeof value === 'number' && value >= 0),
        message: '盘点数量必须是非负数'
      }
    },
    ...(sheet.value?.recountEnabled
      ? [
          {
            prop: 'recountQuantity',
            label: '复盘数量',
            minWidth: 150,
            useSlot: true,
            rules: {
              validator: ({ row, value }: { row: WmsCountLine; value: unknown }) =>
                isSerial(row) || (typeof value === 'number' && value >= 0),
              message: '复盘数量必须是非负数'
            }
          } as ColumnOption<WmsCountLine>
        ]
      : []),
    { prop: 'gain', label: '盘盈数量', width: 110, align: 'right', useSlot: true },
    { prop: 'loss', label: '盘亏数量', width: 110, align: 'right', useSlot: true },
    { prop: 'serial', label: '序列号', minWidth: 150, useSlot: true },
    ...(canEditLines.value
      ? [
          {
            prop: 'operation',
            label: '操作',
            minWidth: 225,
            fixed: 'right' as const,
            useSlot: true
          }
        ]
      : [])
  ])
  function savedLine(id: string): WmsCountLine | undefined {
    return savedById.value.get(id)
  }
  function varianceFor(row: WmsCountLine) {
    const saved = savedLine(row.id)
    return saved ? countLineVariance(saved, sheet.value?.recountEnabled) : null
  }
  function isSerial(row: WmsCountLine): boolean {
    return Boolean(row.material?.serialManagementEnabled || row.expectedSerialIds.length)
  }
  function projectLabel(id: string | null): string {
    if (!id) return '公共库存'
    const project = projects.value.find((row) => row.id === id)
    return project ? `${project.projectName} · ${project.projectCode}` : '历史项目'
  }
  function employeeReference(
    id: string | null,
    employee: { employeeNo: string; employeeName: string } | null | undefined,
    tenantId: string
  ): EmployeeIntegrationItem[] {
    return id && employee
      ? [
          {
            id,
            tenantId,
            employeeNo: employee.employeeNo,
            employeeName: employee.employeeName,
            employmentStatus: ''
          }
        ]
      : []
  }
  async function loadDepartments(): Promise<void> {
    if (!sheet.value) return
    departmentError.value = false
    try {
      departments.value = await fetchWmsCountDepartments(sheet.value.tenantId)
    } catch {
      departmentError.value = true
    }
  }
  async function loadLines(): Promise<void> {
    if (!sheet.value) return
    const version = openVersion
    linesLoading.value = true
    linesError.value = false
    try {
      const rows = await fetchWmsCountSheetLines(sheet.value.id)
      if (version !== openVersion) return
      savedLines.value = rows
      lines.value = rows.map((row) => ({
        ...row,
        countedQuantity:
          row.countedQuantity ??
          (sheet.value?.quantityDefault === 'book' ? row.expectedQuantity : 0),
        recountQuantity:
          row.recountQuantity ??
          (sheet.value?.quantityDefault === 'book' ? row.expectedQuantity : 0)
      }))
    } catch {
      if (version === openVersion) linesError.value = true
    } finally {
      if (version === openVersion) linesLoading.value = false
    }
  }
  async function reloadSheet(): Promise<void> {
    if (!sheet.value) return
    const latest = await fetchWmsCountSheet(sheet.value.id)
    if (!latest) throw new Error('盘点表已不存在，请刷新列表后重试')
    sheet.value = latest
    headerForm.value = {
      keeperDepartmentId: latest.keeperDepartmentId ?? '',
      keeperEmployeeId: latest.keeperEmployeeId ?? undefined,
      counterEmployeeId: latest.counterEmployeeId ?? undefined
    }
    selectedKeeper.value = employeeReference(
      latest.keeperEmployeeId,
      latest.keeperEmployee,
      latest.tenantId
    )
    selectedCounter.value = employeeReference(
      latest.counterEmployeeId,
      latest.counterEmployee,
      latest.tenantId
    )
  }
  async function saveHeader(): Promise<void> {
    if (!sheet.value || !canEditHeader.value || headerSaving.value || departmentError.value) return
    headerSaving.value = true
    try {
      await updateWmsCountSheet({
        sheetId: sheet.value.id,
        keeperDepartmentId: headerForm.value.keeperDepartmentId || null,
        keeperEmployeeId: headerForm.value.keeperEmployeeId || null,
        counterEmployeeId: headerForm.value.counterEmployeeId || null
      })
      await reloadSheet()
      emit('success')
    } catch (error) {
      notifyFriendlyError(error, '人员信息保存失败，请核对员工和部门后重试')
    } finally {
      headerSaving.value = false
    }
  }
  async function saveLine(row: WmsCountLine, recount: boolean): Promise<void> {
    if (!sheet.value || !canEditLines.value || savingLineId.value || isSerial(row)) return
    if (!sheet.value.counterEmployeeId) {
      ElMessage.warning('请先选择盘点人并保存人员信息')
      return
    }
    if (recount && !recheckerEmployeeId.value) {
      ElMessage.warning('请先选择本次复盘人')
      return
    }
    if (recount && savedLine(row.id)?.countedQuantity == null) {
      ElMessage.warning('请先保存初盘结果')
      return
    }
    const result = await lineTableRef.value?.validateField(
      recount ? 'recountQuantity' : 'countedQuantity'
    )
    if (result && !result.valid) {
      ElMessage.warning(result.firstError?.message || '请检查盘点数量')
      return
    }
    const quantity = recount ? row.recountQuantity : row.countedQuantity
    if (quantity == null || !Number.isFinite(quantity)) return
    savingLineId.value = row.id
    try {
      await recordWmsCountSheetLine({
        lineId: row.id,
        quantity,
        serialIds: [],
        newSerialNos: [],
        recount,
        recheckerEmployeeId: recount ? (recheckerEmployeeId.value ?? null) : null
      })
      await loadLines()
      emit('success')
    } catch (error) {
      notifyFriendlyError(error, '盘点数量保存失败，请检查实物数量后重试')
    } finally {
      savingLineId.value = undefined
    }
  }
  function openAddLine(): void {
    if (sheet.value) void addLineRef.value?.handleOpen(sheet.value)
  }
  function openSerial(row: WmsCountLine, recount: boolean): void {
    if (!sheet.value) return
    void serialRef.value?.handleOpen({
      sheet: sheet.value,
      line: savedLine(row.id) ?? row,
      recount,
      recheckerEmployeeId: recheckerEmployeeId.value ?? null
    })
  }
  function openAdjustment(row: WmsCountLine): void {
    if (sheet.value && row.batchId)
      void adjustmentRef.value?.handleOpen({ sheet: sheet.value, line: savedLine(row.id) ?? row })
  }
  async function handleChanged(): Promise<void> {
    await loadLines()
    emit('success')
  }
  async function submitSheet(): Promise<void> {
    if (!sheet.value || actionLoading.value) return
    actionLoading.value = true
    try {
      await submitWmsCountSheet(sheet.value.id)
      await reloadSheet()
      emit('success')
    } catch (error) {
      notifyFriendlyError(error, '提交失败，请确认全部明细和盘点人员已保存')
    } finally {
      actionLoading.value = false
    }
  }
  async function approveSheet(): Promise<void> {
    if (!sheet.value || actionLoading.value) return
    try {
      await confirmAction(
        `审核盘点表 ${sheet.value.documentNo}？差异将立即记账，无法再修改。`,
        '审核盘点表',
        { type: 'warning', confirmButtonText: '审核并记账', cancelButtonText: '返回复核' }
      )
      actionLoading.value = true
      await approveWmsCountSheet(sheet.value.id)
      await reloadSheet()
      await loadLines()
      emit('success')
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, '审核失败，请核对库存、序列号和调整单据后重试')
    } finally {
      actionLoading.value = false
    }
  }
  async function returnSheet(): Promise<void> {
    if (!sheet.value || actionLoading.value) return
    actionLoading.value = true
    try {
      await returnWmsCountSheet(sheet.value.id)
      await reloadSheet()
      emit('success')
    } catch (error) {
      notifyFriendlyError(error, '退回失败，请刷新状态后重试')
    } finally {
      actionLoading.value = false
    }
  }
  async function handleOpen(target: WmsCountSheet): Promise<void> {
    openVersion++
    sheet.value = target
    lines.value = []
    savedLines.value = []
    departments.value = []
    projects.value = []
    linesError.value = false
    departmentError.value = false
    recheckerEmployeeId.value = undefined
    selectedRechecker.value = []
    await drawerRef.value?.handleOpen(target, {
      title: '盘点表',
      subtitle: '实盘、复盘与差异审核',
      onOpen: async (_target, api) => {
        api.setLoading(true)
        try {
          await reloadSheet()
          await Promise.all([
            loadLines(),
            loadDepartments(),
            fetchWmsProjects(sheet.value?.tenantId).then((rows) => (projects.value = rows))
          ])
        } catch (error) {
          notifyFriendlyError(error, '盘点表加载失败，请关闭后重试')
        } finally {
          api.setLoading(false)
        }
      }
    })
  }
  function handleClose(): void {
    openVersion++
    sheet.value = undefined
  }
  onUnmounted(handleClose)
  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  @use '@/assets/styles/core/mixin' as layout;

  .wms-editable-line-table {
    @include layout.fill-editable-table-cells;
  }
</style>
