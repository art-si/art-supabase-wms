<template>
  <ArtDrawer ref="drawerRef" :size="isMobile ? '100%' : 'xl'" show-fullscreen-button>
    <ArtEmptyState
      v-if="loadError"
      title="单据资料加载失败"
      :description="loadError"
      size="compact"
    >
      <ElButton type="primary" @click="reloadDocument">重新加载</ElButton>
    </ArtEmptyState>
    <div v-else class="space-y-4">
      <ArtEntitySummary
        :icon="kind === 'gain' ? 'ri:add-box-line' : 'ri:indeterminate-circle-line'"
        eyebrow="INVENTORY COUNT"
        :title="
          mode === 'view'
            ? form.documentNo || title
            : mode === 'edit'
              ? `编辑${title}`
              : mode === 'copy'
                ? `复制${title}`
                : `新增${title}`
        "
        description="单据编号按月自动生成三位流水号；账存数量由当前库存汇总。"
      />
      <ElAlert v-if="openData?.importIntent" type="info" :closable="false" show-icon>
        先核对库存组织和业务日期，再在“物料明细”点击“导入明细”；数量填写正数，保存前核对仓储、货主和单价。
      </ElAlert>
      <ArtSectionCard title="单据表头" subtitle="编号按月生成；记账日期由系统记录。">
        <ArtDescriptions
          v-if="mode === 'view'"
          class="document-header-descriptions"
          :data="viewData"
          :items="viewItems"
          :columns="2"
          :label-width="120"
        />
        <ArtForm
          v-else
          ref="formRef"
          v-model="form"
          :items="headerItems"
          :rules="rules"
          :span="12"
          :gutter="20"
          label-position="top"
          :show-reset="false"
          :show-submit="false"
        >
          <template #keeperId>
            <ArtEmployeeSelect
              v-model="form.keeperId"
              :tenant-id="context?.tenantId"
              placeholder="选择仓管员"
              @selected="syncHeaderKeeper"
            />
          </template>
        </ArtForm>
      </ArtSectionCard>
      <ArtSectionCard
        title="物料明细"
        :subtitle="
          mode === 'view'
            ? `共 ${lines.length} 行；行号按 10 递增。`
            : `共 ${lines.length} 行；导入必填列：物料编码、数量；可选列：批号、备注。`
        "
        :empty="!lines.length"
        empty-title="请选择物料"
        empty-description="支持多选物料，编码、规格和默认单位自动带入。"
      >
        <template #actions>
          <ArtExcelImport
            v-if="mode !== 'view'"
            v-auth="kind === 'gain' ? 'WmsCountGain:Import' : 'WmsCountLoss:Import'"
            icon="ri:file-upload-line"
            :context-key="openData"
            :disabled="importing || parsing"
            :button-props="{ type: 'success', plain: true, loading: importing || parsing }"
            @parsing-change="onImportParsing"
            @import-success="importLines"
            @import-error="notifyFriendlyError($event, '文件读取失败，请检查 Excel 格式后重新选择')"
            >导入明细</ArtExcelImport
          >
          <ArtTableMultipleSelect
            class="w-auto!"
            v-if="mode !== 'view'"
            :model-value="selectedMaterialIds"
            :api-fn="materialApi"
            :selected-data="selectedMaterials"
            :columns="materialColumns"
            :navigation="materialNavigation"
            :title="`选择${title}物料`"
            subtitle="按物料分类筛选，可一次选择多种物料"
            placeholder="添加物料"
            search-placeholder="输入物料编码、名称或规格"
            label-key="materialName"
            :show-pagination="true"
            :page-size="20"
            @update:selected-data="onMaterialsSelected"
          >
            <template #trigger="{ open }">
              <ElButton type="primary" @click="open">
                <ArtSvgIcon icon="ri:add-line" />添加物料
              </ElButton>
            </template>
          </ArtTableMultipleSelect>
        </template>
        <ArtTable
          v-if="mode === 'view'"
          :data="documentRows"
          :pagination="false"
          :show-table-header="false"
          row-key="lineId"
          table-layout="fixed"
          class="count-line-table"
          :cell-class-name="viewLineCellClassName"
        >
          <ElTableColumn prop="lineNo" label="行号" width="68" :fixed="isMobile ? false : 'left'" />
          <ElTableColumn label="物料描述" min-width="220" :fixed="isMobile ? false : 'left'">
            <template #default="{ row }">
              <strong class="block truncate">{{
                row.materialDescription || row.materialName
              }}</strong>
              <small class="text-[var(--el-text-color-secondary)]"
                >{{ row.materialCode }} · {{ row.specificationModel || '无规格' }}</small
              >
            </template>
          </ElTableColumn>
          <ElTableColumn
            prop="projectName"
            label="项目名称"
            min-width="160"
            show-overflow-tooltip
          />
          <ElTableColumn prop="constructionNo" label="施工号" min-width="120" />
          <ElTableColumn label="赠品" width="72" align="center">
            <template #default="{ row }">{{ row.gift ? '✓' : '—' }}</template>
          </ElTableColumn>
          <ElTableColumn prop="inventoryUnitName" label="库存单位" width="140"
            ><template #default="{ row }">{{
              formatUnitDisplayName(row.inventoryUnitName)
            }}</template></ElTableColumn
          >
          <ElTableColumn label="账存数量(库存)" min-width="135" align="right">
            <template #default="{ row }"
              ><span class="tabular-nums">{{ numberText(row.bookQuantity) }}</span></template
            >
          </ElTableColumn>
          <ElTableColumn label="盘点数量(库存)" min-width="135" align="right">
            <template #default="{ row }"
              ><span class="tabular-nums">{{ numberText(row.countedQuantity) }}</span></template
            >
          </ElTableColumn>
          <ElTableColumn
            prop="varianceQuantity"
            :label="`${title.slice(0, 2)}数量(库存)`"
            min-width="135"
            align="right"
          >
            <template #default="{ row }"
              ><strong class="count-variance-text tabular-nums">{{
                signedVarianceText(row.varianceQuantity)
              }}</strong></template
            >
          </ElTableColumn>
          <ElTableColumn prop="baseUnitName" label="基本单位" width="140"
            ><template #default="{ row }">{{
              formatUnitDisplayName(row.baseUnitName)
            }}</template></ElTableColumn
          >
          <ElTableColumn label="基本数量" width="110" align="right">
            <template #default="{ row }">{{ numberText(row.baseQuantity) }}</template>
          </ElTableColumn>
          <ElTableColumn label="单价(元)" width="105" align="right">
            <template #default="{ row }">{{ moneyText(row.unitPrice) }}</template>
          </ElTableColumn>
          <ElTableColumn label="金额(元)" width="110" align="right">
            <template #default="{ row }">{{ moneyText(row.amount) }}</template>
          </ElTableColumn>
          <ElTableColumn prop="batchNo" label="批号" min-width="120" />
          <ElTableColumn prop="warehouseName" label="仓库" min-width="150" />
          <ElTableColumn prop="binName" label="仓位" min-width="120" />
          <ElTableColumn label="库存类型" width="110"
            ><template #default="{ row }">{{
              stockTypeLabel(row.stockType)
            }}</template></ElTableColumn
          >
          <ElTableColumn label="货主类型" width="105"
            ><template #default="{ row }">{{
              ownerTypeLabel(row.ownerType)
            }}</template></ElTableColumn
          >
          <ElTableColumn label="货主" min-width="160" show-overflow-tooltip>
            <template #default="{ row }">{{
              formatWmsOwnerName(row.ownerType, row.ownerId, suppliers, customers)
            }}</template>
          </ElTableColumn>
          <ElTableColumn label="库存状态" width="105"
            ><template #default="{ row }">{{
              stockStatusLabel(row.stockStatus)
            }}</template></ElTableColumn
          >
          <ElTableColumn prop="keeperName" label="仓管员" min-width="110" />
          <ElTableColumn prop="auxiliaryUnitName" label="辅助单位" width="140"
            ><template #default="{ row }">{{
              formatUnitDisplayName(row.auxiliaryUnitName)
            }}</template></ElTableColumn
          >
          <ElTableColumn prop="auxiliaryQuantity" label="辅助数量" width="105" align="right" />
          <ElTableColumn prop="auxiliaryUnit2Name" label="辅助单位2" width="110" />
          <ElTableColumn prop="auxiliaryQuantity2" label="辅助数量2" width="110" align="right" />
          <ElTableColumn prop="productionDate" label="生产日期" width="115" />
          <ElTableColumn prop="expiryDate" label="有效期至" width="115" />
          <ElTableColumn prop="trackingNo" label="跟踪号" min-width="125" />
          <ElTableColumn prop="sourceDocument" label="来源单据" min-width="130" />
          <ElTableColumn prop="sourceLineNo" label="源行号" width="95" />
          <ElTableColumn prop="lineRemark" label="备注" min-width="150" show-overflow-tooltip />
        </ArtTable>
        <ArtTable
          v-else
          :data="lines"
          :pagination="false"
          :show-table-header="false"
          row-key="key"
          table-layout="fixed"
          class="count-line-table"
          :cell-class-name="lineCellClassName"
        >
          <ElTableColumn label="行号" width="68" :fixed="isMobile ? false : 'left'"
            ><template #default="{ $index }">{{ ($index + 1) * 10 }}</template></ElTableColumn
          >
          <ElTableColumn label="物料描述" min-width="210" :fixed="isMobile ? false : 'left'"
            ><template #default="{ row }"
              ><strong class="block truncate">{{
                row.material?.description || row.material?.materialName
              }}</strong
              ><small class="text-[var(--el-text-color-secondary)]"
                >{{ row.material?.materialCode }} ·
                {{ row.material?.specificationModel || '无规格' }}</small
              ></template
            ></ElTableColumn
          >
          <ElTableColumn label="项目名称" min-width="170"
            ><template #default="{ row }"
              ><ElSelect
                v-model="row.projectId"
                clearable
                filterable
                :disabled="false"
                placeholder="选择项目"
                ><ElOption
                  v-for="item in projects"
                  :key="item.id"
                  :label="`${item.projectName} · ${item.projectCode}`"
                  :value="item.id" /></ElSelect></template
          ></ElTableColumn>
          <ElTableColumn label="施工号" min-width="125"
            ><template #default="{ row }"><ElInput v-model="row.constructionNo" /></template
          ></ElTableColumn>
          <ElTableColumn label="赠品" width="78" align="center"
            ><template #default="{ row }"><ElCheckbox v-model="row.gift" /></template
          ></ElTableColumn>
          <ElTableColumn label="库存单位" min-width="140"
            ><template #default="{ row }"
              ><ElSelect v-model="row.inventoryUnitId" filterable
                ><ElOption
                  v-for="unit in units"
                  :key="unit.id"
                  :label="formatUnitDisplayName(unit.unitName)"
                  :value="unit.id" /></ElSelect></template
          ></ElTableColumn>
          <ElTableColumn label="账存数量(库存)" prop="bookQuantity" min-width="135" align="right"
            ><template #default="{ row }"
              ><span class="tabular-nums">{{ numberText(row.bookQuantity) }}</span></template
            ></ElTableColumn
          >
          <ElTableColumn label="盘点数量(库存)" min-width="135" align="right"
            ><template #default="{ row }"
              ><span class="tabular-nums">{{ numberText(countedQuantity(row)) }}</span></template
            ></ElTableColumn
          >
          <ElTableColumn
            :label="`${title.slice(0, 2)}数量(库存)`"
            prop="varianceQuantity"
            min-width="180"
            align="right"
            ><template #default="{ row }"
              ><ElInputNumber
                v-model="row.varianceQuantity"
                :min="0.0001"
                :precision="4"
                :controls="false"
                :disabled="false"
                class="w-full!" /></template
          ></ElTableColumn>
          <ElTableColumn label="基本单位" min-width="140"
            ><template #default="{ row }"
              ><ElSelect v-model="row.baseUnitId" clearable filterable
                ><ElOption
                  v-for="unit in units"
                  :key="unit.id"
                  :label="formatUnitDisplayName(unit.unitName)"
                  :value="unit.id" /></ElSelect></template
          ></ElTableColumn>
          <ElTableColumn label="基本数量" min-width="115" align="right"
            ><template #default="{ row }"
              ><span class="tabular-nums">{{ numberText(row.varianceQuantity) }}</span></template
            ></ElTableColumn
          >
          <ElTableColumn label="单价(元)" min-width="180"
            ><template #default="{ row }"
              ><ElInputNumber
                v-model="row.unitPrice"
                :min="0"
                :precision="4"
                :controls="false"
                :disabled="false"
                class="w-full!" /></template
          ></ElTableColumn>
          <ElTableColumn label="金额(元)" min-width="120" align="right"
            ><template #default="{ row }"
              ><span class="tabular-nums">{{
                moneyText(row.gift ? 0 : row.varianceQuantity * row.unitPrice)
              }}</span></template
            ></ElTableColumn
          >
          <ElTableColumn label="批号" min-width="130"
            ><template #default="{ row }"><ElInput v-model="row.batchNo" /></template
          ></ElTableColumn>
          <ElTableColumn label="仓库" min-width="160"
            ><template #default="{ row }"
              ><ElSelect
                v-model="row.warehouseId"
                filterable
                :disabled="false"
                @change="loadBins(row)"
                ><ElOption
                  v-for="item in warehouseOptions"
                  :key="item.id"
                  :label="item.warehouseName"
                  :value="item.id" /></ElSelect></template
          ></ElTableColumn>
          <ElTableColumn label="仓位" min-width="155"
            ><template #default="{ row }"
              ><ElSelect v-model="row.binId" clearable filterable :disabled="!row.warehouseId"
                ><ElOption
                  v-for="item in row.bins"
                  :key="item.id"
                  :label="`${item.binCode} · ${item.binName}`"
                  :value="item.id" /></ElSelect></template
          ></ElTableColumn>
          <ElTableColumn label="库存类型" min-width="155"
            ><template #default="{ row }"
              ><ElSelect v-model="row.stockType"
                ><ElOption
                  v-for="item in stockTypes"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value" /></ElSelect></template
          ></ElTableColumn>
          <ElTableColumn label="货主类型" min-width="155"
            ><template #default="{ row }"
              ><ElSelect v-model="row.ownerType" :disabled="false" @change="row.ownerId = ''"
                ><ElOption
                  v-for="option in userStore.getDictMap.mdmBusinessOwnerType ?? []"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value" /></ElSelect></template
          ></ElTableColumn>
          <ElTableColumn label="货主" min-width="160"
            ><template #default="{ row }"
              ><ElSelect
                v-model="row.ownerId"
                clearable
                filterable
                :disabled="row.ownerType === 'self'"
                ><ElOption
                  v-for="item in ownerOptions(row.ownerType)"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id" /></ElSelect></template
          ></ElTableColumn>
          <ElTableColumn label="库存状态" min-width="155"
            ><template #default="{ row }"
              ><ElSelect v-model="row.stockStatus"
                ><ElOption
                  v-for="option in userStore.getDictMap.wmsStockStatus ?? []"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value" /></ElSelect></template
          ></ElTableColumn>
          <ElTableColumn label="仓管员" min-width="165"
            ><template #default="{ row }"
              ><ArtEmployeeSelect
                v-model="row.keeperId"
                :tenant-id="context?.tenantId"
                placeholder="选择仓管员" /></template
          ></ElTableColumn>
          <ElTableColumn label="辅助单位" min-width="140"
            ><template #default="{ row }">{{
              unitName(row.auxiliaryUnitId)
            }}</template></ElTableColumn
          >
          <ElTableColumn label="辅助数量" min-width="115" align="right"
            ><template #default="{ row }">{{
              numberText(row.auxiliaryQuantity)
            }}</template></ElTableColumn
          >
          <ElTableColumn label="辅助单位2" min-width="140"
            ><template #default="{ row }">{{
              unitName(row.auxiliaryUnit2Id)
            }}</template></ElTableColumn
          >
          <ElTableColumn label="辅助数量2" min-width="115" align="right"
            ><template #default="{ row }">{{
              numberText(row.auxiliaryQuantity2)
            }}</template></ElTableColumn
          >
          <ElTableColumn label="生产日期" min-width="190"
            ><template #default="{ row }"
              ><ElDatePicker v-model="row.productionDate" value-format="YYYY-MM-DD" /></template
          ></ElTableColumn>
          <ElTableColumn label="有效期至" min-width="190"
            ><template #default="{ row }"
              ><ElDatePicker v-model="row.expiryDate" value-format="YYYY-MM-DD" /></template
          ></ElTableColumn>
          <ElTableColumn label="跟踪号" min-width="135"
            ><template #default="{ row }"><ElInput v-model="row.trackingNo" /></template
          ></ElTableColumn>
          <ElTableColumn label="来源单据" min-width="145"
            ><template #default="{ row }"><ElInput v-model="row.sourceDocument" /></template
          ></ElTableColumn>
          <ElTableColumn label="源行号" min-width="105"
            ><template #default="{ row }"><ElInput v-model="row.sourceLineNo" /></template
          ></ElTableColumn>
          <ElTableColumn label="备注" min-width="150"
            ><template #default="{ row }"><ElInput v-model="row.remark" /></template
          ></ElTableColumn>
          <ElTableColumn label="操作" width="82" :fixed="isMobile ? false : 'right'"
            ><template #default="{ row }"
              ><ElButton link type="danger" @click="removeLine(row.key)">移除</ElButton></template
            ></ElTableColumn
          >
        </ArtTable>
      </ArtSectionCard>
    </div>
  </ArtDrawer>
</template>

<script setup lang="ts">
  import {
    buildMaterialCategoryNavigation,
    getMaterialCategoryIds
  } from '@/utils/business/material-category'
  import { fetchWmsMaterialCategories } from '@/api/wms-material-category'
  import type { MaterialSelectCategory } from '@/components/business/art-material-select/types'
  const materialCategories = ref<MaterialSelectCategory[]>([])
  const materialNavigation = computed(() =>
    buildMaterialCategoryNavigation(materialCategories.value)
  )
  import { formatWmsOwnerName } from '@/utils/wms/owner-display'
  import { formatUnitDisplayName } from '@/utils/business/unit-display'
  import { WMS_STOCK_TYPE_LABELS } from '@/utils/wms/stock-type'
  import { isWmsBusinessTypeAvailable } from '@/utils/wms/business-type'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { useBreakpoints } from '@vueuse/core'
  import { useWarehouseRowBinLoader } from '@/hooks/core/useWarehouseBinOptions'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { ElMessage } from 'element-plus'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { prepareWmsMaterialImport } from '../../shared/material-import'
  import ArtExcelImport from '@/components/core/forms/art-excel-import/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtTableMultipleSelect from '@/components/core/forms/art-data-select/table-multiple.vue'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import type {
    DataSelectColumn,
    DataSelectFetchParams,
    DataSelectRecord
  } from '@/components/core/forms/art-data-select/types'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import { useUserStore } from '@/store/modules/user'
  import {
    fetchWmsBins,
    fetchWmsCountAdjustment,
    fetchWmsInitialDocumentTypes,
    fetchWmsInitialMenuId,
    fetchWmsInitialOptions,
    fetchWmsInventoryOrganizations,
    fetchWmsMaterialOptions,
    fetchWmsMaterialImportReference,
    fetchWmsProjects,
    fetchWmsUnitOptions,
    fetchWmsWarehouses,
    saveWmsCountAdjustment,
    type WmsBin,
    type WmsCountAdjustmentKind,
    type WmsCountAdjustmentRow,
    type WmsInitializationOption,
    type WmsInventoryOrganization,
    type WmsMaterialOption,
    type WmsProject,
    type WmsUnitOption,
    type WmsWarehouse
  } from '@wms/api'

  interface Context {
    tenantId?: string
  }
  interface OpenData extends Context {
    importIntent?: boolean
    mode: 'create' | 'edit' | 'copy' | 'view'
    documentId?: string
  }
  interface DraftLine {
    key: string
    materialId: string
    material: WmsMaterialOption | null
    projectId: string
    constructionNo: string
    gift: boolean
    inventoryUnitId: string
    bookQuantity: number
    varianceQuantity: number
    baseUnitId: string
    unitPrice: number
    batchNo: string
    warehouseId: string
    binId: string
    bins: WmsBin[]
    stockType: string
    ownerType: 'self' | 'supplier' | 'customer'
    ownerId: string
    stockStatus: string
    keeperId: string
    auxiliaryUnitId: string
    auxiliaryQuantity: number
    auxiliaryUnit2Id: string
    auxiliaryQuantity2: number
    productionDate: string
    expiryDate: string
    trackingNo: string
    sourceDocument: string
    sourceLineNo: string
    remark: string
  }
  const props = defineProps<{ kind: WmsCountAdjustmentKind }>()
  const emit = defineEmits<{ success: [] }>()
  const userStore = useUserStore()
  void Promise.all(
    ['mdmBusinessOwnerType', 'wmsCountStockType', 'wmsStockStatus'].map((code) =>
      userStore.ensureDictLoaded(code)
    )
  )
  const drawerRef = ref<ArtDrawerExpose<OpenData>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const context = shallowRef<Context>()
  const mode = ref<OpenData['mode']>('create')
  const isMobile = useBreakpoints({ sm: 640 }).smaller('sm')
  const loadError = ref('')
  const openData = shallowRef<OpenData>()
  let loadRequest = 0
  const lines = ref<DraftLine[]>([])
  const importing = ref(false)
  const parsing = ref(false)
  const documentRows = ref<WmsCountAdjustmentRow[]>([])
  const documentTypes = ref<WmsInitializationOption[]>([])
  const businessTypes = ref<WmsInitializationOption[]>([])
  const projects = ref<WmsProject[]>([])
  const units = ref<WmsUnitOption[]>([])
  const warehouses = ref<WmsWarehouse[]>([])
  const suppliers = ref<WmsInitializationOption[]>([])
  const customers = ref<WmsInitializationOption[]>([])
  const organizations = ref<WmsInventoryOrganization[]>([])
  const availableOrganizations = computed(() => organizations.value.filter((row) => row.enabledOn))
  const businessMenuId = ref('')
  const today = () => new Date().toISOString().slice(0, 10)
  const form = ref({
    id: '',
    documentNo: '保存后自动生成',
    organizationId: '',
    documentTypeId: '',
    businessTypeId: '',
    businessDate: today(),
    accountingDate: today(),
    keeperId: '',
    remark: ''
  })
  const title = computed(() => (props.kind === 'gain' ? '盘盈单' : '盘亏单'))
  const kind = computed(() => props.kind)
  const selectedMaterialIds = computed(() => lines.value.map((row) => row.materialId))
  const selectedMaterials = computed(() =>
    lines.value.map((row) => row.material).filter((row): row is WmsMaterialOption => Boolean(row))
  )
  const warehouseOptions = computed(() =>
    warehouses.value.filter(
      (row) => row.organizationId === form.value.organizationId && row.status === 'enabled'
    )
  )
  const stockTypes = computed(() => userStore.getDictMap.wmsCountStockType ?? [])
  const stockStatusLabels: Record<string, string> = {
    available: '可用',
    scrap: '报废',
    defective: '不良',
    frozen: '冻结'
  }
  const ownerTypeLabels: Record<string, string> = {
    self: '自有',
    supplier: '供应商',
    customer: '客户'
  }
  const firstDocumentRow = computed(() => documentRows.value[0])
  const viewData = computed(() => ({
    documentNo: form.value.documentNo,
    organization: organizationLabel(form.value.organizationId),
    documentType:
      firstDocumentRow.value?.documentTypeName ||
      optionName(documentTypes.value, form.value.documentTypeId),
    businessType:
      firstDocumentRow.value?.businessTypeName ||
      optionName(businessTypes.value, form.value.businessTypeId),
    businessDate: form.value.businessDate,
    accountingDate: form.value.accountingDate,
    keeper: firstDocumentRow.value?.headerKeeperName || '未指定',
    status: statusLabel(firstDocumentRow.value?.status),
    remark: form.value.remark || '—'
  }))
  const viewItems: ArtDescriptionItem<typeof viewData.value>[] = [
    { key: 'documentNo', label: '单据编号', field: 'documentNo', copyable: true },
    { key: 'organization', label: '库存组织', field: 'organization' },
    { key: 'documentType', label: '单据类型', field: 'documentType' },
    { key: 'businessType', label: '业务类型', field: 'businessType' },
    { key: 'businessDate', label: '业务日期', field: 'businessDate' },
    { key: 'accountingDate', label: '记账日期', field: 'accountingDate' },
    { key: 'keeper', label: '仓管员', field: 'keeper' },
    { key: 'status', label: '单据状态', field: 'status' },
    { key: 'remark', label: '备注', field: 'remark', span: 2 }
  ]
  const materialColumns: DataSelectColumn[] = [
    { prop: 'materialCode', label: '物料编码', minWidth: 150 },
    { prop: 'materialName', label: '物料名称', minWidth: 190 },
    { prop: 'description', label: '物料描述', minWidth: 210 },
    { prop: 'specificationModel', label: '规格型号', minWidth: 140 }
  ]
  const headerItems = computed<FormItem[]>(() => [
    { key: 'documentNo', label: '单据编号', type: 'input', props: { disabled: true } },
    {
      key: 'organizationId',
      label: '库存组织',
      type: 'treeSelect',
      options: availableOrganizations.value,
      valueField: 'id',
      labelField: 'organizationName',
      childrenField: 'children',
      labelFn: (row) => `${row.organizationName ?? ''} · ${row.organizationCode ?? ''}`,
      props: {
        filterable: true,
        checkStrictly: true,
        defaultExpandAll: true,
        renderAfterExpand: false,
        onChange: onOrganizationChange
      }
    },
    {
      key: 'documentTypeId',
      label: '单据类型',
      type: 'select',
      options: documentTypes.value.map((row) => ({ label: row.name, value: row.id })),
      props: { filterable: true, onChange: selectDefaultBusinessType }
    },
    {
      key: 'businessTypeId',
      label: '业务类型',
      type: 'select',
      options: businessTypes.value
        .filter((row) =>
          isWmsBusinessTypeAvailable(row, form.value.documentTypeId, businessMenuId.value)
        )
        .map((row) => ({ label: row.name, value: row.id })),
      props: { filterable: true }
    },
    {
      key: 'businessDate',
      label: '业务日期',
      type: 'date',
      props: { valueFormat: 'YYYY-MM-DD', class: 'w-full!' }
    },
    {
      key: 'accountingDate',
      label: '记账日期',
      type: 'date',
      props: { valueFormat: 'YYYY-MM-DD', disabled: true, class: 'w-full!' }
    },
    { key: 'keeperId', label: '仓管员', type: 'slot' },
    {
      key: 'remark',
      label: '备注',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 2, maxlength: 500, showWordLimit: true }
    }
  ])
  const rules = {
    organizationId: [{ required: true, message: '请选择库存组织', trigger: 'change' }],
    documentTypeId: [{ required: true, message: '请选择单据类型', trigger: 'change' }],
    businessTypeId: [{ required: true, message: '请选择业务类型', trigger: 'change' }],
    businessDate: [{ required: true, message: '请选择业务日期', trigger: 'change' }]
  }
  function numberText(value: number | null | undefined): string {
    return Number(value || 0).toFixed(4)
  }
  function signedVarianceText(value: number): string {
    const quantity = Number(value || 0)
    return `${props.kind === 'loss' ? -Math.abs(quantity) : Math.abs(quantity)}`
  }
  function moneyText(value: number): string {
    return Number(value || 0).toFixed(2)
  }
  function stockTypeLabel(value: string): string {
    return (
      stockTypes.value.find((item) => item.value === value)?.label ||
      WMS_STOCK_TYPE_LABELS[value] ||
      value ||
      '—'
    )
  }
  function stockStatusLabel(value: string): string {
    return stockStatusLabels[value] || value || '—'
  }
  function ownerTypeLabel(value: string): string {
    return ownerTypeLabels[value] || value || '—'
  }
  function optionName(options: WmsInitializationOption[], id: string): string {
    return options.find((item) => item.id === id)?.name || '—'
  }
  function organizationLabel(id: string): string {
    const item = organizations.value.find((row) => row.id === id)
    return item ? `${item.organizationName} · ${item.organizationCode}` : '—'
  }
  function statusLabel(value?: string): string {
    return value === 'approved' ? '已审核' : value === 'submitted' ? '已提交' : '暂存'
  }
  function countedQuantity(value: unknown): number {
    const row = value as DraftLine
    return props.kind === 'gain'
      ? row.bookQuantity + row.varianceQuantity
      : Math.max(0, row.bookQuantity - row.varianceQuantity)
  }
  function unitName(id: string): string {
    return id
      ? formatUnitDisplayName(units.value.find((item) => item.id === id)?.unitName, '') || '—'
      : '—'
  }
  function ownerOptions(ownerType: DraftLine['ownerType']): WmsInitializationOption[] {
    return ownerType === 'supplier'
      ? suppliers.value
      : ownerType === 'customer'
        ? customers.value
        : []
  }
  function lineCellClassName({ column }: { column: { property?: string } }): string {
    return column.property === 'varianceQuantity' ? 'count-variance-cell' : ''
  }
  function viewLineCellClassName({ column }: { column: { property?: string } }): string {
    return column.property === 'varianceQuantity' ? 'count-variance-cell' : ''
  }
  function syncHeaderKeeper(): void {
    for (const row of lines.value) if (!row.keeperId) row.keeperId = form.value.keeperId
  }
  function selectDefaultBusinessType(): void {
    const available = businessTypes.value.filter((row) =>
      isWmsBusinessTypeAvailable(row, form.value.documentTypeId, businessMenuId.value)
    )
    if (!available.some((row) => row.id === form.value.businessTypeId))
      form.value.businessTypeId =
        available.find((row) => row.isDefault)?.id || available[0]?.id || ''
  }
  function onOrganizationChange(): void {
    for (const row of lines.value) {
      row.warehouseId = ''
      row.binId = ''
      row.bins = []
    }
  }
  function newLine(material: WmsMaterialOption): DraftLine {
    const warehouse = warehouseOptions.value[0]
    return {
      key: crypto.randomUUID(),
      materialId: material.id,
      material,
      projectId: '',
      constructionNo: '',
      gift: false,
      inventoryUnitId: material.inventoryUnitId || material.baseUnitId || units.value[0]?.id || '',
      bookQuantity: 0,
      varianceQuantity: 1,
      baseUnitId: material.baseUnitId || material.inventoryUnitId || '',
      unitPrice: 0,
      batchNo: '',
      warehouseId: warehouse?.id || '',
      binId: '',
      bins: [],
      stockType: 'normal',
      ownerType: 'self',
      ownerId: '',
      stockStatus: 'available',
      keeperId: form.value.keeperId,
      auxiliaryUnitId: material.auxiliaryUnitId || '',
      auxiliaryQuantity: 0,
      auxiliaryUnit2Id: material.auxiliaryUnit2Id || '',
      auxiliaryQuantity2: 0,
      productionDate: '',
      expiryDate: '',
      trackingNo: '',
      sourceDocument: '',
      sourceLineNo: '',
      remark: ''
    }
  }
  async function materialApi(params: DataSelectFetchParams) {
    return context.value?.tenantId
      ? fetchWmsMaterialOptions(
          context.value.tenantId,
          params.keyword,
          params.page,
          params.pageSize,
          false,
          getMaterialCategoryIds(materialCategories.value, String(params.filters.categoryId || ''))
        )
      : { data: [], total: 0 }
  }
  function onMaterialsSelected(rows: DataSelectRecord[]): void {
    const materials = rows.filter(
      (row): row is WmsMaterialOption =>
        typeof row.id === 'string' && typeof row.materialCode === 'string'
    )
    const previous = new Map(lines.value.map((row) => [row.materialId, row]))
    lines.value = materials.map((item) => previous.get(item.id) || newLine(item))
  }
  function onImportParsing(value: boolean): void {
    parsing.value = value
    drawerRef.value?.setOptions({
      confirmDisabled: parsing.value || importing.value || Boolean(loadError.value)
    })
  }
  async function importLines(rows: Array<Record<string, unknown>>): Promise<void> {
    if (importing.value || mode.value === 'view' || !context.value?.tenantId) return
    if (!rows.length || rows.length > 500) {
      ElMessage.warning('请选择包含 1 至 500 行明细的文件；必填列为物料编码、数量')
      return
    }
    const request = loadRequest
    const tenantId = context.value.tenantId
    importing.value = true
    drawerRef.value?.setOptions({ confirmDisabled: true })
    try {
      const prepared = await prepareWmsMaterialImport(
        rows,
        (code) => fetchWmsMaterialImportReference(tenantId, code),
        () => request === loadRequest
      )
      if (!prepared) return
      const imported = prepared.map((item) => ({
        ...newLine(item.material),
        varianceQuantity: item.quantity,
        batchNo: item.batchNo,
        remark: item.remark
      }))
      if (request !== loadRequest) return
      lines.value.push(...imported)
      ElMessage.success(`已导入 ${imported.length} 行，请核对仓库、仓位、货主和单价后保存`)
    } catch (error) {
      if (request === loadRequest)
        notifyFriendlyError(error, '导入失败，请检查物料编码、数量和网络后重试')
    } finally {
      if (request === loadRequest) {
        importing.value = false
        drawerRef.value?.setOptions({
          confirmDisabled: parsing.value || importing.value || Boolean(loadError.value)
        })
      }
    }
  }
  function removeLine(key: string): void {
    lines.value = lines.value.filter((row) => row.key !== key)
  }
  const loadRowBins = useWarehouseRowBinLoader(
    () => lines.value,
    () => loadRequest,
    (row) => row.warehouseId,
    fetchWmsBins,
    (row, bins) => {
      row.bins = bins
    }
  )
  async function loadBins(value: unknown): Promise<void> {
    const row = value as DraftLine
    row.binId = ''
    await loadRowBins(row)
  }
  function rowMaterial(row: WmsCountAdjustmentRow): WmsMaterialOption {
    return {
      id: row.materialId,
      materialCode: row.materialCode,
      materialName: row.materialName,
      description: row.materialDescription,
      specificationModel: row.specificationModel,
      serialManagementEnabled: false,
      inventoryUnitId: row.inventoryUnitId,
      baseUnitId: row.baseUnitId,
      auxiliaryUnitId: row.auxiliaryUnitId,
      auxiliaryUnit2Id: row.auxiliaryUnit2Id,
      unitConversions: []
    }
  }
  async function loadDocument(id: string, request: number): Promise<void> {
    const rows = await fetchWmsCountAdjustment(id)
    if (request !== loadRequest) return
    documentRows.value = rows
    const first = rows[0]
    if (!first) throw new Error(`${title.value}不存在`)
    Object.assign(form.value, {
      id: first.documentId,
      documentNo: first.documentNo,
      organizationId: first.organizationId,
      documentTypeId: first.documentTypeId,
      businessTypeId: first.businessTypeId,
      businessDate: first.businessDate,
      accountingDate: first.accountingDate,
      keeperId: first.headerKeeperId || '',
      remark: first.documentRemark || ''
    })
    const loadedLines = await Promise.all(
      rows.map(async (row) => ({
        key: crypto.randomUUID(),
        materialId: row.materialId,
        material: rowMaterial(row),
        projectId: row.projectId || '',
        constructionNo: row.constructionNo || '',
        gift: row.gift,
        inventoryUnitId: row.inventoryUnitId,
        bookQuantity: Number(row.bookQuantity),
        varianceQuantity: Math.abs(Number(row.varianceQuantity)),
        baseUnitId: row.baseUnitId || '',
        unitPrice: Number(row.unitPrice),
        batchNo: row.batchNo || '',
        warehouseId: row.warehouseId,
        binId: row.binId || '',
        bins: await fetchWmsBins(row.warehouseId),
        stockType: row.stockType,
        ownerType: row.ownerType,
        ownerId: row.ownerId || '',
        stockStatus: row.stockStatus,
        keeperId: row.keeperId || '',
        auxiliaryUnitId: row.auxiliaryUnitId || '',
        auxiliaryQuantity: Number(row.auxiliaryQuantity || 0),
        auxiliaryUnit2Id: row.auxiliaryUnit2Id || '',
        auxiliaryQuantity2: Number(row.auxiliaryQuantity2 || 0),
        productionDate: row.productionDate || '',
        expiryDate: row.expiryDate || '',
        trackingNo: row.trackingNo || '',
        sourceDocument: row.sourceDocument || '',
        sourceLineNo: row.sourceLineNo || '',
        remark: row.lineRemark || ''
      }))
    )
    if (request === loadRequest) lines.value = loadedLines
  }
  async function loadOptions(tenantId: string, request: number): Promise<void> {
    const [
      docRows,
      businessRows,
      projectRows,
      unitRows,
      warehouseRows,
      supplierRows,
      customerRows,
      orgPage,
      menuId,
      categories
    ] = await Promise.all([
      fetchWmsInitialDocumentTypes(
        tenantId,
        props.kind === 'gain' ? 'WmsCountGain' : 'WmsCountLoss'
      ),
      fetchWmsInitialOptions('mdm_business_type', tenantId),
      fetchWmsProjects(tenantId),
      fetchWmsUnitOptions(tenantId),
      fetchWmsWarehouses(tenantId),
      fetchWmsInitialOptions('mdm_supplier', tenantId),
      fetchWmsInitialOptions('mdm_customer', tenantId),
      fetchWmsInventoryOrganizations({ tenantId, enabled: 'enabled', current: 1, size: 2000 }),
      fetchWmsInitialMenuId(props.kind === 'gain' ? 'WmsCountGain' : 'WmsCountLoss'),
      fetchWmsMaterialCategories(tenantId)
    ])
    if (request !== loadRequest) return
    documentTypes.value = docRows
    materialCategories.value = categories
    businessTypes.value = businessRows
    projects.value = projectRows
    units.value = unitRows
    warehouses.value = warehouseRows
    suppliers.value = supplierRows
    customers.value = customerRows
    organizations.value = orgPage.data
    businessMenuId.value = menuId
  }
  async function save(): Promise<boolean> {
    if (loadError.value || importing.value || parsing.value) return false
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (!lines.value.length) {
        ElMessage.warning('请至少选择一条物料')
        return false
      }
      if (
        lines.value.some(
          (row) =>
            !row.inventoryUnitId ||
            !Number.isFinite(row.varianceQuantity) ||
            row.varianceQuantity <= 0 ||
            !row.warehouseId
        )
      ) {
        ElMessage.warning(`请完整填写物料、${title.value.slice(0, 2)}数量和仓库`)
        return false
      }
      for (const [index, row] of lines.value.entries()) {
        if (row.ownerType !== 'self' && !row.ownerId) {
          ElMessage.warning(
            `第 ${(index + 1) * 10} 行请选择${row.ownerType === 'supplier' ? '供应商' : '客户'}货主`
          )
          return false
        }
        if (!Number.isFinite(row.unitPrice) || row.unitPrice < 0) {
          ElMessage.warning(`第 ${(index + 1) * 10} 行请填写不小于零的有效单价`)
          return false
        }
      }
      await saveWmsCountAdjustment({
        id: mode.value === 'edit' ? form.value.id : undefined,
        tenantId: context.value?.tenantId,
        organizationId: form.value.organizationId,
        kind: props.kind,
        documentTypeId: form.value.documentTypeId,
        businessTypeId: form.value.businessTypeId,
        businessDate: form.value.businessDate,
        keeperId: form.value.keeperId || null,
        remark: normalizeNullableText(form.value.remark),
        lines: lines.value.map((row) => ({
          materialId: row.materialId,
          projectId: row.projectId || null,
          constructionNo: normalizeNullableText(row.constructionNo),
          gift: row.gift,
          inventoryUnitId: row.inventoryUnitId,
          varianceQuantity: row.varianceQuantity,
          baseUnitId: row.baseUnitId || null,
          unitPrice: row.unitPrice,
          batchNo: normalizeNullableText(row.batchNo),
          warehouseId: row.warehouseId,
          binId: row.binId || null,
          stockType: row.stockType,
          ownerType: row.ownerType,
          ownerId: row.ownerType === 'self' ? null : row.ownerId || null,
          stockStatus: row.stockStatus,
          keeperId: row.keeperId || form.value.keeperId || null,
          auxiliaryUnitId: row.auxiliaryUnitId || null,
          auxiliaryQuantity: row.auxiliaryQuantity || null,
          auxiliaryUnit2Id: row.auxiliaryUnit2Id || null,
          auxiliaryQuantity2: row.auxiliaryQuantity2 || null,
          productionDate: row.productionDate || null,
          expiryDate: row.expiryDate || null,
          trackingNo: normalizeNullableText(row.trackingNo),
          sourceDocument: normalizeNullableText(row.sourceDocument),
          sourceLineNo: normalizeNullableText(row.sourceLineNo),
          remark: normalizeNullableText(row.remark)
        }))
      })
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '盘点调整提交失败，请检查填写内容和网络后重试')
      return false
    }
  }
  async function handleOpen(data: OpenData): Promise<void> {
    loadRequest += 1
    importing.value = false
    parsing.value = false
    openData.value = data
    loadError.value = ''
    context.value = { tenantId: data.tenantId }
    mode.value = data.mode
    lines.value = []
    documentRows.value = []
    Object.assign(form.value, {
      id: '',
      documentNo: '保存后自动生成',
      organizationId: '',
      documentTypeId: '',
      businessTypeId: '',
      businessDate: today(),
      accountingDate: today(),
      keeperId: '',
      remark: ''
    })
    await drawerRef.value?.handleOpen(data, {
      title:
        data.mode === 'view'
          ? `查看${title.value}`
          : data.mode === 'edit'
            ? `编辑${title.value}`
            : data.mode === 'copy'
              ? `复制${title.value}`
              : `新增${title.value}`,
      subtitle: '暂存 → 提交 → 审核',
      showFooter: data.mode !== 'view',
      confirmText: data.mode === 'copy' ? '保存副本' : '保存',
      onConfirm: save,
      loading: true,
      confirmDisabled: true,
      onOpen: reloadDocument,
      onClose: () => {
        loadRequest += 1
        importing.value = false
        parsing.value = false
      }
    })
  }
  async function reloadDocument(): Promise<void> {
    const data = openData.value
    if (!data) return
    const request = ++loadRequest
    loadError.value = ''
    drawerRef.value?.setLoading(true)
    drawerRef.value?.setOptions({ confirmDisabled: true })
    try {
      if (!data.tenantId) throw new Error('缺少租户')
      await loadOptions(data.tenantId, request)
      if (request !== loadRequest) return
      form.value.organizationId =
        availableOrganizations.value.find((row) => row.isDefault)?.id ||
        availableOrganizations.value[0]?.id ||
        ''
      form.value.documentTypeId = documentTypes.value.find((row) => row.isDefault)?.id || ''
      selectDefaultBusinessType()
      if (data.documentId) {
        await loadDocument(data.documentId, request)
        if (request !== loadRequest) return
        if (data.mode === 'copy') {
          form.value.id = ''
          form.value.documentNo = '保存后自动生成'
          form.value.accountingDate = today()
        }
      }
      await nextTick()
      if (request !== loadRequest) return
      formRef.value?.clearValidate()
    } catch (error) {
      if (request !== loadRequest) return
      loadError.value = '请重新加载单据资料；如仍失败，请检查网络和当前单据的查看权限。'
      notifyFriendlyError(error, '单据资料加载失败，请重试')
    } finally {
      if (request === loadRequest) {
        drawerRef.value?.setLoading(false)
        drawerRef.value?.setOptions({
          confirmDisabled: parsing.value || importing.value || Boolean(loadError.value)
        })
      }
    }
  }
  defineExpose({ handleOpen })
</script>

<style scoped>
  :deep(.document-header-descriptions .el-descriptions__table) {
    table-layout: fixed;
  }

  :deep(.count-line-table .el-input-number),
  :deep(.count-line-table .el-select),
  :deep(.count-line-table .el-date-editor) {
    width: 100%;
  }

  :deep(td.el-table__cell.count-variance-cell) {
    background-color: var(--el-color-warning-light-9) !important;
  }

  :deep(td.el-table__cell.count-variance-cell .el-input__inner),
  :deep(td.el-table__cell.count-variance-cell .el-input-number__decrease),
  :deep(td.el-table__cell.count-variance-cell .el-input-number__increase) {
    font-weight: 800;
    color: var(--el-color-danger);
  }

  .count-variance-text {
    font-weight: 800;
    color: var(--el-color-danger);
  }
</style>
