<template>
  <ArtDrawer
    ref="drawerRef"
    :size="isMobile ? '100%' : 'xl'"
    :confirm-disabled="!headerControlsReady || loadError || importing || parsing"
    show-fullscreen-button
  >
    <ArtEmptyState
      v-if="loadError"
      title="调拨单资料加载失败"
      :description="loadErrorMessage || '请检查网络和当前单据的查看权限后重试。'"
      size="compact"
    >
      <ElButton type="primary" @click="reload">重新加载</ElButton>
    </ArtEmptyState>
    <div v-else class="min-w-0 space-y-4">
      <ElAlert v-if="context?.importIntent" type="info" :closable="false" show-icon>
        请导入“物料编码、批次号、数量”三列。批次必须唯一匹配即时库存，调入仓位请在明细中核对。
      </ElAlert>
      <ArtEntitySummary
        :icon="isStep ? 'ri:truck-line' : 'ri:swap-box-line'"
        :eyebrow="isReceipt ? 'TRANSFER RECEIPT' : isStep ? 'TWO STEP TRANSFER' : 'DIRECT TRANSFER'"
        :title="form.documentNo || (isStep ? '新增分步调拨单' : '新增直接调拨单')"
        :description="
          isReceipt
            ? '暂存 → 提交 → 审核收货；审核前不增加目标库存。'
            : isStep
              ? '暂存 → 提交 → 审核调出 → 在途 → 收货或退回'
              : '暂存 → 提交 → 审核记账 → 可按原行退回'
        "
      />
      <ArtSectionCard
        title="单据表头"
        subtitle="编号由系统按月生成三位流水；调出和调入组织均必填。"
      >
        <ArtDescriptions
          v-if="readonly"
          :data="headerViewData"
          :items="headerViewItems"
          :columns="2"
          :label-width="120"
          border
        />
        <ArtForm
          v-else
          ref="headerFormRef"
          v-model="form"
          :items="headerItems"
          :rules="headerRules"
          :span="12"
          :gutter="20"
          label-position="top"
          :show-reset="false"
          :show-submit="false"
        >
          <template #sourceKeeperId>
            <ArtEmployeeSelect
              :model-value="form.sourceKeeperId || undefined"
              @update:model-value="form.sourceKeeperId = $event || null"
              :tenant-id="context?.tenantId"
              :disabled="readonly || isReceipt"
              placeholder="选择调出仓管员"
            />
          </template>
          <template #targetKeeperId>
            <ArtEmployeeSelect
              :model-value="form.targetKeeperId || undefined"
              @update:model-value="form.targetKeeperId = $event || null"
              :tenant-id="context?.tenantId"
              :disabled="readonly || isReceipt"
              placeholder="选择调入仓管员"
            />
          </template>
        </ArtForm>
        <div v-if="!readonly && !isReceipt" class="mt-2 flex flex-wrap items-center gap-2">
          <ElInput
            v-model="scanText"
            class="max-w-sm"
            clearable
            placeholder="扫码枪回车或输入物料编码"
            aria-label="PDA 扫码录入"
            @keyup.enter="scanStock"
          />
          <ElButton :loading="scanning" @click="scanStock">
            <ArtSvgIcon icon="ri:qr-scan-2-line" />扫码录入
          </ElButton>
          <span class="text-xs text-[var(--el-text-color-secondary)]">
            有多个库存批次时请用“添加物料”选择具体批次。
          </span>
        </div>
      </ArtSectionCard>
      <ArtSectionCard
        title="调拨明细"
        :subtitle="`共 ${lines.length} 行，行号按 10 递增；${isReceipt ? '审核收货时入库' : isStep ? '审核时调出并进入在途' : '审核时才实际记账'}。`"
        :empty="!lines.length"
        empty-title="暂无调拨物料"
        empty-description="从即时库存选择一个或多个批次；来源归属随库存带入。"
      >
        <template #actions>
          <div v-if="!readonly && !isReceipt" class="flex flex-wrap items-center justify-end gap-2">
            <ArtExcelImport
              v-if="!isStep && !isReturn"
              v-auth="'WmsDirectTransfer:Import'"
              icon="ri:file-upload-line"
              :context-key="context"
              :disabled="importing || parsing"
              :button-props="{ type: 'success', plain: true, loading: importing || parsing }"
              @parsing-change="onImportParsing"
              @import-success="importStockLines"
              @import-error="notifyFriendlyError($event, '文件读取失败，请核对 Excel 后重试')"
              >导入明细</ArtExcelImport
            >
            <ElButton v-if="!isReturn" v-auth="'WmsTransfer:Push'" @click="openRequestPicker">
              <ArtSvgIcon icon="ri:file-list-3-line" />选单
            </ElButton>
            <TransferStockPicker
              :tenant-id="context?.tenantId"
              :organization-id="form.sourceOrganizationId"
              :project-id="form.projectId"
              :projects="projects"
              :units="units"
              :model-value="selectedStockIds"
              :selected-data="selectedStocks"
              multiple
              @update:selected-data="onStockSelected"
            >
              <template #trigger="{ open }">
                <ElButton type="primary" @click="open">
                  <ArtSvgIcon icon="ri:add-line" />添加物料
                </ElButton>
              </template>
            </TransferStockPicker>
          </div>
        </template>
        <ArtTable
          v-if="lines.length"
          :data="lines"
          :pagination="false"
          :show-table-header="false"
          row-key="key"
          table-layout="fixed"
          class="transfer-business-lines"
        >
          <ElTableColumn label="行号" width="70" :fixed="isMobile ? false : 'left'">
            <template #default="{ $index }">{{ ($index + 1) * 10 }}</template>
          </ElTableColumn>
          <ElTableColumn
            v-for="column in lineColumns"
            :key="column.key"
            :label="column.label"
            :min-width="column.key === 'targetBinId' && isReceipt ? 190 : column.width"
            :fixed="column.key === 'materialDescription' && !isMobile ? 'left' : false"
            show-overflow-tooltip
          >
            <template #default="{ row }">
              <ElSelect
                v-if="
                  column.key === 'targetBinId' &&
                  isReceipt &&
                  !readonly &&
                  receiptBins[row.targetWarehouseId]?.length
                "
                v-model="row.targetBinId"
                class="w-full"
                clearable
                filterable
                placeholder="选择调入仓位"
                aria-label="调入仓位"
              >
                <ElOption
                  v-for="bin in selectableTargetBins(receiptBins[row.targetWarehouseId] || [], row)"
                  :key="bin.id"
                  :label="`${bin.binCode} · ${bin.binName}`"
                  :value="bin.id"
                />
              </ElSelect>
              <ElCheckbox
                v-else-if="column.key === 'gift'"
                :model-value="Boolean(row.gift)"
                disabled
                aria-label="赠品"
              />
              <span v-else :class="column.numeric ? 'tabular-nums' : ''">{{
                lineCell(row, column.key)
              }}</span>
            </template>
          </ElTableColumn>
          <ElTableColumn
            v-if="!isReceipt"
            label="操作"
            width="112"
            :fixed="isMobile ? false : 'right'"
          >
            <template #default="{ row }">
              <div class="flex items-center gap-1">
                <ElButton link type="primary" @click="openLine(row)">{{
                  readonly ? '查看' : '编辑'
                }}</ElButton>
                <ElButton v-if="!readonly" link type="danger" @click="removeLine(row)"
                  >删除</ElButton
                >
              </div>
            </template>
          </ElTableColumn>
        </ArtTable>
      </ArtSectionCard>
    </div>
  </ArtDrawer>

  <ArtDialog ref="lineDialogRef" size="xl" :confirm-disabled="!lineControlsReady">
    <div class="min-w-0 space-y-4">
      <ArtEntitySummary
        icon="ri:archive-stack-line"
        eyebrow="TRANSFER LINE"
        :title="lineForm.materialDescription || '调拨明细'"
        :description="`${lineForm.materialCode || '未选择物料'} · ${lineForm.batchNo || '无批号'}`"
      />
      <ArtDescriptions
        v-if="readonly"
        :data="lineForm"
        :items="lineViewItems"
        :columns="2"
        :label-width="120"
        border
      />
      <ArtForm
        v-else
        ref="lineFormRef"
        v-model="lineForm"
        :items="lineItems"
        :rules="lineRules"
        :span="12"
        :gutter="20"
        label-position="top"
        :show-reset="false"
        :show-submit="false"
      >
        <template #sourceBatchId>
          <TransferStockPicker
            :tenant-id="context?.tenantId"
            :organization-id="lineForm.sourceOrganizationId"
            :project-id="lineForm.projectId"
            :projects="projects"
            :units="units"
            :model-value="lineForm.sourceBatchId || undefined"
            :selected-data="lineForm.stock ? [lineForm.stock] : []"
            :disabled="readonly || isReturn"
            @update:selected-data="onLineStockSelected"
          />
        </template>
        <template #keeperId>
          <ArtEmployeeSelect
            :model-value="lineForm.keeperId || undefined"
            @update:model-value="lineForm.keeperId = $event || null"
            :tenant-id="context?.tenantId"
            :disabled="readonly"
            placeholder="选择仓管员"
          />
        </template>
      </ArtForm>
    </div>
  </ArtDialog>
  <ArtDialog ref="requestDialogRef" size="xl">
    <ArtEntitySummary
      icon="ri:file-list-3-line"
      eyebrow="TRANSFER REQUEST"
      title="选择调拨申请明细"
      description="输入已审核申请单号，勾选要带入当前调拨单的明细。"
    />
    <ArtTableQuery
      v-if="requestPickerActive"
      ref="requestTableRef"
      class="mt-4"
      :model-value="requestSearch"
      @update:model-value="replaceReactiveModel(requestSearch, $event)"
      :api-fn="fetchSelectableRequests"
      :search-items="requestSearchItems"
      :columns-factory="requestColumnsFactory"
      :search-bar-props="{ span: 6, labelWidth: 82 }"
      :table-props="{
        rowKey: 'lineId',
        tableLayout: 'fixed',
        emptyText: '暂无可选调拨申请明细',
        emptyDescription: '请核对申请单审核状态或调整筛选条件。'
      }"
      @selection-change="onRequestSelection"
    />
  </ArtDialog>
</template>

<script setup lang="ts">
  import { cloneDeep, uniq, uniqBy } from 'lodash-es'
  import dayjs from 'dayjs'
  import { useBreakpoints } from '@vueuse/core'
  import { ElMessage } from 'element-plus'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import { loadAllLinePages } from '@/utils/business/document-detail-list'
  import {
    createTransferStockCandidateLoader,
    readTransferStockImportRows
  } from './transfer-stock-import'
  import { replaceReactiveModel } from '@/utils/form/model'
  import { convertWmsMaterialQuantity } from '@/utils/wms/material-quantity'
  import { WMS_STOCK_TYPE_LABELS } from '@/utils/wms/stock-type'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { fetchEnabledOrganizationTree } from '@/api/system-manage'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtExcelImport from '@/components/core/forms/art-excel-import/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import { fetchEmployeeReferencesByIds } from '@/api/integration/employees'
  import ArtTableQuery, {
    type ArtTableQueryExpose
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type { ColumnOption } from '@/types'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import TransferStockPicker from './transfer-stock-picker.vue'
  import { isWmsBusinessTypeAvailable } from '@/utils/wms/business-type'
  import {
    fetchWmsBins,
    fetchWmsBatchSerials,
    fetchWmsTransferSerialOptions,
    fetchWmsInitialDocumentTypes,
    fetchWmsInitialMenuId,
    fetchWmsInitialOptions,
    fetchWmsInventoryOrganizations,
    fetchWmsProjects,
    fetchWmsTransferStockPage,
    fetchWmsTransferStockByScan,
    fetchWmsUnitOptions,
    fetchWmsWarehouses,
    fetchWmsTransferBusinessDocument,
    fetchWmsTransferRequestPage,
    saveWmsTransferBusinessDocument,
    updateWmsTransferBusinessReceipt,
    type WmsBin,
    type WmsInitializationOption,
    type WmsInventoryOrganization,
    type WmsProject,
    type WmsTransferBusinessInput,
    type WmsTransferBusinessKind,
    type WmsTransferBusinessLineInput,
    type WmsTransferBusinessRow,
    type WmsTransferRequestRow,
    type WmsStockQuery,
    type WmsTransferStockOption,
    type WmsUnitOption,
    type WmsWarehouse
  } from '@wms/api'

  interface OpenData {
    mode: 'create' | 'edit' | 'copy' | 'view'
    kind: 'direct' | 'step' | 'step_receipt'
    tenantId?: string
    documentId?: string
    importIntent?: boolean
  }
  interface HeaderForm extends Omit<WmsTransferBusinessInput, 'lines'> {
    documentNo: string
    status: 'draft' | 'submitted' | 'approved'
    sourceKeeperId?: string | null
    targetKeeperId?: string | null
  }
  interface DraftLine extends WmsTransferBusinessLineInput {
    key: string
    lineNo: number
    materialCode: string
    materialDescription: string
    specificationModel: string
    projectName: string
    projectCode: string
    sourceOrganizationName: string
    targetOrganizationName: string
    sourceWarehouseName: string
    sourceBinName: string
    targetWarehouseName: string
    targetBinName: string
    ownerName: string
    keeperName: string
    unitConversions: Array<{ sourceUnitId: string; sourceFactor: number; baseFactor: number }>
    materialBaseUnitId: string
    returnedQuantity: number
    stock?: WmsTransferStockOption
  }
  type LineColumn = { key: string; label: string; width: number; numeric?: boolean }

  const emit = defineEmits<{ success: [] }>()
  const drawerRef = ref<ArtDrawerExpose<OpenData>>()
  const lineDialogRef = ref<ArtDialogExpose>()
  const headerFormRef = ref<InstanceType<typeof ArtForm>>()
  const lineFormRef = ref<InstanceType<typeof ArtForm>>()
  const headerControlsReady = computed(() => Boolean(headerFormRef.value?.controlsReady))
  const lineControlsReady = computed(() => Boolean(lineFormRef.value?.controlsReady))
  const isMobile = useBreakpoints({ sm: 640 }).smaller('sm')
  const context = shallowRef<OpenData>()
  const loadError = ref(false)
  const loadErrorMessage = ref('')
  let loadGeneration = 0
  const documentTypes = ref<WmsInitializationOption[]>([])
  const businessTypes = ref<WmsInitializationOption[]>([])
  const organizations = ref<WmsInventoryOrganization[]>([])
  const departmentTree = ref<Api.SystemManage.OrganizationListItem[]>([])
  const warehouses = ref<WmsWarehouse[]>([])
  const receiptBins = ref<Record<string, WmsBin[]>>({})
  const projects = ref<WmsProject[]>([])
  const units = ref<WmsUnitOption[]>([])
  const menuId = ref('')
  const lines = ref<DraftLine[]>([])
  const scanText = ref('')
  const scanning = ref(false)
  const mode = computed(() => context.value?.mode || 'create')
  const readonly = computed(() => mode.value === 'view')
  const isStep = computed(
    () => context.value?.kind === 'step' || context.value?.kind === 'step_receipt'
  )
  const isReceipt = computed(() => context.value?.kind === 'step_receipt')
  const isReturn = computed(() => form.value.kind.endsWith('_return'))

  function emptyHeader(kind: WmsTransferBusinessKind = 'direct'): HeaderForm {
    return {
      kind,
      documentNo: '',
      status: 'draft',
      documentTypeId: '',
      businessTypeId: '',
      businessDate: dayjs().format('YYYY-MM-DD'),
      projectId: null,
      sourceOrganizationId: '',
      sourceDepartmentId: null,
      sourceKeeperId: null,
      targetOrganizationId: '',
      targetDepartmentId: null,
      targetKeeperId: null,
      remark: '',
      sourceRequestId: null,
      returnOfDocumentId: null
    }
  }
  const form = ref<HeaderForm>(emptyHeader())
  const loadedDocumentRow = shallowRef<WmsTransferBusinessRow>()
  const keeperNames = ref<Record<string, string>>({})
  function emptyLine(): DraftLine {
    return {
      key: crypto.randomUUID(),
      lineNo: 10,
      materialId: '',
      materialCode: '',
      materialDescription: '',
      specificationModel: '',
      projectId: null,
      projectName: '',
      projectCode: '',
      constructionNo: '',
      inventoryUnitId: '',
      quantity: 1,
      baseUnitId: null,
      baseQuantity: 1,
      batchNo: '',
      sourceBatchId: null,
      sourceOrganizationId: '',
      sourceOrganizationName: '',
      sourceWarehouseId: '',
      sourceWarehouseName: '',
      sourceBinId: null,
      sourceBinName: '',
      targetOrganizationId: '',
      targetOrganizationName: '',
      targetWarehouseId: '',
      targetWarehouseName: '',
      targetBinId: null,
      targetBinName: '',
      ownerType: 'self',
      ownerId: null,
      ownerName: '自有',
      stockType: 'normal',
      stockStatus: 'available',
      keeperId: null,
      keeperName: '',
      auxiliaryUnitId: null,
      auxiliaryQuantity: null,
      auxiliaryUnit2Id: null,
      auxiliaryQuantity2: null,
      productionDate: null,
      expiryDate: null,
      trackingNo: '',
      gift: false,
      sourceDocument: '',
      sourceLineNo: '',
      remark: '',
      serialIds: [],
      returnedQuantity: 0,
      unitConversions: [],
      materialBaseUnitId: ''
    }
  }
  const lineForm = ref<DraftLine>(emptyLine())
  const sourceBins = ref<WmsBin[]>([])
  const targetBins = ref<WmsBin[]>([])
  const serialOptions = ref<Array<{ id: string; serialNo: string }>>([])
  const stockTypeOptions = useDictionaryOptions('wmsCountStockType')
  const initialStockTypeOptions = useDictionaryOptions('wmsInitialStockType')
  const stockTypeDisplayOptions = computed(() =>
    uniqBy(
      [
        ...initialStockTypeOptions,
        ...stockTypeOptions,
        ...Object.entries(WMS_STOCK_TYPE_LABELS).map(([value, label]) => ({ value, label }))
      ],
      'value'
    )
  )
  const stockStatusOptions = useDictionaryOptions('wmsStockStatus')
  const reviewStatusOptions = useDictionaryOptions('commonDocumentReviewStatus')
  const selectedStockIds = computed(() =>
    lines.value
      .filter((row) => !row.sourceRequestLineId)
      .map((row) => row.sourceBatchId)
      .filter((id): id is string => Boolean(id))
  )
  const selectedStocks = computed(() =>
    lines.value
      .filter((row) => !row.sourceRequestLineId)
      .map((row) => row.stock)
      .filter((row): row is WmsTransferStockOption => Boolean(row))
  )
  const requestDialogRef = ref<ArtDialogExpose>()
  const importing = ref(false)
  const parsing = ref(false)
  function onImportParsing(value: boolean): void {
    parsing.value = value
    drawerRef.value?.setOptions({
      confirmDisabled: parsing.value || importing.value || loadError.value
    })
  }
  async function importStockLines(rows: Array<Record<string, unknown>>): Promise<void> {
    if (readonly.value || isStep.value || importing.value || !context.value?.tenantId) return
    if (!rows.length || rows.length > 100) {
      ElMessage.warning('请导入 1 至 100 行调拨明细')
      return
    }
    const tenantId = context.value.tenantId
    const generation = loadGeneration
    importing.value = true
    drawerRef.value?.setOptions({ confirmDisabled: true })
    try {
      const preparedRows = readTransferStockImportRows(rows)
      const imported: DraftLine[] = []
      const usedBatchIds = new Set(lines.value.map((line) => line.sourceBatchId))
      const loadCandidates = createTransferStockCandidateLoader(
        (materialCode: string, batchNo: string) =>
          loadAllLinePages(fetchWmsTransferStockPage, {
            tenantId,
            keyword: materialCode,
            batchNo,
            current: 1,
            size: 500
          })
      )
      for (const row of preparedRows) {
        if (generation !== loadGeneration) return
        const candidates = await loadCandidates(row.materialCode, row.batchNo)
        if (generation !== loadGeneration) return
        const matched = candidates.filter((stock) => {
          const material = stock.material
          const baseUnitId = material?.baseUnitId || ''
          const inventoryUnitId = material?.inventoryUnitId || baseUnitId
          const requestedBaseQuantity = convertWmsMaterialQuantity(
            { baseUnitId, unitConversions: material?.unitConversions || [] },
            row.quantity,
            inventoryUnitId,
            baseUnitId
          )
          return (
            material?.materialCode === row.materialCode &&
            stock.batchNo === row.batchNo &&
            (!form.value.sourceOrganizationId ||
              stock.organizationId === form.value.sourceOrganizationId) &&
            (!form.value.projectId || stock.projectId === form.value.projectId) &&
            requestedBaseQuantity !== null &&
            stock.availableQuantity >= requestedBaseQuantity
          )
        })
        if (matched.length !== 1)
          throw new Error(
            `第 ${row.fileRow} 行匹配到 ${matched.length} 个可用批次，请用“添加物料”指定来源库存`
          )
        const stock = matched[0]
        if (usedBatchIds.has(stock.id))
          throw new Error(`第 ${row.fileRow} 行与表单已有明细使用同一库存批次，请合并数量`)
        usedBatchIds.add(stock.id)
        const line = newLine(stock)
        line.quantity = row.quantity
        line.baseQuantity =
          convertWmsMaterialQuantity(
            { baseUnitId: line.materialBaseUnitId, unitConversions: line.unitConversions },
            row.quantity,
            line.inventoryUnitId,
            line.baseUnitId || line.materialBaseUnitId
          ) ?? 0
        imported.push(line)
      }
      if (generation !== loadGeneration) return
      lines.value.push(...imported)
      syncHeaderProjectFromLines()
      ElMessage.success(`已导入 ${imported.length} 行，请核对调入仓库和仓位后保存`)
    } catch (error) {
      if (generation === loadGeneration)
        notifyFriendlyError(error, '导入失败，请核对库存批次、数量和网络后重试')
    } finally {
      if (generation === loadGeneration) {
        importing.value = false
        drawerRef.value?.setOptions({ confirmDisabled: parsing.value || loadError.value })
      }
    }
  }
  const requestTableRef = ref<ArtTableQueryExpose>()
  const requestPickerActive = ref(false)
  const requestSearch = reactive({
    keyword: '',
    materialCode: '',
    materialDescription: '',
    projectName: ''
  })
  const requestSearchItems: SearchFormItem[] = [
    {
      label: '申请单号',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '申请单号' }
    },
    {
      label: '物料编码',
      key: 'materialCode',
      type: 'input',
      props: { clearable: true, placeholder: '物料编码' }
    },
    {
      label: '物料描述',
      key: 'materialDescription',
      type: 'input',
      props: { clearable: true, placeholder: '物料描述' }
    },
    {
      label: '项目名称',
      key: 'projectName',
      type: 'input',
      props: { clearable: true, placeholder: '项目名称' }
    }
  ]
  const requestColumnsFactory = (): ColumnOption<WmsTransferRequestRow>[] => [
    { type: 'selection', width: 48, fixed: 'left' },
    { prop: 'documentNo', label: '申请单号', minWidth: 165, fixed: 'left' },
    { prop: 'lineNo', label: '行号', width: 76 },
    { prop: 'materialCode', label: '物料编码', minWidth: 125 },
    { prop: 'materialDescription', label: '物料描述', minWidth: 180, showOverflowTooltip: true },
    { prop: 'projectName', label: '项目名称', minWidth: 145 },
    { prop: 'quantity', label: '数量', width: 100, align: 'right' },
    { prop: 'sourceWarehouseName', label: '调出仓库', minWidth: 130 },
    { prop: 'targetWarehouseName', label: '调入仓库', minWidth: 130 }
  ]
  const selectedRequestRows = ref<WmsTransferRequestRow[]>([])
  function fetchSelectableRequests(query: WmsStockQuery) {
    return fetchWmsTransferRequestPage({
      ...query,
      tenantId: context.value?.tenantId,
      status: 'approved',
      unpushedOnly: true
    })
  }
  function onRequestSelection(rows: unknown[]): void {
    selectedRequestRows.value = rows.filter(
      (row): row is WmsTransferRequestRow =>
        typeof row === 'object' &&
        row !== null &&
        'lineId' in row &&
        typeof row.lineId === 'string' &&
        'documentId' in row &&
        typeof row.documentId === 'string'
    )
    requestDialogRef.value?.setOptions({ confirmDisabled: selectedRequestRows.value.length === 0 })
  }
  async function openRequestPicker(): Promise<void> {
    replaceReactiveModel(requestSearch, {
      keyword: '',
      materialCode: '',
      materialDescription: '',
      projectName: ''
    })
    selectedRequestRows.value = []
    requestPickerActive.value = true
    await nextTick()
    requestTableRef.value?.clearSelection()
    await requestDialogRef.value?.handleOpen(undefined, {
      title: '选单',
      confirmText: '带入调拨明细',
      confirmDisabled: true,
      onConfirm: importRequestRows
    })
  }
  async function importRequestRows(): Promise<boolean> {
    const chosen = selectedRequestRows.value
    if (!chosen.length || !context.value?.tenantId) return false
    const ids = new Set(chosen.map((row) => row.documentId))
    if (ids.size !== 1 || (form.value.sourceRequestId && !ids.has(form.value.sourceRequestId))) {
      ElMessage.warning('一张调拨单只能选同一张申请单的明细')
      return false
    }
    try {
      const batchIds = chosen
        .map((row) => row.sourceBatchId)
        .filter((id): id is string => Boolean(id))
      const stocks = batchIds.length
        ? (
            await fetchWmsTransferStockPage({
              tenantId: context.value.tenantId,
              ids: batchIds,
              current: 1,
              size: batchIds.length
            })
          ).data
        : []
      const byId = new Map(stocks.map((stock) => [stock.id, stock]))
      const existing = new Set(lines.value.map((row) => row.sourceRequestLineId))
      const imported = chosen
        .filter((row) => !existing.has(row.lineId))
        .map((row) => {
          const stock = row.sourceBatchId ? byId.get(row.sourceBatchId) : undefined
          const line = stock ? newLine(stock) : emptyLine()
          return {
            ...line,
            sourceRequestLineId: row.lineId,
            sourceBatchId: row.sourceBatchId,
            materialId: row.materialId,
            materialCode: row.materialCode,
            materialDescription: row.materialDescription,
            specificationModel: row.specificationModel || '',
            projectId: row.projectId,
            projectName: row.projectName || '',
            projectCode: row.projectCode || '',
            constructionNo: row.constructionNo || '',
            inventoryUnitId: row.inventoryUnitId,
            quantity: Number(row.quantity),
            baseUnitId: row.baseUnitId,
            baseQuantity: Number(row.baseQuantity),
            batchNo: row.batchNo || '',
            sourceOrganizationId: row.sourceOrganizationId,
            sourceOrganizationName: row.sourceOrganizationName || '',
            sourceWarehouseId: row.sourceWarehouseId,
            sourceWarehouseName: row.sourceWarehouseName,
            sourceBinId: row.sourceBinId,
            sourceBinName: row.sourceBinName || '',
            targetOrganizationId: row.targetOrganizationId,
            targetOrganizationName: row.targetOrganizationName || '',
            targetWarehouseId: row.targetWarehouseId,
            targetWarehouseName: row.targetWarehouseName,
            targetBinId: row.targetBinId,
            targetBinName: row.targetBinName || '',
            ownerType: stock ? line.ownerType : row.ownerType,
            ownerId: stock ? line.ownerId : row.ownerId,
            ownerName: stock ? line.ownerName : row.ownerType === 'self' ? '自有' : '',
            stockType: stock ? line.stockType : row.stockType,
            stockStatus: stock ? line.stockStatus : row.stockStatus,
            keeperId: row.keeperId,
            auxiliaryUnitId: row.auxiliaryUnitId,
            auxiliaryQuantity: row.auxiliaryQuantity,
            auxiliaryUnit2Id: row.auxiliaryUnit2Id,
            auxiliaryQuantity2: row.auxiliaryQuantity2,
            productionDate: stock ? line.productionDate : row.productionDate,
            expiryDate: stock ? line.expiryDate : row.expiryDate,
            trackingNo: stock ? line.trackingNo : row.trackingNo || '',
            gift: row.gift,
            sourceDocument: row.documentNo,
            sourceLineNo: String(row.lineNo),
            remark: row.lineRemark || ''
          }
        })
      if (!imported.length) {
        ElMessage.info('所选明细已在当前表单中')
        return false
      }
      const sourceOrganizationId = imported[0].sourceOrganizationId
      const targetOrganizationId = imported[0].targetOrganizationId
      if (
        [...lines.value, ...imported].some(
          (row) =>
            row.sourceOrganizationId !== sourceOrganizationId ||
            row.targetOrganizationId !== targetOrganizationId
        )
      ) {
        ElMessage.warning('一张调拨单只能包含同一组调出和调入组织的明细')
        return false
      }
      form.value.sourceRequestId = chosen[0].documentId
      form.value.sourceOrganizationId = sourceOrganizationId
      form.value.targetOrganizationId = targetOrganizationId
      form.value.sourceDepartmentId = chosen[0].departmentId
      lines.value.push(...imported)
      syncHeaderProjectFromLines()
      ElMessage.success(`已带入 ${imported.length} 条申请明细`)
      return true
    } catch (error) {
      notifyFriendlyError(error, '申请明细带入失败，请重试')
      return false
    }
  }
  const enabledOrganizations = computed(() =>
    organizations.value.filter((row) => Boolean(row.enabledOn && row.initializationClosedAt))
  )
  const availableBusinessTypes = computed(() =>
    businessTypes.value.filter((row) =>
      isWmsBusinessTypeAvailable(row, form.value.documentTypeId, menuId.value)
    )
  )
  const organizationInternal = computed(
    () =>
      availableBusinessTypes.value
        .find((row) => row.id === form.value.businessTypeId)
        ?.name.includes('组织内') || false
  )
  const headerItems = computed<FormItem[]>(() => {
    const items: FormItem[] = [
      {
        key: 'documentNo',
        label: '单据编号',
        type: 'input',
        props: { disabled: true, placeholder: '保存后按月自动生成' }
      },
      {
        key: 'status',
        label: '单据状态',
        type: 'select',
        options: reviewStatusOptions,
        props: { disabled: true }
      },
      {
        key: 'documentTypeId',
        label: '单据类型',
        type: 'select',
        options: documentTypes.value.map((row) => ({ label: row.name, value: row.id })),
        props: { disabled: readonly.value, filterable: true, onChange: chooseBusinessType }
      },
      {
        key: 'businessTypeId',
        label: '业务类型',
        type: 'select',
        options: availableBusinessTypes.value.map((row) => ({ label: row.name, value: row.id })),
        props: { disabled: readonly.value, filterable: true }
      },
      {
        key: 'businessDate',
        label: '业务日期',
        type: 'date',
        props: { disabled: readonly.value, valueFormat: 'YYYY-MM-DD', class: 'w-full!' }
      },
      {
        key: 'projectId',
        label: '项目名称',
        type: 'select',
        options: projects.value.map((row) => ({
          label: `${row.projectName} · ${row.projectCode}`,
          value: row.id
        })),
        props: {
          disabled: readonly.value || lines.value.length > 0,
          filterable: true,
          clearable: true
        },
        description: '添加物料前可选择项目；选料后项目随来源库存确定。'
      },
      {
        key: 'sourceOrganizationId',
        label: '调出组织',
        type: 'treeSelect',
        options: enabledOrganizations.value,
        valueField: 'id',
        labelField: 'organizationName',
        childrenField: 'children',
        props: {
          disabled: readonly.value || lines.value.length > 0,
          filterable: true,
          checkStrictly: true,
          defaultExpandAll: true,
          renderAfterExpand: false
        }
      },
      {
        key: 'targetOrganizationId',
        label: '调入组织',
        type: 'treeSelect',
        options: enabledOrganizations.value,
        valueField: 'id',
        labelField: 'organizationName',
        childrenField: 'children',
        props: {
          disabled: readonly.value || organizationInternal.value,
          filterable: true,
          checkStrictly: true,
          defaultExpandAll: true,
          renderAfterExpand: false
        }
      },
      {
        key: 'sourceDepartmentId',
        label: '调出部门',
        type: 'treeSelect',
        options: departmentTree.value,
        valueField: 'id',
        labelField: 'organizationName',
        childrenField: 'children',
        props: { disabled: readonly.value, filterable: true, clearable: true, checkStrictly: true }
      },
      {
        key: 'targetDepartmentId',
        label: '调入部门',
        type: 'treeSelect',
        options: departmentTree.value,
        valueField: 'id',
        labelField: 'organizationName',
        childrenField: 'children',
        props: { disabled: readonly.value, filterable: true, clearable: true, checkStrictly: true }
      },
      { key: 'sourceKeeperId', label: '调出仓管员', type: 'slot' },
      { key: 'targetKeeperId', label: '调入仓管员', type: 'slot' },
      {
        key: 'remark',
        label: '备注',
        type: 'input',
        span: 24,
        props: {
          disabled: readonly.value,
          type: 'textarea',
          rows: 2,
          maxlength: 500,
          showWordLimit: true
        }
      }
    ]
    return isReceipt.value
      ? items.map((item) => ({
          ...item,
          props: {
            ...item.props,
            disabled: item.key !== 'businessDate' && item.key !== 'remark'
          }
        }))
      : items
  })
  function departmentName(id: string | null | undefined): string {
    if (!id) return '—'
    const visit = (nodes: Api.SystemManage.OrganizationListItem[]): string | undefined => {
      for (const node of nodes) {
        if (node.id === id) return node.organizationName
        const childName = node.children?.length ? visit(node.children) : undefined
        if (childName) return childName
      }
      return undefined
    }
    return visit(departmentTree.value) || '—'
  }
  const headerViewData = computed(() => ({
    documentNo: form.value.documentNo || '—',
    status: { draft: '暂存', submitted: '已提交', approved: '已审核' }[form.value.status],
    documentType:
      documentTypes.value.find((row) => row.id === form.value.documentTypeId)?.name || '—',
    businessType:
      businessTypes.value.find((row) => row.id === form.value.businessTypeId)?.name || '—',
    businessDate: form.value.businessDate,
    project: projects.value.find((row) => row.id === form.value.projectId)?.projectName || '—',
    sourceOrganization:
      loadedDocumentRow.value?.sourceOrganizationName ||
      organizationName(form.value.sourceOrganizationId),
    targetOrganization:
      loadedDocumentRow.value?.targetOrganizationName ||
      organizationName(form.value.targetOrganizationId),
    sourceDepartment: departmentName(form.value.sourceDepartmentId),
    targetDepartment: departmentName(form.value.targetDepartmentId),
    sourceKeeper: form.value.sourceKeeperId
      ? keeperNames.value[form.value.sourceKeeperId] || '—'
      : '—',
    targetKeeper: form.value.targetKeeperId
      ? keeperNames.value[form.value.targetKeeperId] || '—'
      : '—',
    remark: form.value.remark || '—'
  }))
  const headerViewItems: ArtDescriptionItem<typeof headerViewData.value>[] = [
    { key: 'documentNo', label: '单据编号', field: 'documentNo', copyable: true },
    { key: 'status', label: '单据状态', field: 'status' },
    { key: 'documentType', label: '单据类型', field: 'documentType' },
    { key: 'businessType', label: '业务类型', field: 'businessType' },
    { key: 'businessDate', label: '业务日期', field: 'businessDate' },
    { key: 'project', label: '项目名称', field: 'project' },
    { key: 'sourceOrganization', label: '调出组织', field: 'sourceOrganization' },
    { key: 'targetOrganization', label: '调入组织', field: 'targetOrganization' },
    { key: 'sourceDepartment', label: '调出部门', field: 'sourceDepartment' },
    { key: 'targetDepartment', label: '调入部门', field: 'targetDepartment' },
    { key: 'sourceKeeper', label: '调出仓管员', field: 'sourceKeeper' },
    { key: 'targetKeeper', label: '调入仓管员', field: 'targetKeeper' },
    { key: 'remark', label: '备注', field: 'remark', span: 2 }
  ]
  const headerRules = {
    documentTypeId: [{ required: true, message: '请选择单据类型', trigger: 'change' }],
    businessTypeId: [{ required: true, message: '请选择业务类型', trigger: 'change' }],
    businessDate: [{ required: true, message: '请选择业务日期', trigger: 'change' }],
    sourceOrganizationId: [{ required: true, message: '请选择调出组织', trigger: 'change' }],
    targetOrganizationId: [{ required: true, message: '请选择调入组织', trigger: 'change' }]
  }
  const ownerLabels = { self: '自有', supplier: '供应商', customer: '客户' }
  const statusLabels: Record<string, string> = {
    available: '可用',
    normal: '可用',
    scrap: '报废',
    defective: '不良',
    frozen: '冻结'
  }
  const stockStatusDisplayOptions = computed(() =>
    uniqBy(
      [
        ...stockStatusOptions,
        ...Object.entries(statusLabels).map(([value, label]) => ({ value, label }))
      ],
      'value'
    )
  )
  const lineColumns: LineColumn[] = [
    { key: 'materialDescription', label: '物料描述', width: 220 },
    { key: 'materialCode', label: '物料编码', width: 125 },
    { key: 'specificationModel', label: '规格型号', width: 135 },
    { key: 'projectName', label: '项目名称', width: 150 },
    { key: 'projectCode', label: '项目编码', width: 125 },
    { key: 'constructionNo', label: '施工号', width: 120 },
    { key: 'inventoryUnitId', label: '库存单位', width: 100 },
    { key: 'quantity', label: '数量', width: 110, numeric: true },
    { key: 'baseUnitId', label: '基本单位', width: 100 },
    { key: 'baseQuantity', label: '基本数量', width: 120, numeric: true },
    { key: 'batchNo', label: '批号', width: 125 },
    { key: 'sourceOrganizationId', label: '调出组织', width: 145 },
    { key: 'sourceWarehouseId', label: '调出仓库', width: 145 },
    { key: 'sourceBinId', label: '调出仓位', width: 120 },
    { key: 'targetOrganizationId', label: '调入组织', width: 145 },
    { key: 'targetWarehouseId', label: '调入仓库', width: 145 },
    { key: 'targetBinId', label: '调入仓位', width: 120 },
    { key: 'ownerType', label: '货主类型', width: 100 },
    { key: 'ownerName', label: '货主', width: 140 },
    { key: 'stockType', label: '库存类型', width: 105 },
    { key: 'stockStatus', label: '库存状态', width: 105 },
    { key: 'keeperName', label: '仓管员', width: 115 },
    { key: 'auxiliaryQuantity', label: '辅助数量', width: 110, numeric: true },
    { key: 'auxiliaryUnitId', label: '辅助单位', width: 100 },
    { key: 'auxiliaryQuantity2', label: '辅助数量2', width: 120, numeric: true },
    { key: 'auxiliaryUnit2Id', label: '辅助单位2', width: 110 },
    { key: 'productionDate', label: '生产日期', width: 115 },
    { key: 'expiryDate', label: '有效期至', width: 115 },
    { key: 'trackingNo', label: '跟踪号', width: 135 },
    { key: 'gift', label: '赠品', width: 80 },
    { key: 'sourceDocument', label: '来源单据', width: 135 },
    { key: 'sourceLineNo', label: '源行号', width: 90 },
    { key: 'remark', label: '备注', width: 150 },
    { key: 'returnedQuantity', label: '调出已退回数量', width: 135, numeric: true },
    { key: 'remainingQuantity', label: '调出未退回数量', width: 135, numeric: true }
  ]
  const lineViewItems: ArtDescriptionItem<DraftLine>[] = [
    {
      key: 'sourceBatch',
      label: '来源库存批次',
      value: (row: DraftLine) => row.stock?.batchNo || row.batchNo || '—',
      span: 2
    },
    ...lineColumns.map((column) => ({
      key: column.key,
      label: column.label,
      value: (row: DraftLine) =>
        column.key === 'gift' ? (row.gift ? '是' : '否') : lineCell(row, column.key),
      span: column.key === 'remark' ? 2 : 1
    })),
    {
      key: 'serialIds',
      label: '序列号',
      value: (row: DraftLine) =>
        row.serialIds
          ?.map(
            (id: string) =>
              serialOptions.value.find((item) => item.id === id)?.serialNo || '序列号资料不可用'
          )
          .join('、') || '—',
      span: 2
    }
  ]

  function unitName(id: string | null | undefined): string {
    return units.value.find((row) => row.id === id)?.unitName || '—'
  }
  function organizationName(id: string | null | undefined): string {
    return organizations.value.find((row) => row.id === id)?.organizationName || '—'
  }
  function warehouseName(id: string | null | undefined): string {
    return warehouses.value.find((row) => row.id === id)?.warehouseName || '—'
  }
  function lineCell(value: unknown, key: string): string {
    const row = value as DraftLine
    if (key === 'remainingQuantity')
      return Math.max(0, Number(row.quantity) - Number(row.returnedQuantity)).toFixed(4)
    if (key === 'ownerType') return ownerLabels[row.ownerType || 'self'] || '—'
    if (key === 'stockStatus') return statusLabels[row.stockStatus || ''] || row.stockStatus || '—'
    if (key === 'stockType')
      return (
        stockTypeDisplayOptions.value.find((option) => option.value === row.stockType)?.label ||
        (row.stockType ? WMS_STOCK_TYPE_LABELS[row.stockType] : undefined) ||
        row.stockType ||
        '—'
      )
    if (
      key === 'inventoryUnitId' ||
      key === 'baseUnitId' ||
      key === 'auxiliaryUnitId' ||
      key === 'auxiliaryUnit2Id'
    )
      return unitName(row[key])
    if (key === 'sourceOrganizationId')
      return row.sourceOrganizationName || organizationName(row.sourceOrganizationId)
    if (key === 'targetOrganizationId')
      return row.targetOrganizationName || organizationName(row.targetOrganizationId)
    if (key === 'sourceWarehouseId' || key === 'targetWarehouseId') return warehouseName(row[key])
    if (key === 'sourceBinId') return row.sourceBinName || '—'
    if (key === 'targetBinId') return row.targetBinName || '—'
    const field = row[key as keyof DraftLine]
    return field === null || field === undefined || field === '' ? '—' : String(field)
  }
  const lineItems = computed<FormItem[]>(() => {
    const sourceLocked =
      readonly.value ||
      Boolean(lineForm.value.sourceBatchId) ||
      Boolean(lineForm.value.sourceRequestLineId) ||
      isReturn.value
    const returnLocked =
      readonly.value || isReturn.value || Boolean(lineForm.value.sourceRequestLineId)
    const unitOptions = units.value.map((row) => ({ label: row.unitName, value: row.id }))
    const orgOptions = uniqBy(
      [
        ...enabledOrganizations.value.map((row) => ({
          label: row.organizationName,
          value: row.id
        })),
        ...[
          [lineForm.value.sourceOrganizationId, lineForm.value.sourceOrganizationName],
          [lineForm.value.targetOrganizationId, lineForm.value.targetOrganizationName]
        ]
          .filter(([id]) => Boolean(id))
          .map(([value, label]) => ({ value, label: label || '历史库存组织' }))
      ],
      'value'
    )
    const warehouseOptionsFor = (
      organizationId: string,
      selectedId: string,
      selectedName: string
    ) =>
      uniqBy(
        [
          ...warehouses.value
            .filter((row) => row.status === 'enabled' && row.organizationId === organizationId)
            .map((row) => ({
              label: `${row.warehouseName} · ${row.warehouseCode}`,
              value: row.id
            })),
          ...(selectedId
            ? [
                {
                  value: selectedId,
                  label: selectedName || warehouseName(selectedId) || '历史仓库'
                }
              ]
            : [])
        ],
        'value'
      )
    const sourceWarehouseOptions = warehouseOptionsFor(
      lineForm.value.sourceOrganizationId,
      lineForm.value.sourceWarehouseId,
      lineForm.value.sourceWarehouseName
    )
    const targetWarehouseOptions = warehouseOptionsFor(
      lineForm.value.targetOrganizationId,
      lineForm.value.targetWarehouseId,
      lineForm.value.targetWarehouseName
    )
    return [
      { key: 'sourceBatchId', label: '来源库存批次', type: 'slot', span: 24 },
      { key: 'materialDescription', label: '物料描述', type: 'input', props: { disabled: true } },
      { key: 'materialCode', label: '物料编码', type: 'input', props: { disabled: true } },
      { key: 'specificationModel', label: '规格型号', type: 'input', props: { disabled: true } },
      {
        key: 'projectId',
        label: '项目名称',
        type: 'select',
        options: projects.value.map((row) => ({
          label: `${row.projectName} · ${row.projectCode}`,
          value: row.id
        })),
        props: {
          disabled: sourceLocked,
          filterable: true,
          clearable: true,
          onChange: updateProjectCode
        }
      },
      { key: 'projectCode', label: '项目编码', type: 'input', props: { disabled: true } },
      {
        key: 'constructionNo',
        label: '施工号',
        type: 'input',
        props: { disabled: sourceLocked, maxlength: 100 }
      },
      {
        key: 'inventoryUnitId',
        label: '库存单位',
        type: 'select',
        options: unitOptions,
        props: {
          disabled: readonly.value || Boolean(lineForm.value.sourceRequestLineId),
          filterable: true,
          onChange: recalculateUnits
        }
      },
      {
        key: 'quantity',
        label: '数量',
        type: 'number',
        props: {
          disabled: readonly.value || Boolean(lineForm.value.sourceRequestLineId),
          min: 0.000001,
          precision: 6,
          class: 'w-full!',
          onChange: recalculateUnits
        }
      },
      {
        key: 'baseUnitId',
        label: '基本单位',
        type: 'select',
        options: unitOptions,
        props: {
          disabled: readonly.value || Boolean(lineForm.value.sourceRequestLineId),
          filterable: true,
          onChange: recalculateUnits
        }
      },
      {
        key: 'baseQuantity',
        label: '基本数量',
        type: 'number',
        props: {
          disabled: readonly.value || Boolean(lineForm.value.sourceRequestLineId),
          min: 0.000001,
          precision: 6,
          class: 'w-full!',
          onChange: recalculateQuantityFromBase
        }
      },
      {
        key: 'batchNo',
        label: '批号',
        type: 'input',
        props: { disabled: sourceLocked, maxlength: 80 }
      },
      {
        key: 'sourceOrganizationId',
        label: '调出组织',
        type: 'select',
        options: orgOptions,
        props: {
          disabled: sourceLocked,
          filterable: true,
          onChange: onLineSourceOrganizationChange
        }
      },
      {
        key: 'sourceWarehouseId',
        label: '调出仓库',
        type: 'select',
        options: sourceWarehouseOptions,
        props: { disabled: sourceLocked, filterable: true, onChange: loadSourceBins }
      },
      {
        key: 'sourceBinId',
        label: '调出仓位',
        type: 'select',
        options: sourceBins.value.map((row) => ({
          label: `${row.binCode} · ${row.binName}`,
          value: row.id
        })),
        props: { disabled: sourceLocked, filterable: true, clearable: true }
      },
      {
        key: 'targetOrganizationId',
        label: '调入组织',
        type: 'select',
        options: orgOptions,
        props: {
          disabled: returnLocked || organizationInternal.value,
          filterable: true,
          onChange: onLineTargetOrganizationChange
        }
      },
      {
        key: 'targetWarehouseId',
        label: '调入仓库',
        type: 'select',
        options: targetWarehouseOptions,
        props: { disabled: returnLocked, filterable: true, onChange: loadTargetBins }
      },
      {
        key: 'targetBinId',
        label: '调入仓位',
        type: 'select',
        options: targetBins.value.map((row) => ({
          label: `${row.binCode} · ${row.binName}`,
          value: row.id
        })),
        props: { disabled: returnLocked, filterable: true, clearable: true }
      },
      {
        key: 'ownerType',
        label: '货主类型',
        type: 'select',
        options: Object.entries(ownerLabels).map(([value, label]) => ({ label, value })),
        props: { disabled: true }
      },
      { key: 'ownerName', label: '货主', type: 'input', props: { disabled: true } },
      {
        key: 'stockType',
        label: '库存类型',
        type: 'select',
        options: stockTypeDisplayOptions.value,
        props: { disabled: true }
      },
      {
        key: 'stockStatus',
        label: '库存状态',
        type: 'select',
        options: stockStatusDisplayOptions.value,
        props: { disabled: true }
      },
      { key: 'keeperId', label: '仓管员', type: 'slot' },
      {
        key: 'auxiliaryQuantity',
        label: '辅助数量',
        type: 'number',
        props: { disabled: true, precision: 6, class: 'w-full!' }
      },
      {
        key: 'auxiliaryUnitId',
        label: '辅助单位',
        type: 'select',
        options: unitOptions,
        props: { disabled: true }
      },
      {
        key: 'auxiliaryQuantity2',
        label: '辅助数量2',
        type: 'number',
        props: { disabled: true, precision: 6, class: 'w-full!' }
      },
      {
        key: 'auxiliaryUnit2Id',
        label: '辅助单位2',
        type: 'select',
        options: unitOptions,
        props: { disabled: true }
      },
      {
        key: 'productionDate',
        label: '生产日期',
        type: 'date',
        props: { disabled: sourceLocked, valueFormat: 'YYYY-MM-DD', class: 'w-full!' }
      },
      {
        key: 'expiryDate',
        label: '有效期至',
        type: 'date',
        props: { disabled: sourceLocked, valueFormat: 'YYYY-MM-DD', class: 'w-full!' }
      },
      {
        key: 'trackingNo',
        label: '跟踪号',
        type: 'input',
        props: { disabled: sourceLocked, maxlength: 100 }
      },
      {
        key: 'gift',
        label: '赠品',
        type: 'checkbox',
        props: { disabled: readonly.value || Boolean(lineForm.value.sourceRequestLineId) }
      },
      {
        key: 'sourceDocument',
        label: '来源单据',
        type: 'input',
        props: { disabled: returnLocked, maxlength: 100 }
      },
      {
        key: 'sourceLineNo',
        label: '源行号',
        type: 'input',
        props: { disabled: returnLocked, maxlength: 40 }
      },
      {
        key: 'remark',
        label: '备注',
        type: 'input',
        span: 24,
        props: {
          disabled: readonly.value,
          type: 'textarea',
          rows: 2,
          maxlength: 500,
          showWordLimit: true
        }
      },
      ...(lineForm.value.stock?.material?.serialManagementEnabled ||
      serialOptions.value.length ||
      lineForm.value.serialIds?.length
        ? [
            {
              key: 'serialIds',
              label: '序列号',
              type: 'select' as const,
              span: 24,
              options: serialOptions.value.map((row) => ({ label: row.serialNo, value: row.id })),
              props: {
                disabled: readonly.value,
                multiple: true,
                filterable: true,
                collapseTags: true,
                collapseTagsTooltip: true
              }
            }
          ]
        : [])
    ]
  })
  const lineRules = {
    inventoryUnitId: [{ required: true, message: '请选择库存单位', trigger: 'change' }],
    quantity: [
      {
        required: true,
        type: 'number' as const,
        min: 0.000001,
        message: '请输入有效数量',
        trigger: 'change'
      }
    ],
    sourceOrganizationId: [{ required: true, message: '请选择调出组织', trigger: 'change' }],
    sourceWarehouseId: [{ required: true, message: '请选择调出仓库', trigger: 'change' }],
    targetOrganizationId: [{ required: true, message: '请选择调入组织', trigger: 'change' }],
    targetWarehouseId: [{ required: true, message: '请选择调入仓库', trigger: 'change' }]
  }

  function chooseBusinessType(): void {
    const choices = availableBusinessTypes.value
    if (!choices.some((row) => row.id === form.value.businessTypeId))
      form.value.businessTypeId = choices.find((row) => row.isDefault)?.id || choices[0]?.id || ''
  }
  function updateProjectCode(): void {
    const project = projects.value.find((row) => row.id === lineForm.value.projectId)
    lineForm.value.projectCode = project?.projectCode || ''
    lineForm.value.projectName = project?.projectName || ''
  }
  function recalculateUnits(): void {
    const row = lineForm.value
    const material = { baseUnitId: row.materialBaseUnitId, unitConversions: row.unitConversions }
    if (!row.inventoryUnitId) return
    const baseUnitId = row.baseUnitId || row.materialBaseUnitId
    row.baseQuantity =
      convertWmsMaterialQuantity(material, Number(row.quantity), row.inventoryUnitId, baseUnitId) ??
      0
    row.auxiliaryQuantity = row.auxiliaryUnitId
      ? convertWmsMaterialQuantity(
          material,
          Number(row.quantity),
          row.inventoryUnitId,
          row.auxiliaryUnitId
        )
      : null
    row.auxiliaryQuantity2 = row.auxiliaryUnit2Id
      ? convertWmsMaterialQuantity(
          material,
          Number(row.quantity),
          row.inventoryUnitId,
          row.auxiliaryUnit2Id
        )
      : null
  }
  function recalculateQuantityFromBase(): void {
    const row = lineForm.value
    const baseUnitId = row.baseUnitId || row.materialBaseUnitId
    const quantity = convertWmsMaterialQuantity(
      { baseUnitId: row.materialBaseUnitId, unitConversions: row.unitConversions },
      Number(row.baseQuantity),
      baseUnitId,
      row.inventoryUnitId
    )
    if (quantity === null || quantity <= 0) {
      ElMessage.warning('基本数量与库存单位缺少换算关系，请核对物料单位')
      return
    }
    row.quantity = Number(quantity.toFixed(6))
    recalculateUnits()
  }
  async function loadSourceBins(): Promise<void> {
    const id = lineForm.value.sourceWarehouseId
    lineForm.value.sourceBinId = null
    sourceBins.value = id ? await fetchWmsBins(id) : []
  }
  function onLineSourceOrganizationChange(): void {
    lineForm.value.sourceOrganizationName = organizationName(lineForm.value.sourceOrganizationId)
    const next = warehouses.value.find(
      (row) =>
        row.status === 'enabled' && row.organizationId === lineForm.value.sourceOrganizationId
    )
    lineForm.value.sourceWarehouseId = next?.id || ''
    lineForm.value.sourceWarehouseName = next?.warehouseName || ''
    lineForm.value.sourceBinId = null
    sourceBins.value = []
    if (next) void loadSourceBins()
  }
  function onLineTargetOrganizationChange(): void {
    lineForm.value.targetOrganizationName = organizationName(lineForm.value.targetOrganizationId)
    const next = warehouses.value.find(
      (row) =>
        row.status === 'enabled' && row.organizationId === lineForm.value.targetOrganizationId
    )
    lineForm.value.targetWarehouseId = next?.id || ''
    lineForm.value.targetWarehouseName = next?.warehouseName || ''
    lineForm.value.targetBinId = null
    targetBins.value = []
    if (next) void loadTargetBins()
  }
  function selectableTargetBins(bins: WmsBin[], value: unknown): WmsBin[] {
    if (
      !value ||
      typeof value !== 'object' ||
      !('sourceWarehouseId' in value) ||
      typeof value.sourceWarehouseId !== 'string' ||
      !('targetWarehouseId' in value) ||
      typeof value.targetWarehouseId !== 'string'
    )
      return []
    const sourceBinId = 'sourceBinId' in value ? value.sourceBinId : null
    return bins.filter(
      (bin) =>
        bin.status === 'available' &&
        (value.targetWarehouseId !== value.sourceWarehouseId || bin.id !== sourceBinId)
    )
  }
  async function loadTargetBins(): Promise<void> {
    const id = lineForm.value.targetWarehouseId
    lineForm.value.targetBinId = null
    targetBins.value = id ? selectableTargetBins(await fetchWmsBins(id), lineForm.value) : []
  }
  function normalizeOwnerType(value: string): 'self' | 'supplier' | 'customer' {
    return value === 'supplier' || value === 'customer' ? value : 'self'
  }
  function newLine(stock: WmsTransferStockOption): DraftLine {
    const targetOrganizationId = organizationInternal.value
      ? stock.organizationId
      : form.value.targetOrganizationId || stock.organizationId
    const target = isStep.value
      ? warehouses.value.find(
          (row) =>
            row.tenantId === stock.tenantId &&
            row.status === 'enabled' &&
            row.organizationId === targetOrganizationId
        )
      : targetOrganizationId === stock.organizationId
        ? warehouses.value.find((row) => row.id === stock.warehouseId)
        : warehouses.value.find(
            (row) => row.status === 'enabled' && row.organizationId === targetOrganizationId
          )
    const material = stock.material
    const inventoryUnitId = material?.inventoryUnitId || material?.baseUnitId || ''
    const baseUnitId = material?.baseUnitId || ''
    const availableInInventoryUnit = convertWmsMaterialQuantity(
      { baseUnitId, unitConversions: material?.unitConversions || [] },
      stock.availableQuantity,
      baseUnitId,
      inventoryUnitId
    )
    const quantity = Math.min(1, availableInInventoryUnit ?? 0)
    const unitConversions = material?.unitConversions || []
    const baseQuantity =
      convertWmsMaterialQuantity(
        { baseUnitId, unitConversions },
        quantity,
        inventoryUnitId,
        baseUnitId
      ) ?? quantity
    const project = projects.value.find((row) => row.id === stock.projectId)
    return {
      ...emptyLine(),
      stock,
      sourceBatchId: stock.id,
      materialId: stock.materialId,
      materialCode: material?.materialCode || '',
      materialDescription: material?.description || material?.materialName || '',
      specificationModel: material?.specificationModel || '',
      projectId: stock.projectId,
      projectName: project?.projectName || '',
      projectCode: project?.projectCode || '',
      constructionNo: stock.constructionNo,
      inventoryUnitId,
      quantity,
      baseUnitId,
      baseQuantity,
      materialBaseUnitId: baseUnitId,
      unitConversions,
      batchNo: stock.batchNo,
      sourceOrganizationId: stock.organizationId,
      sourceOrganizationName: organizationName(stock.organizationId),
      sourceWarehouseId: stock.warehouseId,
      sourceWarehouseName: stock.warehouse?.warehouseName || '',
      sourceBinId: stock.binId,
      sourceBinName: stock.bin?.binName || '',
      targetOrganizationId,
      targetOrganizationName: organizationName(targetOrganizationId),
      targetWarehouseId: target?.id || '',
      targetWarehouseName: target?.warehouseName || '',
      targetBinId: null,
      ownerType: normalizeOwnerType(stock.ownerType),
      ownerId: stock.ownerId,
      ownerName: stock.ownerName || '',
      stockType: stock.stockType || 'normal',
      stockStatus: stock.status === 'normal' ? 'available' : stock.status,
      keeperId: form.value.sourceKeeperId || null,
      keeperName: stock.keeperName || '',
      auxiliaryUnitId: material?.auxiliaryUnitId || null,
      auxiliaryUnit2Id: material?.auxiliaryUnit2Id || null,
      productionDate: stock.productionDate,
      expiryDate: stock.expiryDate,
      trackingNo: stock.trackingNo,
      gift: false
    }
  }
  function onStockSelected(stocks: WmsTransferStockOption[]): void {
    if (
      form.value.sourceOrganizationId &&
      stocks.some((stock) => stock.organizationId !== form.value.sourceOrganizationId)
    ) {
      ElMessage.warning('所选库存批次不属于表头调出组织，请重新选择')
      return
    }
    const previous = new Map(
      lines.value
        .filter((row) => row.sourceBatchId && !row.sourceRequestLineId)
        .map((row) => [row.sourceBatchId, row])
    )
    const retained = lines.value.filter((row) => !row.sourceBatchId || row.sourceRequestLineId)
    lines.value = [
      ...retained,
      ...stocks.map((stock) => {
        const existing = previous.get(stock.id)
        if (existing) {
          existing.stock = stock
          return existing
        }
        return newLine(stock)
      })
    ]
    syncHeaderProjectFromLines()
  }
  function syncHeaderProjectFromLines(): void {
    if (!lines.value.length) return
    const first = lines.value[0]?.projectId || null
    form.value.projectId = lines.value.every((row) => (row.projectId || null) === first)
      ? first
      : null
  }
  function onLineStockSelected(stocks: WmsTransferStockOption[]): void {
    const stock = stocks[0]
    if (!stock) return
    const original = lineForm.value
    if (
      original.sourceRequestLineId &&
      (stock.materialId !== original.materialId ||
        stock.organizationId !== original.sourceOrganizationId ||
        stock.warehouseId !== original.sourceWarehouseId ||
        stock.binId !== original.sourceBinId ||
        stock.projectId !== original.projectId ||
        (stock.constructionNo || '') !== (original.constructionNo || '') ||
        (Boolean(original.batchNo) && stock.batchNo !== original.batchNo))
    ) {
      ElMessage.warning('来源库存必须与申请明细的物料、项目、批次和调出位置一致')
      return
    }
    const fromStock = newLine(stock)
    const replacement = original.sourceRequestLineId
      ? {
          ...original,
          stock,
          sourceBatchId: stock.id,
          batchNo: stock.batchNo,
          ownerType: fromStock.ownerType,
          ownerId: fromStock.ownerId,
          ownerName: fromStock.ownerName,
          stockType: fromStock.stockType,
          stockStatus: fromStock.stockStatus,
          materialBaseUnitId: fromStock.materialBaseUnitId,
          unitConversions: fromStock.unitConversions
        }
      : fromStock
    replacement.key = lineForm.value.key
    replacement.lineNo = lineForm.value.lineNo
    lineForm.value = replacement
    void Promise.all([
      stock.warehouseId ? fetchWmsBins(stock.warehouseId) : Promise.resolve([]),
      replacement.targetWarehouseId
        ? fetchWmsBins(replacement.targetWarehouseId)
        : Promise.resolve([])
    ])
      .then(([sourceRows, targetRows]) => {
        if (lineForm.value.key !== replacement.key) return
        sourceBins.value = sourceRows
        targetBins.value = targetRows
      })
      .catch((error) => notifyFriendlyError(error, '仓位资料加载失败，请重试'))
  }
  async function scanStock(): Promise<void> {
    const tenantId = context.value?.tenantId
    const code = scanText.value.trim()
    if (!tenantId || !code || scanning.value) return
    scanning.value = true
    try {
      const result = await fetchWmsTransferStockByScan(tenantId, code)
      if (result.total === 1 && result.data[0]?.availableQuantity > 0) {
        const stock = result.data[0]
        if (
          form.value.sourceOrganizationId &&
          stock.organizationId !== form.value.sourceOrganizationId
        ) {
          ElMessage.warning('扫码库存与表头调出组织不一致，请核对后重试')
          return
        }
        if (form.value.projectId && stock.projectId !== form.value.projectId) {
          ElMessage.warning('扫码库存与表头项目不一致，请核对项目后重试')
          return
        }
        if (!lines.value.some((row) => row.sourceBatchId === stock.id))
          lines.value.push(newLine(stock))
        syncHeaderProjectFromLines()
        ElMessage.success('已识别库存批次并加入调拨明细')
        scanText.value = ''
      } else if (result.total > 1) {
        ElMessage.warning('匹配到多个库存批次，请点击“添加物料”选择具体库存')
      } else ElMessage.warning('未找到可用库存，请核对物料编码、批号或序列号')
    } catch (error) {
      notifyFriendlyError(error, '扫码库存查询失败，请重试')
    } finally {
      scanning.value = false
    }
  }
  async function openLine(value: unknown): Promise<void> {
    const row = value as DraftLine
    lineForm.value = cloneDeep(row)
    try {
      const [sourceRows, targetRows, serialRows] = await Promise.all([
        row.sourceWarehouseId ? fetchWmsBins(row.sourceWarehouseId) : Promise.resolve([]),
        row.targetWarehouseId ? fetchWmsBins(row.targetWarehouseId) : Promise.resolve([]),
        readonly.value && row.serialIds?.length && context.value?.tenantId
          ? fetchWmsTransferSerialOptions(context.value.tenantId, row.serialIds)
          : row.sourceBatchId
            ? fetchWmsBatchSerials(row.sourceBatchId)
            : row.serialIds?.length && context.value?.tenantId
              ? fetchWmsTransferSerialOptions(context.value.tenantId, row.serialIds)
              : Promise.resolve([])
      ])
      sourceBins.value = sourceRows
      targetBins.value = selectableTargetBins(targetRows, lineForm.value)
      serialOptions.value = serialRows.map((item) => ({ id: item.id, serialNo: item.serialNo }))
    } catch (error) {
      notifyFriendlyError(error, '调拨明细选项加载失败，请重试')
      return
    }
    await lineDialogRef.value?.handleOpen(undefined, {
      title: readonly.value ? '查看调拨明细' : '编辑调拨明细',
      showFooter: !readonly.value,
      onConfirm: saveLine
    })
    lineDialogRef.value?.setOptions({ confirmDisabled: !lineControlsReady.value })
  }
  async function saveLine(): Promise<boolean> {
    if (!(await validateArtFormForSubmit(lineFormRef.value))) return false
    recalculateUnits()
    const row = lineForm.value
    if (Number(row.baseQuantity ?? 0) <= 0) {
      ElMessage.warning('物料单位换算关系缺失，请核对库存单位与基本单位')
      return false
    }
    if (
      row.sourceWarehouseId === row.targetWarehouseId &&
      (!row.sourceBinId || !row.targetBinId || row.sourceBinId === row.targetBinId)
    ) {
      ElMessage.warning('调出仓库和调入仓库相同时，调出仓位和调入仓位必须不同')
      return false
    }
    if (
      !isStep.value &&
      warehouses.value.find((warehouse) => warehouse.id === row.targetWarehouseId)
        ?.enableLocations &&
      !row.targetBinId
    ) {
      ElMessage.warning('调入仓库启用了仓位，请选择调入仓位')
      return false
    }
    if (row.stock) {
      const requestedBaseQuantity = convertWmsMaterialQuantity(
        { baseUnitId: row.materialBaseUnitId, unitConversions: row.unitConversions },
        Number(row.quantity),
        row.inventoryUnitId,
        row.materialBaseUnitId
      )
      if (requestedBaseQuantity === null || requestedBaseQuantity > row.stock.availableQuantity) {
        ElMessage.warning('调拨数量超过当前可用库存量，或物料单位缺少换算关系')
        return false
      }
    }
    if (
      lines.value.some(
        (item) =>
          item.key !== row.key &&
          (item.sourceOrganizationId !== row.sourceOrganizationId ||
            item.targetOrganizationId !== row.targetOrganizationId)
      )
    ) {
      ElMessage.warning('一张调拨单只能包含同一组调出和调入组织的明细')
      return false
    }
    form.value.sourceOrganizationId = row.sourceOrganizationId
    form.value.targetOrganizationId = row.targetOrganizationId
    row.targetWarehouseName = warehouseName(row.targetWarehouseId)
    row.targetBinName = targetBins.value.find((item) => item.id === row.targetBinId)?.binName || ''
    const index = lines.value.findIndex((item) => item.key === row.key)
    if (index !== -1) lines.value[index] = cloneDeep(row)
    return true
  }
  function removeLine(value: unknown): void {
    const row = value as DraftLine
    lines.value = lines.value.filter((item) => item.key !== row.key)
    syncHeaderProjectFromLines()
  }

  function fromDocumentRow(row: WmsTransferBusinessRow): DraftLine {
    const line = row.line
    const project = projects.value.find((item) => item.id === line.projectId)
    return {
      ...emptyLine(),
      ...line,
      key: line.id,
      lineNo: line.lineNo,
      materialCode: row.materialCode,
      materialDescription: row.materialDescription,
      specificationModel: row.specificationModel || '',
      projectName: project?.projectName || row.projectName || '',
      projectCode: project?.projectCode || row.projectCode || '',
      constructionNo: line.constructionNo || '',
      batchNo: line.batchNo || '',
      sourceWarehouseName: row.sourceWarehouseName,
      sourceOrganizationName: row.sourceOrganizationName,
      sourceBinName: row.sourceBinName || '',
      targetWarehouseName: row.targetWarehouseName,
      targetOrganizationName: row.targetOrganizationName,
      targetBinName: row.targetBinName || '',
      ownerName: row.ownerName || ownerLabels[line.ownerType || 'self'] || '',
      keeperName: row.keeperName || '',
      unitConversions: row.unitConversions || [],
      materialBaseUnitId: row.materialBaseUnitId || '',
      returnedQuantity: line.returnedQuantity || 0,
      serialIds: line.serialIds || []
    }
  }
  async function loadOptions(tenantId: string, generation: number): Promise<void> {
    const [
      documentRows,
      businessRows,
      organizationPage,
      departments,
      warehouseRows,
      projectRows,
      unitRows,
      menu
    ] = await Promise.all([
      fetchWmsInitialDocumentTypes(
        tenantId,
        isStep.value ? 'WmsStepTransfer' : 'WmsDirectTransfer'
      ),
      fetchWmsInitialOptions('mdm_business_type', tenantId),
      fetchWmsInventoryOrganizations({ tenantId, enabled: 'enabled', current: 1, size: 2000 }),
      fetchEnabledOrganizationTree({ tenantId }),
      fetchWmsWarehouses(tenantId),
      fetchWmsProjects(tenantId),
      fetchWmsUnitOptions(tenantId),
      fetchWmsInitialMenuId(isStep.value ? 'WmsStepTransfer' : 'WmsDirectTransfer')
    ])
    if (generation !== loadGeneration) return
    if (departments.error) throw departments.error
    documentTypes.value = documentRows
    businessTypes.value = businessRows
    organizations.value = organizationPage.data
    departmentTree.value = departments.data ?? []
    warehouses.value = warehouseRows
    projects.value = projectRows
    units.value = unitRows
    menuId.value = menu
  }
  async function loadDocument(id: string, generation: number): Promise<void> {
    const { document, rows } = await fetchWmsTransferBusinessDocument(id)
    if (generation !== loadGeneration) return
    loadedDocumentRow.value = rows[0]
    form.value = {
      id: document.id,
      tenantId: document.tenantId,
      kind: document.kind,
      documentNo: document.documentNo,
      status: document.status,
      documentTypeId: document.documentTypeId,
      businessTypeId: document.businessTypeId,
      businessDate: document.businessDate,
      projectId: document.projectId,
      sourceOrganizationId: document.sourceOrganizationId,
      sourceDepartmentId: document.sourceDepartmentId,
      sourceKeeperId: document.sourceKeeperId,
      targetOrganizationId: document.targetOrganizationId,
      targetDepartmentId: document.targetDepartmentId,
      targetKeeperId: document.targetKeeperId,
      remark: document.remark,
      sourceRequestId: document.sourceRequestId,
      returnOfDocumentId: document.returnOfDocumentId
    }
    const batchIds = rows
      .map((row) => row.line.sourceBatchId)
      .filter((id): id is string => Boolean(id))
    const stocks = batchIds.length
      ? (
          await fetchWmsTransferStockPage({
            tenantId: document.tenantId,
            ids: batchIds,
            current: 1,
            size: batchIds.length
          })
        ).data
      : []
    if (generation !== loadGeneration) return
    const keeperIds = [document.sourceKeeperId, document.targetKeeperId].filter(
      (id): id is string => Boolean(id)
    )
    const employees = keeperIds.length
      ? await fetchEmployeeReferencesByIds(document.tenantId, keeperIds)
      : []
    if (generation !== loadGeneration) return
    keeperNames.value = Object.fromEntries(employees.map((item) => [item.id, item.employeeName]))
    const stockById = new Map(stocks.map((row) => [row.id, row]))
    lines.value = rows.map((row) => {
      const draft = fromDocumentRow(row)
      draft.stock = draft.sourceBatchId ? stockById.get(draft.sourceBatchId) : undefined
      draft.ownerName = draft.stock?.ownerName || draft.ownerName
      draft.keeperName = draft.stock?.keeperName || ''
      return draft
    })
    if (isReceipt.value) {
      const warehouseIds = uniq(lines.value.map((line) => line.targetWarehouseId))
      const bins = await Promise.all(
        warehouseIds.map(
          async (warehouseId) => [warehouseId, await fetchWmsBins(warehouseId)] as const
        )
      )
      if (generation !== loadGeneration) return
      receiptBins.value = Object.fromEntries(bins)
    }
  }
  async function reload(): Promise<void> {
    const opening = context.value
    if (!opening) return
    const generation = ++loadGeneration
    loadError.value = false
    loadErrorMessage.value = ''
    drawerRef.value?.setLoading(true)
    drawerRef.value?.setOptions({ confirmDisabled: true })
    try {
      if (!opening.tenantId) throw new Error('目标租户未确定，请刷新后重试')
      await loadOptions(opening.tenantId, generation)
      if (generation !== loadGeneration) return
      if (opening.documentId) {
        await loadDocument(opening.documentId, generation)
        if (generation !== loadGeneration) return
        if (opening.mode === 'copy') {
          form.value.id = undefined
          form.value.kind = opening.kind
          form.value.documentNo = ''
          form.value.status = 'draft'
          form.value.sourceRequestId = null
          form.value.returnOfDocumentId = null
          lines.value = lines.value.map((row) => ({
            ...row,
            key: crypto.randomUUID(),
            sourceBatchId: null,
            stock: undefined,
            sourceRequestLineId: null,
            returnOfLineId: null,
            returnedQuantity: 0,
            serialIds: []
          }))
        }
      } else {
        loadedDocumentRow.value = undefined
        const defaultDocumentCode = isStep.value ? 'MT20' : 'MT'
        const standardDocument = documentTypes.value.find((row) => row.code === defaultDocumentCode)
        if (!standardDocument) {
          loadErrorMessage.value = `当前租户尚未在 MDM 配置${isStep.value ? '分步' : '直接'}调拨标准单据类型，请先配置后重试。`
          throw new Error(loadErrorMessage.value)
        }
        const org =
          enabledOrganizations.value.find((row) => row.isDefault) || enabledOrganizations.value[0]
        form.value.sourceOrganizationId = org?.id || ''
        form.value.targetOrganizationId = org?.id || ''
        form.value.documentTypeId = standardDocument.id
        const defaultBusinessCode = isStep.value ? 'M303' : 'M311'
        const standardBusiness = availableBusinessTypes.value.find(
          (row) => row.code === defaultBusinessCode
        )
        if (!standardBusiness) {
          loadErrorMessage.value = `当前租户尚未在 MDM 配置${isStep.value ? '分步' : '直接'}调拨标准业务类型，请先配置后重试。`
          throw new Error(loadErrorMessage.value)
        }
        form.value.businessTypeId = standardBusiness.id
      }
      await nextTick()
      headerFormRef.value?.clearValidate()
    } catch (error) {
      if (generation !== loadGeneration) return
      loadError.value = true
      notifyFriendlyError(error, '调拨单资料加载失败，请重试')
    } finally {
      if (generation === loadGeneration) {
        drawerRef.value?.setLoading(false)
        drawerRef.value?.setOptions({
          confirmDisabled: loadError.value || !headerControlsReady.value
        })
      }
    }
  }
  function payloadLine(row: DraftLine): WmsTransferBusinessLineInput {
    return {
      materialId: row.materialId,
      sourceBatchId: row.sourceBatchId || null,
      projectId: row.projectId || null,
      constructionNo: normalizeNullableText(row.constructionNo),
      inventoryUnitId: row.inventoryUnitId,
      quantity: Number(row.quantity),
      baseUnitId: row.baseUnitId || null,
      baseQuantity: Number(row.baseQuantity),
      batchNo: normalizeNullableText(row.batchNo),
      sourceOrganizationId: row.sourceOrganizationId,
      sourceWarehouseId: row.sourceWarehouseId,
      sourceBinId: row.sourceBinId || null,
      targetOrganizationId: row.targetOrganizationId,
      targetWarehouseId: row.targetWarehouseId,
      targetBinId: row.targetBinId || null,
      ownerType: row.ownerType,
      ownerId: row.ownerId || null,
      stockType: row.stockType,
      stockStatus: row.stockStatus,
      keeperId: row.keeperId || null,
      auxiliaryUnitId: row.auxiliaryUnitId || null,
      auxiliaryQuantity: row.auxiliaryQuantity,
      auxiliaryUnit2Id: row.auxiliaryUnit2Id || null,
      auxiliaryQuantity2: row.auxiliaryQuantity2,
      productionDate: row.productionDate || null,
      expiryDate: row.expiryDate || null,
      trackingNo: normalizeNullableText(row.trackingNo),
      gift: Boolean(row.gift),
      sourceDocument: normalizeNullableText(row.sourceDocument),
      sourceLineNo: normalizeNullableText(row.sourceLineNo),
      remark: normalizeNullableText(row.remark),
      sourceRequestLineId: row.sourceRequestLineId || null,
      returnOfLineId: row.returnOfLineId || null,
      serialIds: row.serialIds || []
    }
  }
  async function save(): Promise<boolean> {
    if (readonly.value || loadError.value) return false
    if (!(await validateArtFormForSubmit(headerFormRef.value))) return false
    if (!context.value?.tenantId) return false
    if (isReceipt.value) {
      if (!form.value.id) return false
      if (
        lines.value.some(
          (line) =>
            warehouses.value.find((warehouse) => warehouse.id === line.targetWarehouseId)
              ?.enableLocations && !line.targetBinId
        )
      ) {
        ElMessage.warning('调入仓库启用了仓位，请选择调入仓位')
        return false
      }
      try {
        await updateWmsTransferBusinessReceipt(
          form.value.id,
          form.value.businessDate,
          normalizeNullableText(form.value.remark),
          lines.value.map((line) => ({ lineId: line.key, targetBinId: line.targetBinId || null }))
        )
        emit('success')
        return true
      } catch (error) {
        notifyFriendlyError(error, '收货单保存失败，请检查仓位后重试')
        return false
      }
    }
    if (!lines.value.length) {
      ElMessage.warning('请至少添加一条调拨物料')
      return false
    }
    if (
      lines.value.some(
        (row) =>
          !row.materialId ||
          row.quantity <= 0 ||
          !row.inventoryUnitId ||
          !row.sourceOrganizationId ||
          !row.sourceWarehouseId ||
          !row.targetOrganizationId ||
          !row.targetWarehouseId
      )
    ) {
      ElMessage.warning('请完整填写物料、数量与调出调入信息')
      return false
    }
    if (
      lines.value.some(
        (row) =>
          row.sourceOrganizationId !== form.value.sourceOrganizationId ||
          row.targetOrganizationId !== form.value.targetOrganizationId
      )
    ) {
      ElMessage.warning('调拨明细的调出、调入组织必须与单据表头一致')
      return false
    }
    if (
      lines.value.some(
        (row) =>
          row.sourceWarehouseId === row.targetWarehouseId &&
          (!row.sourceBinId || !row.targetBinId || row.sourceBinId === row.targetBinId)
      )
    ) {
      ElMessage.warning('同仓调拨时，调出仓位和调入仓位必须不同')
      return false
    }
    if (
      !isStep.value &&
      lines.value.some(
        (row) =>
          warehouses.value.find((warehouse) => warehouse.id === row.targetWarehouseId)
            ?.enableLocations && !row.targetBinId
      )
    ) {
      ElMessage.warning('调入仓库启用了仓位，请补全调入仓位')
      return false
    }
    try {
      await saveWmsTransferBusinessDocument({
        id: mode.value === 'edit' ? form.value.id : undefined,
        tenantId: context.value.tenantId,
        kind: form.value.kind,
        documentTypeId: form.value.documentTypeId,
        businessTypeId: form.value.businessTypeId,
        businessDate: form.value.businessDate,
        projectId: form.value.projectId || null,
        sourceOrganizationId: form.value.sourceOrganizationId,
        sourceDepartmentId: form.value.sourceDepartmentId || null,
        sourceKeeperId: form.value.sourceKeeperId || null,
        targetOrganizationId: form.value.targetOrganizationId,
        targetDepartmentId: form.value.targetDepartmentId || null,
        targetKeeperId: form.value.targetKeeperId || null,
        remark: normalizeNullableText(form.value.remark),
        sourceRequestId: form.value.sourceRequestId || null,
        returnOfDocumentId: form.value.returnOfDocumentId || null,
        lines: lines.value.map(payloadLine)
      })
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '调拨单保存失败，请检查明细和网络后重试')
      return false
    }
  }
  async function handleOpen(opening: OpenData): Promise<void> {
    loadGeneration += 1
    context.value = opening
    form.value = emptyHeader(opening.kind)
    lines.value = []
    scanText.value = ''
    loadError.value = false
    const entityName =
      opening.kind === 'step_receipt'
        ? '分步调拨收货单'
        : opening.kind === 'step'
          ? '分步调拨单'
          : '直接调拨单'
    await drawerRef.value?.handleOpen(opening, {
      title:
        opening.mode === 'view'
          ? `查看${entityName}`
          : opening.mode === 'edit'
            ? `编辑${entityName}`
            : opening.mode === 'copy'
              ? `复制${entityName}`
              : `新增${entityName}`,
      subtitle: isReceipt.value
        ? '暂存 → 提交 → 审核收货入库'
        : isStep.value
          ? '暂存 → 提交 → 审核调出 → 在途收货'
          : '暂存 → 提交 → 审核记账',
      showFooter: opening.mode !== 'view',
      confirmText: opening.mode === 'copy' ? '保存副本' : '保存',
      onConfirm: save,
      onOpen: reload,
      loading: true,
      confirmDisabled: true,
      onClose: () => {
        loadGeneration += 1
        context.value = undefined
      }
    })
  }
  watch(
    () => form.value.sourceOrganizationId,
    (id) => {
      if (organizationInternal.value) form.value.targetOrganizationId = id
    }
  )
  watch(
    () => form.value.businessTypeId,
    () => {
      if (organizationInternal.value)
        form.value.targetOrganizationId = form.value.sourceOrganizationId
    }
  )
  watch(lineControlsReady, (ready) => {
    lineDialogRef.value?.setOptions({ confirmDisabled: !ready })
  })
  watch(headerControlsReady, (ready) => {
    drawerRef.value?.setOptions({ confirmDisabled: loadError.value || !ready })
  })
  defineExpose({ handleOpen })
</script>

<style scoped>
  :deep(.transfer-business-lines .el-table__body-wrapper) {
    overflow-x: auto;
  }
</style>
