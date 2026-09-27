<template>
  <ArtDrawer
    ref="drawerRef"
    :size="isMobile ? '100%' : '88%'"
    :show-footer="mode !== 'view'"
    show-fullscreen-button
  >
    <div class="min-w-0 space-y-4">
      <ArtEntitySummary
        :icon="config.icon"
        :title="form.documentNo || `${mode === 'copy' ? '复制' : '新增'}${title}`"
        :description="
          mode === 'view'
            ? '核对单据表头、物料明细与库存办理结果。'
            : isFinished
              ? '选择生产工单与成品明细，核对仓位和数量后暂存。审核后办理库存过账。'
              : '先填写单据表头，再从库存批次、物料编码或生产工单 BOM 选择明细。保存时生成月度三位流水号。'
        "
      >
        <template #aside>
          <ElTag
            :type="
              form.status === 'approved'
                ? 'success'
                : form.status === 'submitted'
                  ? 'warning'
                  : 'info'
            "
          >
            {{ documentStatusLabel }}
          </ElTag>
        </template>
      </ArtEntitySummary>
      <ElAlert v-if="optionError" type="error" :closable="false" show-icon>
        基础资料加载失败，请重试后再保存。
        <ElButton link type="primary" @click="loadOptions">重新加载</ElButton>
      </ElAlert>
      <ElAlert
        v-if="mode !== 'view' && initializationWarning"
        type="warning"
        :closable="false"
        show-icon
      >
        {{ initializationWarning }}
      </ElAlert>
      <ElAlert
        v-else-if="mode !== 'view' && props.kind === 'return'"
        type="info"
        :closable="false"
        show-icon
      >
        生产退料的申请数量与实发数量以负数登记。下推时系统按绝对值增加库存。
      </ElAlert>
      <ElAlert
        v-else-if="mode !== 'view' && props.kind === 'finished_return'"
        type="info"
        :closable="false"
        show-icon
      >
        从同一生产工单已过账的完工入库明细选单。退库数量以负数登记，过账时核减成品库存和工单已入库数量。
      </ElAlert>
      <ElAlert
        v-else-if="mode !== 'view' && props.kind === 'finished_inbound'"
        type="info"
        :closable="false"
        show-icon
      >
        可按工单、已确认排包单或物料带入。入库过账数量不能超过生产工单已报工未入库数量。
      </ElAlert>
      <ArtSectionCard
        title="单据表头"
        :subtitle="
          mode === 'view'
            ? '单据来源、仓储范围与业务状态'
            : '仓库决定库存组织及租户；项目选定后自动带入客户。'
        "
      >
        <ArtDescriptions v-if="mode === 'view'" :data="headerViewData" :items="headerViewItems">
          <template #item-status>
            <ElTag
              :type="
                form.status === 'approved'
                  ? 'success'
                  : form.status === 'submitted'
                    ? 'warning'
                    : 'info'
              "
            >
              {{ documentStatusLabel }}
            </ElTag>
          </template>
          <template #item-materialStatus>
            <ElTag
              :type="
                form.materialStatus === 'fulfilled'
                  ? 'success'
                  : form.materialStatus === 'partial'
                    ? 'warning'
                    : 'info'
              "
            >
              {{ materialStatusLabel }}
            </ElTag>
          </template>
        </ArtDescriptions>
        <ArtForm
          v-else
          ref="formRef"
          v-model="form"
          :items="headerItems"
          :rules="headerRules"
          :validate-on-rule-change="false"
          :span="8"
          :gutter="18"
          label-position="top"
          :show-reset="false"
          :show-submit="false"
        >
          <template #documentNo>
            <div class="production-readonly-field" :class="{ 'is-placeholder': !form.documentNo }">
              <ArtSvgIcon icon="ri:hashtag" />
              <span>{{ form.documentNo || '保存后自动生成' }}</span>
            </div>
          </template>
          <template #projectId>
            <ArtTableSingleSelect
              :model-value="form.projectId || undefined"
              :selected-data="selectedProject"
              :data="projects"
              :columns="projectColumns"
              row-key="id"
              label-key="projectName"
              description-key="projectCode"
              title="参选销售项目"
              placeholder="选择项目"
              :disabled="!form.tenantId"
              @update:selected-data="onProjectSelected"
            />
          </template>
          <template #customerId>
            <div class="production-readonly-field" :class="{ 'is-placeholder': !customerName }">
              <ArtSvgIcon icon="ri:building-2-line" />
              <span>{{ customerName || '选择项目后自动带入' }}</span>
            </div>
          </template>
          <template #applicantId>
            <ArtEmployeeSelect
              :model-value="form.applicantId || undefined"
              :selected-data="selectedApplicant"
              :tenant-id="form.tenantId || undefined"
              title="选择领料申请人"
              :disabled="!form.tenantId"
              @change="onApplicantChange"
            />
          </template>
          <template #keeperId>
            <ArtEmployeeSelect
              :model-value="form.keeperId || undefined"
              :selected-data="selectedKeeper"
              :tenant-id="form.tenantId || undefined"
              title="选择仓管员"
              :disabled="!form.tenantId"
              @change="onKeeperChange"
            />
          </template>
          <template #status>
            <div class="production-readonly-field">
              <ArtSvgIcon icon="ri:file-list-3-line" />
              <ElTag
                size="small"
                effect="light"
                :type="
                  form.status === 'approved'
                    ? 'success'
                    : form.status === 'submitted'
                      ? 'warning'
                      : 'info'
                "
                >{{ documentStatusLabel }}</ElTag
              >
            </div>
          </template>
          <template #materialStatus>
            <div class="production-readonly-field">
              <ArtSvgIcon icon="ri:progress-3-line" />
              <ElTag
                size="small"
                effect="light"
                :type="
                  form.materialStatus === 'fulfilled'
                    ? 'success'
                    : form.materialStatus === 'pending'
                      ? 'info'
                      : 'warning'
                "
                >{{ materialStatusLabel }}</ElTag
              >
            </div>
          </template>
        </ArtForm>
      </ArtSectionCard>
      <ArtSectionCard
        :title="config.detailLabel"
        :subtitle="`共 ${lines.length} 行 · ${isFinished ? config.quantityLabel : '申请数量'} ${isFinished ? actualTotal.toFixed(4) : requestedTotal.toFixed(4)}${isFinished ? '' : ` · 实发数量 ${actualTotal.toFixed(4)}`}`"
        :empty="!lines.length"
        empty-title="尚未选择物料"
        :empty-description="
          props.kind === 'finished_inbound'
            ? '可按生产工单、排包单或物料编码批量带入。'
            : props.kind === 'finished_return'
              ? '从已过账的完工入库明细批量选单。'
              : '可从库存批次、物料编码或当前生产工单 BOM 批量带入。'
        "
      >
        <template #actions>
          <div v-if="mode !== 'view'" class="flex flex-wrap items-center justify-end gap-2">
            <ArtTableMultipleSelect
              v-if="!isFinished"
              v-model="stockPickerIds"
              v-model:selected-data="stockPickerRows"
              class="w-auto! shrink-0"
              title="库存列表"
              subtitle="可按物料与批号检索并批量参选。"
              search-placeholder="搜索批号或备注"
              row-key="id"
              label-key="batchLabel"
              :columns="stockColumns"
              :api-fn="stockApi"
              :disabled="!form.tenantId"
              @confirm="addStockRows"
            >
              <template #trigger="{ open }">
                <ElButton
                  v-auth="permission.Add"
                  type="primary"
                  :disabled="!form.tenantId"
                  @click="open"
                >
                  <ArtSvgIcon icon="ri:add-line" />新增
                </ElButton>
              </template>
            </ArtTableMultipleSelect>
            <ArtTableMultipleSelect
              v-if="!isFinished"
              v-model="bomPickerIds"
              v-model:selected-data="bomPickerSelected"
              class="w-auto! shrink-0"
              title="参选生产工单 BOM"
              subtitle="从已选择的生产工单 BOM 明细中批量带入物料。"
              row-key="key"
              label-key="materialName"
              :columns="bomColumns"
              :data="bomPickerData"
              :disabled="!form.workOrderId"
              @confirm="addBomRows"
            >
              <template #trigger="{ open }">
                <ElButton v-auth="permission.Select" :disabled="!form.workOrderId" @click="open"
                  ><ArtSvgIcon icon="ri:file-list-3-line" />选单</ElButton
                >
              </template>
            </ArtTableMultipleSelect>
            <ArtTableMultipleSelect
              v-if="props.kind === 'finished_inbound'"
              v-model="workOrderPickerIds"
              v-model:selected-data="workOrderPickerRows"
              class="w-auto! shrink-0"
              title="参选生产工单"
              subtitle="可批量选择已下达工单，生成对应成品明细。"
              row-key="id"
              label-key="workOrderNo"
              :columns="workOrderColumns"
              :data="workOrders"
              :disabled="!form.warehouseId"
              @confirm="addWorkOrderRows"
            >
              <template #trigger="{ open }">
                <ElButton
                  v-auth="permission.Select"
                  type="primary"
                  plain
                  :disabled="!form.warehouseId"
                  @click="open"
                >
                  <ArtSvgIcon icon="ri:file-list-3-line" />选生产工单
                </ElButton>
              </template>
            </ArtTableMultipleSelect>
            <ArtTableMultipleSelect
              v-if="props.kind === 'finished_inbound'"
              v-model="packPickerIds"
              v-model:selected-data="packPickerRows"
              class="w-auto! shrink-0"
              title="参选已确认排包单"
              subtitle="整包数量自动带入，过账时校验排包单。"
              row-key="id"
              label-key="packNo"
              :columns="packColumns"
              :data="packPickerData"
              :disabled="!form.workOrderId"
              @confirm="addPackRows"
            >
              <template #trigger="{ open }">
                <ElButton v-auth="permission.Select" :disabled="!form.workOrderId" @click="open">
                  <ArtSvgIcon icon="ri:archive-stack-line" />选排包单
                </ElButton>
              </template>
            </ArtTableMultipleSelect>
            <ArtTableMultipleSelect
              v-if="props.kind === 'finished_return'"
              v-model="inboundSourceIds"
              v-model:selected-data="inboundSourceRows"
              class="w-auto! shrink-0"
              title="参选完工入库明细"
              subtitle="同一生产工单可多选，退库数量不能超过来源入库数量。"
              search-placeholder="搜索入库单号、工单号或物料编码"
              row-key="id"
              label-key="documentNo"
              :columns="inboundSourceColumns"
              :api-fn="inboundSourceApi"
              :disabled="!form.tenantId"
              @confirm="addInboundSourceRows"
            >
              <template #trigger="{ open }">
                <ElButton
                  v-auth="permission.Select"
                  type="primary"
                  plain
                  :disabled="!form.tenantId"
                  @click="open"
                >
                  <ArtSvgIcon icon="ri:file-list-3-line" />选单
                </ElButton>
              </template>
            </ArtTableMultipleSelect>
            <ArtTableMultipleSelect
              v-if="props.kind !== 'finished_return'"
              v-model="materialPickerIds"
              v-model:selected-data="materialPickerRows"
              class="w-auto! shrink-0"
              title="数据来源：物料编码"
              subtitle="按物料编码、名称或描述检索并批量参选。"
              search-placeholder="搜索物料编码或名称"
              row-key="id"
              label-key="materialName"
              :columns="materialColumns"
              :api-fn="materialApi"
              :disabled="!form.tenantId || (isFinished && !form.workOrderId)"
              @confirm="addMaterialRows"
            >
              <template #trigger="{ open }">
                <ElButton
                  v-auth="permission.Add"
                  :disabled="!form.tenantId || (isFinished && !form.workOrderId)"
                  @click="open"
                  ><ArtSvgIcon icon="ri:box-3-line" />{{
                    isFinished ? '新增物料' : '选择物料'
                  }}</ElButton
                >
              </template>
            </ArtTableMultipleSelect>
            <ElButton
              v-auth="permission.Copy"
              :disabled="selectedLineIndexes.length !== 1"
              @click="copySelectedLine"
            >
              <ArtSvgIcon icon="ri:file-copy-line" />复制
            </ElButton>
            <ElButton
              v-auth="permission.Delete"
              type="danger"
              plain
              :disabled="!selectedLineIndexes.length"
              @click="deleteSelectedLines"
            >
              <ArtSvgIcon icon="ri:delete-bin-line" />批量删除
            </ElButton>
            <span v-if="props.kind !== 'finished_return'" v-auth="permission.Import">
              <ArtExcelImport
                accept=".xlsx,.xls,.csv"
                :disabled="!form.tenantId"
                :button-props="{ type: 'success', plain: true }"
                icon="ri:upload-2-line"
                @import-success="importLines"
                @import-error="onImportError"
                >导入明细</ArtExcelImport
              >
            </span>
          </div>
        </template>
        <div v-if="lines.length" class="overflow-x-auto">
          <ArtTable
            :data="lines"
            :columns="lineColumns"
            :pagination="false"
            :cell-class-name="quantityCellClass"
            row-key="lineNo"
            table-layout="fixed"
            @selection-change="onLineSelectionChange"
          >
            <template #materialId="{ row }">
              <strong
                class="block truncate text-sm"
                :title="row.material?.description || row.material?.materialName || '物料'"
                >{{ row.material?.description || row.material?.materialName || '物料' }}</strong
              >
              <small
                class="block truncate text-[var(--el-text-color-secondary)]"
                :title="row.material?.materialCode || '—'"
                >{{ row.material?.materialCode || '—' }}</small
              >
              <small
                v-if="lineUnitConversionError(row)"
                class="flex items-center gap-1 text-[var(--el-color-warning)]"
                :title="lineUnitConversionError(row)"
              >
                <ArtSvgIcon icon="ri:error-warning-line" /> 单位换算待配置
              </small>
            </template>
            <template #requestedQuantity="{ row }">
              <strong class="tabular-nums">{{ Number(row.requestedQuantity).toFixed(4) }}</strong>
            </template>
            <template #actualQuantity="{ row }">
              <strong class="tabular-nums">{{ Number(row.actualQuantity).toFixed(4) }}</strong>
            </template>
            <template #projectId="{ row }">{{ projectName(row.projectId) }}</template>
            <template #inventoryUnitId="{ row }">{{ unitName(row.inventoryUnitId) }}</template>
            <template #warehouseId="{ row }">{{ warehouseName(row.warehouseId) }}</template>
            <template #availableInventoryQuantity="{ row }">
              {{ Number(row.availableInventoryQuantity || 0).toFixed(4) }}
            </template>
            <template #operation="{ row }">
              <BusinessTableRowActions>
                <ArtButtonTable
                  :type="mode === 'view' ? 'view' : 'edit'"
                  :label="mode === 'view' ? '查看' : '编辑'"
                  :permission="mode === 'view' ? permission.View : permission.Edit"
                  @click="openLine(row.lineNo)"
                />
                <ArtButtonTable
                  v-if="mode !== 'view'"
                  type="delete"
                  label="删除"
                  :permission="permission.Delete"
                  @click="deleteLine(row.lineNo)"
                />
              </BusinessTableRowActions>
            </template>
          </ArtTable>
        </div>
      </ArtSectionCard>
    </div>
  </ArtDrawer>

  <ArtDialog ref="lineDialogRef" size="xl" :show-footer="mode !== 'view'">
    <div v-if="editLine" class="min-w-0 space-y-4">
      <ArtEntitySummary
        icon="ri:package-2-line"
        :title="`${editLine.material?.description || editLine.material?.materialName || '物料'} · 第 ${editLine.lineNo} 行`"
        :description="`${editLine.material?.materialCode || ''} · ${editLine.material?.specificationModel || '无规格型号'}`"
      />
      <ArtSectionCard title="物料与仓储信息" subtitle="数量、项目、批次、货权与追溯信息">
        <ElAlert
          v-if="mode !== 'view' && editLine && lineUnitConversionError(editLine)"
          type="warning"
          :closable="false"
          show-icon
          class="mb-4"
        >
          {{ lineUnitConversionError(editLine) }}
        </ElAlert>
        <ArtDescriptions
          v-if="mode === 'view'"
          :data="lineViewData"
          :items="lineViewItems"
          :columns="3"
        />
        <ArtForm
          v-else
          ref="lineFormRef"
          v-model="editLine"
          :items="lineItems"
          :rules="lineRules"
          :validate-on-rule-change="false"
          :span="8"
          :gutter="16"
          label-position="top"
          :show-reset="false"
          :show-submit="false"
        >
          <template #projectId>
            <ArtTableSingleSelect
              :model-value="editLine.projectId || undefined"
              :selected-data="selectedLineProject"
              :data="projects"
              :columns="projectColumns"
              row-key="id"
              label-key="projectName"
              description-key="projectCode"
              title="参选项目"
              placeholder="选择项目"
              @update:selected-data="onLineProjectSelected"
            />
          </template>
          <template #projectCode>
            <span class="flex min-h-9 items-center text-sm">{{
              projects.find((item) => item.id === editLine?.projectId)?.projectCode || '—'
            }}</span>
          </template>
          <template #sourceBatchId>
            <ArtTableSingleSelect
              :model-value="editLine.sourceBatchId || undefined"
              :selected-data="selectedLineBatch"
              :api-fn="lineStockApi"
              :columns="stockColumns"
              row-key="id"
              label-key="batchLabel"
              title="选择来源库存批次"
              placeholder="选择来源批次"
              @update:selected-data="onLineBatchSelected"
            />
          </template>
          <template #keeperId>
            <ArtEmployeeSelect
              :model-value="editLine.keeperId || undefined"
              :selected-data="selectedLineKeeper"
              :tenant-id="form.tenantId"
              title="选择明细仓管员"
              @change="onLineKeeperChange"
            />
          </template>
          <template #auxiliaryQuantity>
            <span class="flex min-h-9 items-center text-sm"
              >{{ editLine.auxiliaryQuantity ?? '—' }}
              {{ unitName(editLine.auxiliaryUnitId) }}</span
            >
          </template>
          <template #auxiliaryUnitId>
            <span class="flex min-h-9 items-center text-sm">{{
              unitName(editLine.auxiliaryUnitId)
            }}</span>
          </template>
          <template #auxiliaryQuantity2>
            <span class="flex min-h-9 items-center text-sm"
              >{{ editLine.auxiliaryQuantity2 ?? '—' }}
              {{ unitName(editLine.auxiliaryUnit2Id) }}</span
            >
          </template>
          <template #auxiliaryUnit2Id>
            <span class="flex min-h-9 items-center text-sm">{{
              unitName(editLine.auxiliaryUnit2Id)
            }}</span>
          </template>
        </ArtForm>
      </ArtSectionCard>
      <ElAlert v-if="isReturn" type="warning" :closable="false" show-icon>
        {{ config.quantityLabel }}必须为负数；良品退料为默认退料类型。
      </ElAlert>
      <ElAlert
        v-else-if="editLine.material?.serialManagementEnabled"
        type="info"
        :closable="false"
        show-icon
      >
        序列号物料下推前，需逐件选择与实发数量一致的来源 SN。
      </ElAlert>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import dayjs from 'dayjs'
  import { ElMessage } from 'element-plus'
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import { fetchGetOrganizationOptionsTree } from '@/api/system-manage'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtTableSingleSelect from '@/components/core/forms/art-data-select/table-single.vue'
  import ArtTableMultipleSelect from '@/components/core/forms/art-data-select/table-multiple.vue'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import ArtExcelImport from '@/components/core/forms/art-excel-import/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import type {
    DataSelectColumn,
    DataSelectFetchParams,
    DataSelectRecord
  } from '@/components/core/forms/art-data-select/types'
  import type { ColumnOption } from '@/types'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import { storeToRefs } from 'pinia'
  import { cloneDeep } from 'lodash-es'
  import { useBreakpoints } from '@vueuse/core'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import {
    fetchWmsBatchSerials,
    fetchWmsBins,
    fetchWmsInitialOptions,
    fetchWmsInventoryOrganizations,
    fetchWmsMaterialOptions,
    fetchWmsProductionBomItems,
    fetchWmsProductionBusinessTypes,
    fetchWmsProductionDocumentTypes,
    fetchWmsProductionEmployeesByIds,
    fetchWmsProductionMaterialDocument,
    fetchWmsProductionMaterialsByCodes,
    fetchWmsProductionMaterialsByIds,
    fetchWmsProductionProjects,
    fetchWmsFinishedInboundSourcePage,
    fetchWmsProductionStockPage,
    fetchWmsPackOptions,
    fetchWmsUnitOptions,
    fetchWmsWarehouses,
    fetchWmsWorkOrderOptions,
    saveWmsProductionMaterial,
    type WmsBatchSerial,
    type WmsBin,
    type WmsInitializationOption,
    type WmsInventoryOrganization,
    type WmsMaterialOption,
    type WmsProductionBomItem,
    type WmsProductionBusinessTypeOption,
    type WmsProductionDocumentTypeOption,
    type WmsFinishedInboundSourceOption,
    type WmsProductionMaterialDocument,
    type WmsProductionMaterialInput,
    type WmsProductionMaterialKind,
    type WmsProductionMaterialLine,
    type WmsProductionProjectOption,
    type WmsProductionStockOption,
    type WmsUnitOption,
    type WmsWarehouse,
    type WmsWorkOrderOption,
    type WmsPackOption
  } from '@wms/api'
  import { productionDocumentConfig } from './production-document-config'

  interface OpenData {
    mode: 'create' | 'edit' | 'copy' | 'view'
    documentId?: string
    importIntent?: boolean
    selectIntent?: boolean
  }
  type DraftLine = WmsProductionMaterialLine & {
    key: string
    remainingQuantity?: number
    serialText?: string
  }
  const props = defineProps<{ kind: WmsProductionMaterialKind }>()
  const emit = defineEmits<{ success: [] }>()
  const drawerRef = ref<ArtDrawerExpose<OpenData>>()
  const lineDialogRef = ref<ArtDialogExpose>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const lineFormRef = ref<InstanceType<typeof ArtForm>>()
  const mode = ref<OpenData['mode']>('create')
  const optionError = ref(false)
  const importIntent = ref(false)
  const selectIntent = ref(false)
  const currentDocument = shallowRef<WmsProductionMaterialDocument | null>(null)
  const organizations = ref<WmsInventoryOrganization[]>([])
  const organizationTree = ref<Api.SystemManage.OrganizationListItem[]>([])
  const warehouses = ref<WmsWarehouse[]>([])
  const projects = ref<WmsProductionProjectOption[]>([])
  const units = ref<WmsUnitOption[]>([])
  const bins = ref<WmsBin[]>([])
  const documentTypes = ref<WmsProductionDocumentTypeOption[]>([])
  const businessTypes = ref<WmsProductionBusinessTypeOption[]>([])
  const workOrders = ref<WmsWorkOrderOption[]>([])
  const suppliers = ref<WmsInitializationOption[]>([])
  const customers = ref<WmsInitializationOption[]>([])
  const bomItems = ref<WmsProductionBomItem[]>([])
  const packs = ref<WmsPackOption[]>([])
  const serials = ref<WmsBatchSerial[]>([])
  const lines = ref<DraftLine[]>([])
  const editLine = ref<DraftLine | null>(null)
  const selectedLineIndexes = ref<number[]>([])
  const selectedApplicant = ref<EmployeeIntegrationItem[]>([])
  const selectedKeeper = ref<EmployeeIntegrationItem[]>([])
  const selectedLineKeeper = ref<EmployeeIntegrationItem[]>([])
  const employees = ref<EmployeeIntegrationItem[]>([])
  const selectedLineBatch = ref<DataSelectRecord[]>([])
  const stockPickerIds = ref<string[]>([])
  const stockPickerRows = ref<DataSelectRecord[]>([])
  const bomPickerIds = ref<string[]>([])
  const bomPickerSelected = ref<DataSelectRecord[]>([])
  const materialPickerIds = ref<string[]>([])
  const materialPickerRows = ref<DataSelectRecord[]>([])
  const workOrderPickerIds = ref<string[]>([])
  const workOrderPickerRows = ref<DataSelectRecord[]>([])
  const packPickerIds = ref<string[]>([])
  const packPickerRows = ref<DataSelectRecord[]>([])
  const inboundSourceIds = ref<string[]>([])
  const inboundSourceRows = ref<DataSelectRecord[]>([])
  const returnTypeOptions = useDictionaryOptions('wmsProductionReturnType')
  const ownerTypeOptions = useDictionaryOptions('mdmBusinessOwnerType')
  const stockStatusOptions = useDictionaryOptions('wmsInitialStockCondition')
  const stockTypeOptions = useDictionaryOptions('wmsInitialStockType')
  const isMobile = useBreakpoints({ sm: 640 }).smaller('sm')
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const config = computed(() => productionDocumentConfig[props.kind])
  const isReturn = computed(() => config.value.negative)
  const isFinished = computed(() => config.value.finished)
  const isOutbound = computed(() => props.kind === 'issue' || props.kind === 'finished_return')
  const title = computed(() => config.value.title)
  const permission = computed(() => config.value.permissions)
  const form = reactive({
    id: '',
    tenantId: '',
    documentNo: '',
    documentTypeId: '',
    businessTypeId: '',
    organizationId: '',
    businessDate: dayjs().format('YYYY-MM-DD'),
    warehouseId: '',
    workOrderId: '',
    projectId: '',
    customerId: '',
    demandDate: '',
    applicantId: '',
    departmentId: '',
    keeperId: '',
    status: 'draft' as WmsProductionMaterialDocument['status'],
    materialStatus: 'pending' as WmsProductionMaterialDocument['materialStatus'],
    remark: ''
  })
  const documentStatusLabel = computed(
    () => ({ draft: '暂存', submitted: '已提交', approved: '已审核' })[form.status]
  )
  const materialStatusLabel = computed(
    () =>
      ({
        pending: config.value.pendingLabel,
        partial: config.value.partialLabel,
        fulfilled: config.value.completedLabel,
        void: '作废',
        closed: '关闭'
      })[form.materialStatus]
  )
  const selectedProject = computed(() =>
    projects.value.filter((item) => item.id === form.projectId)
  )
  const selectedLineProject = computed(() =>
    projects.value.filter((item) => item.id === editLine.value?.projectId)
  )
  const customerName = computed(
    () => projects.value.find((item) => item.id === form.projectId)?.customer?.customerName || ''
  )
  type OrganizationSelectNode = Omit<Api.SystemManage.OrganizationListItem, 'children'> & {
    organizationLabel: string
    disabled: boolean
    children?: OrganizationSelectNode[]
  }
  const organizationSelectTree = computed(() => {
    const selectableIds = new Set(
      organizations.value.filter((item) => item.initializationClosedAt).map((item) => item.id)
    )
    const decorate = (nodes: Api.SystemManage.OrganizationListItem[]): OrganizationSelectNode[] =>
      nodes.map((node) => ({
        ...node,
        organizationLabel: `${node.organizationName} · ${node.organizationCode}${node.id && selectableIds.has(node.id) ? '' : '（未结束初始化）'}`,
        disabled: !node.id || !selectableIds.has(node.id),
        children: node.children ? decorate(node.children) : undefined
      }))
    return decorate(organizationTree.value)
  })
  const departmentSelectTree = computed(() => {
    const selectableIds = new Set(organizations.value.map((item) => item.id))
    const decorate = (nodes: Api.SystemManage.OrganizationListItem[]): OrganizationSelectNode[] =>
      nodes
        .filter((node) => node.tenantId === form.tenantId)
        .map((node) => ({
          ...node,
          organizationLabel: node.organizationName,
          disabled: !node.id || !selectableIds.has(node.id),
          children: node.children ? decorate(node.children) : undefined
        }))
    return decorate(organizationTree.value)
  })
  const headerViewData = computed(() => {
    const lineWorkOrders = new Set(lines.value.map((line) => line.workOrderId).filter(Boolean))
    return {
      documentNo: form.documentNo,
      documentType:
        documentTypes.value.find((item) => item.id === form.documentTypeId)?.documentTypeName ||
        title.value,
      businessType:
        businessTypes.value.find((item) => item.id === form.businessTypeId)?.businessTypeName ||
        '—',
      organization:
        organizations.value.find((item) => item.id === form.organizationId)?.organizationName ||
        '—',
      businessDate: form.businessDate,
      warehouse: warehouseName(form.warehouseId),
      workOrder: form.workOrderId
        ? workOrders.value.find((item) => item.id === form.workOrderId)?.workOrderNo || '—'
        : lineWorkOrders.size > 1
          ? `${lineWorkOrders.size} 个生产工单`
          : '—',
      project: projectName(form.projectId),
      customer:
        customerName.value ||
        customers.value.find((item) => item.id === form.customerId)?.name ||
        '—',
      demandDate: form.demandDate || '—',
      applicant: employeeName(form.applicantId),
      department:
        organizations.value.find((item) => item.id === form.departmentId)?.organizationName || '—',
      keeper: employeeName(form.keeperId),
      status: form.status,
      materialStatus: form.materialStatus,
      remark: form.remark || '—'
    }
  })
  const headerViewItems = computed<ArtDescriptionItem<typeof headerViewData.value>[]>(() => [
    { key: 'documentNo', label: config.value.numberLabel, field: 'documentNo', copyable: true },
    { key: 'documentType', label: '单据类型', field: 'documentType' },
    { key: 'businessType', label: '业务类型', field: 'businessType' },
    { key: 'organization', label: '库存组织', field: 'organization' },
    { key: 'businessDate', label: '业务日期', field: 'businessDate' },
    { key: 'warehouse', label: '仓库', field: 'warehouse' },
    { key: 'workOrder', label: '生产工单', field: 'workOrder' },
    { key: 'project', label: '项目名称', field: 'project' },
    { key: 'customer', label: '客户', field: 'customer' },
    ...(!isFinished.value
      ? [
          { key: 'applicant', label: '申请人', field: 'applicant' },
          { key: 'department', label: '申请部门', field: 'department' }
        ]
      : []),
    ...(props.kind !== 'finished_return'
      ? [{ key: 'demandDate', label: '需求日期', field: 'demandDate' }]
      : []),
    { key: 'keeper', label: '仓管员', field: 'keeper' },
    { key: 'status', label: '单据状态', field: 'status' },
    {
      key: 'materialStatus',
      label: isFinished.value ? '办理状态' : isReturn.value ? '状态' : '领料状态',
      field: 'materialStatus'
    },
    { key: 'remark', label: '备注', field: 'remark', span: 3 }
  ])
  const eligibleWarehouses = computed(() =>
    warehouses.value.filter(
      (item) =>
        item.status === 'enabled' &&
        item.organizationId === form.organizationId &&
        item.tenantId === form.tenantId &&
        (!isFinished.value || item.warehouseType === 'finished')
    )
  )
  const initializationWarning = computed(() => {
    const selected = organizations.value.find((item) => item.id === form.organizationId)
    if (selected && !selected.initializationClosedAt)
      return `${selected.organizationName}尚未结束库存初始化，请先在“库存初始化”完成结束初始化后再保存单据。`
    if (
      organizations.value.some((item) => item.tenantId === form.tenantId) &&
      !organizations.value.some(
        (item) => item.tenantId === form.tenantId && item.initializationClosedAt
      )
    )
      return '当前租户没有已结束初始化的库存组织，请先完成库存初始化。'
    return ''
  })
  const requestedTotal = computed(() =>
    lines.value.reduce((total, line) => total + Number(line.requestedQuantity), 0)
  )
  const actualTotal = computed(() =>
    lines.value.reduce((total, line) => total + Number(line.actualQuantity), 0)
  )
  const projectColumns: DataSelectColumn[] = [
    { prop: 'projectCode', label: '项目编码', minWidth: 160 },
    { prop: 'projectName', label: '项目名称', minWidth: 220 },
    { prop: 'customerName', label: '客户', minWidth: 180 }
  ]
  const materialColumns: DataSelectColumn[] = [
    { prop: 'materialCode', label: '物料编码', minWidth: 160 },
    { prop: 'materialName', label: '物料名称', minWidth: 180 },
    { prop: 'description', label: '物料描述', minWidth: 220 },
    { prop: 'specificationModel', label: '规格型号', minWidth: 150 }
  ]
  const stockColumns: DataSelectColumn[] = [
    { prop: 'materialDescription', label: '物料描述', minWidth: 190 },
    { prop: 'materialCode', label: '物料编码', minWidth: 140 },
    { prop: 'specificationModel', label: '规格型号', minWidth: 130 },
    { prop: 'inventoryUnitName', label: '库存单位', width: 90 },
    { prop: 'quantity', label: '库存量', width: 90, align: 'right' },
    { prop: 'availableQuantity', label: '可用库存量', width: 105, align: 'right' },
    { prop: 'allocatedQuantity', label: '已分配量', width: 95, align: 'right' },
    { prop: 'batchNo', label: '批次', minWidth: 120 },
    { prop: 'unitCost', label: '单价', width: 90, align: 'right' },
    { prop: 'amount', label: '金额', width: 100, align: 'right' },
    { prop: 'warehouseName', label: '仓库', minWidth: 120 },
    { prop: 'binName', label: '库位', minWidth: 100 },
    { prop: 'projectName', label: '项目全称', minWidth: 170 }
  ]
  const bomColumns: DataSelectColumn[] = [
    { prop: 'workOrderNo', label: '生产工单', minWidth: 150 },
    { prop: 'materialCode', label: '物料编码', minWidth: 150 },
    { prop: 'materialName', label: '物料描述', minWidth: 230 },
    { prop: 'requiredQuantity', label: '需求数量', width: 110, align: 'right' }
  ]
  const workOrderColumns: DataSelectColumn[] = [
    { prop: 'workOrderNo', label: '生产工单', minWidth: 170 },
    { prop: 'materialName', label: '成品物料', minWidth: 220 },
    { prop: 'orderQuantity', label: '工单数量', width: 105, align: 'right' },
    { prop: 'completedQuantity', label: '已报工', width: 95, align: 'right' },
    { prop: 'warehousedQuantity', label: '已入库', width: 95, align: 'right' }
  ]
  const packColumns: DataSelectColumn[] = [
    { prop: 'packNo', label: '排包单号', minWidth: 190 },
    { prop: 'quantity', label: '整包数量', width: 120, align: 'right' }
  ]
  const packPickerData = computed(() =>
    packs.value.map((item) => ({
      ...item,
      quantity: item.items.reduce((total, entry) => total + Number(entry.pieces), 0)
    }))
  )
  const inboundSourceColumns: DataSelectColumn[] = [
    { prop: 'documentNo', label: '完工入库单号', minWidth: 180 },
    { prop: 'workOrderNo', label: '生产工单', minWidth: 170 },
    { prop: 'materialCode', label: '物料编码', minWidth: 140 },
    { prop: 'materialDescription', label: '物料描述', minWidth: 210 },
    { prop: 'batchNo', label: '批号', minWidth: 130 },
    { prop: 'inboundQuantity', label: '入库数量', width: 105, align: 'right' },
    { prop: 'availableQuantity', label: '可用数量', width: 105, align: 'right' }
  ]
  const bomPickerData = computed(() =>
    bomItems.value.map((item) => ({
      ...item,
      materialCode: item.material.materialCode,
      materialName: item.material.description || item.material.materialName
    }))
  )
  const lineColumns = computed<ColumnOption<DraftLine>[]>(() => [
    { type: 'selection', width: 48, fixed: 'left' },
    { prop: 'lineNo', label: '行号', width: 72 },
    { prop: 'materialId', label: '物料描述', minWidth: 245, useSlot: true },
    {
      prop: 'materialCode',
      label: '物料编码',
      minWidth: 145,
      formatter: (row) => row.material?.materialCode || '—'
    },
    {
      prop: 'specificationModel',
      label: '规格型号',
      minWidth: 145,
      formatter: (row) => row.material?.specificationModel || '—'
    },
    ...(isFinished.value
      ? [
          {
            prop: 'productionUnitId',
            label: '生产单位',
            minWidth: 105,
            formatter: (row: DraftLine) => unitName(row.productionUnitId)
          },
          {
            prop: 'workOrderQuantity',
            label: '工单数量',
            minWidth: 120,
            align: 'right' as const,
            formatter: (row: DraftLine) => Number(row.workOrderQuantity || 0).toFixed(4)
          }
        ]
      : []),
    ...(!isFinished.value
      ? [
          {
            prop: 'requestedQuantity',
            label: '申请数量',
            minWidth: 120,
            align: 'right' as const,
            useSlot: true
          }
        ]
      : []),
    {
      prop: 'actualQuantity',
      label: config.value.quantityLabel,
      minWidth: 120,
      align: 'right',
      useSlot: true
    },
    { prop: 'inventoryUnitId', label: '库存单位', width: 105, useSlot: true },
    { prop: 'projectId', label: '项目名称', minWidth: 145, useSlot: true },
    {
      prop: 'projectCode',
      label: '项目编码',
      minWidth: 140,
      formatter: (row) =>
        projects.value.find((item) => item.id === row.projectId)?.projectCode || '—'
    },
    { prop: 'constructionNo', label: '施工号', minWidth: 140 },
    {
      prop: 'baseUnitId',
      label: '基本单位',
      minWidth: 105,
      formatter: (row) => unitName(row.baseUnitId)
    },
    { prop: 'baseQuantity', label: '基本数量', minWidth: 110, align: 'right' },
    { prop: 'batchNo', label: '批号', minWidth: 120 },
    { prop: 'warehouseId', label: '仓库', minWidth: 120, useSlot: true },
    {
      prop: 'binId',
      label: '仓位',
      minWidth: 115,
      formatter: (row) => bins.value.find((item) => item.id === row.binId)?.binName || '—'
    },
    {
      prop: 'availableInventoryQuantity',
      label: '可用库存数量',
      minWidth: 130,
      align: 'right',
      useSlot: true
    },
    ...(isReturn.value
      ? [
          {
            prop: 'returnType',
            label: '退料类型',
            minWidth: 145,
            formatter: (row: DraftLine) =>
              returnTypeOptions.find((item) => item.value === (row.returnType || 'good'))?.label ??
              '—'
          }
        ]
      : []),
    {
      prop: 'stockType',
      label: '库存类型',
      minWidth: 105,
      dict: { code: 'wmsInitialStockType', display: 'auto' }
    },
    {
      prop: 'ownerType',
      label: '货主类型',
      minWidth: 105,
      formatter: (row) =>
        ownerTypeOptions.find((item) => item.value === row.ownerType)?.label ?? '—'
    },
    {
      prop: 'ownerId',
      label: '货主',
      minWidth: 150,
      formatter: (row) =>
        row.ownerId
          ? [...suppliers.value, ...customers.value].find((item) => item.id === row.ownerId)
              ?.name || '—'
          : '—'
    },
    {
      prop: 'stockStatus',
      label: '库存状态',
      minWidth: 105,
      formatter: (row) =>
        stockStatusOptions.find((item) => item.value === row.stockStatus)?.label ?? '—'
    },
    {
      prop: 'keeperId',
      label: '仓管员',
      minWidth: 115,
      formatter: (row) => employeeName(row.keeperId)
    },
    { prop: 'auxiliaryQuantity', label: '辅助数量', minWidth: 115, align: 'right' },
    {
      prop: 'auxiliaryUnitId',
      label: '辅助单位',
      minWidth: 105,
      formatter: (row) => unitName(row.auxiliaryUnitId)
    },
    { prop: 'auxiliaryQuantity2', label: '辅助数量2', minWidth: 120, align: 'right' },
    {
      prop: 'auxiliaryUnit2Id',
      label: '辅助单位2',
      minWidth: 110,
      formatter: (row) => unitName(row.auxiliaryUnit2Id)
    },
    { prop: 'productionDate', label: '生产日期', minWidth: 125 },
    { prop: 'expiryDate', label: '有效期至', minWidth: 125 },
    { prop: 'trackingNo', label: '跟踪号', minWidth: 125 },
    {
      prop: 'fulfilledQuantity',
      label: config.value.fulfilledLabel,
      minWidth: 115,
      align: 'right'
    },
    {
      prop: 'remainingQuantity',
      label: config.value.remainingLabel,
      minWidth: 115,
      align: 'right',
      formatter: (row) =>
        round(
          Math.max(
            0,
            Math.abs(Number(row.requestedQuantity)) - Math.abs(Number(row.fulfilledQuantity))
          )
        )
    },
    { prop: 'sourceDocument', label: '来源单据', minWidth: 150 },
    { prop: 'sourceLineNo', label: '源行号', minWidth: 95 },
    { prop: 'remark', label: '备注', minWidth: 160 },
    { prop: 'operation', label: '操作', width: 116, fixed: 'right', useSlot: true }
  ])
  const headerItems = computed<FormItem[]>(() => [
    { key: 'documentNo', label: config.value.numberLabel, type: 'input' },
    {
      key: 'documentTypeId',
      label: '单据类型',
      type: 'select',
      options: documentTypes.value.map((item) => ({
        label: item.documentTypeName,
        value: item.id
      })),
      props: { validateEvent: false, onChange: onDocumentTypeChange }
    },
    {
      key: 'businessTypeId',
      label: '业务类型',
      type: 'select',
      options: businessTypes.value.map((item) => ({
        label: item.businessTypeName,
        value: item.id
      })),
      props: {
        validateEvent: false,
        onChange: () => formRef.value?.clearValidate('businessTypeId')
      }
    },
    {
      key: 'organizationId',
      label: '库存组织',
      type: 'treeSelect',
      placeholder: '请选择库存组织',
      props: {
        data: organizationSelectTree.value,
        nodeKey: 'id',
        props: {
          value: 'id',
          label: 'organizationLabel',
          children: 'children',
          disabled: 'disabled'
        },
        filterable: true,
        validateEvent: false,
        checkStrictly: true,
        defaultExpandAll: true,
        renderAfterExpand: false,
        onChange: onOrganizationChange
      }
    },
    {
      key: 'businessDate',
      label: '业务日期',
      type: 'date',
      props: {
        valueFormat: 'YYYY-MM-DD',
        class: 'w-full!',
        validateEvent: false,
        onChange: () => formRef.value?.clearValidate('businessDate')
      }
    },
    {
      key: 'warehouseId',
      label: '仓库',
      type: 'select',
      options: eligibleWarehouses.value.map((item) => ({
        label: `${item.warehouseName} · ${item.warehouseCode}`,
        value: item.id
      })),
      props: {
        filterable: true,
        validateEvent: false,
        placeholder: form.organizationId ? '请选择仓库' : '请先选择库存组织',
        disabled: !form.organizationId,
        noDataText: '当前库存组织暂无可用仓库',
        onChange: onHeaderWarehouseChange
      }
    },
    {
      key: 'workOrderId',
      label: isFinished.value ? '生产工单（单工单模式）' : '生产工单',
      type: 'select',
      options: workOrders.value.map((item) => ({ label: item.workOrderNo, value: item.id })),
      props: {
        filterable: true,
        clearable: true,
        disabled: mode.value === 'view' || !form.warehouseId,
        onChange: onWorkOrderChange
      }
    },
    { key: 'projectId', label: '项目名称', type: 'input' },
    { key: 'customerId', label: '客户', type: 'input' },
    {
      key: 'demandDate',
      label: '需求日期',
      type: 'date',
      hidden: props.kind === 'finished_return',
      props: { valueFormat: 'YYYY-MM-DD', class: 'w-full!', disabled: mode.value === 'view' }
    },
    { key: 'applicantId', label: '申请人', type: 'input', hidden: isFinished.value },
    {
      key: 'departmentId',
      label: '申请部门',
      type: 'treeSelect',
      hidden: isFinished.value,
      placeholder: '请选择申请部门',
      props: {
        data: departmentSelectTree.value,
        nodeKey: 'id',
        props: {
          value: 'id',
          label: 'organizationLabel',
          children: 'children',
          disabled: 'disabled'
        },
        filterable: true,
        clearable: true,
        checkStrictly: true,
        defaultExpandAll: true,
        renderAfterExpand: false
      }
    },
    { key: 'keeperId', label: '仓管员', type: 'input' },
    { key: 'status', label: '单据状态', type: 'input' },
    {
      key: 'materialStatus',
      label: isFinished.value ? '办理状态' : isReturn.value ? '状态' : '领料状态',
      type: 'input'
    },
    {
      key: 'remark',
      label: '备注',
      type: 'input',
      span: 24,
      props: {
        type: 'textarea',
        rows: 2,
        maxlength: 500,
        showWordLimit: true,
        disabled: mode.value === 'view'
      }
    }
  ])
  const headerRules = {
    documentTypeId: [{ required: true, message: '请选择单据类型', trigger: 'change' }],
    businessTypeId: [{ required: true, message: '请选择业务类型', trigger: 'change' }],
    organizationId: [{ required: true, message: '请选择库存组织', trigger: 'change' }],
    businessDate: [{ required: true, message: '请选择业务日期', trigger: 'change' }],
    warehouseId: [{ required: true, message: '请选择仓库', trigger: 'change' }]
  }
  const lineItems = computed<FormItem[]>(() => {
    const line = editLine.value
    const tenantWarehouses = warehouses.value.filter(
      (item) => item.tenantId === form.tenantId && item.status === 'enabled'
    )
    const ownerOptions =
      line?.ownerType === 'supplier'
        ? suppliers.value
        : line?.ownerType === 'customer'
          ? customers.value
          : []
    const disabled = mode.value === 'view'
    return [
      { key: 'projectId', label: '项目名称', type: 'input' },
      { key: 'projectCode', label: '项目编码', type: 'input' },
      {
        key: 'constructionNo',
        label: '施工号',
        type: 'input',
        props: { disabled: disabled || isFinished.value }
      },
      {
        key: 'productionUnitId',
        label: '生产单位',
        type: 'select',
        hidden: !isFinished.value,
        options: unitOptions(),
        props: { filterable: true, disabled }
      },
      {
        key: 'workOrderQuantity',
        label: '工单数量',
        type: 'inputNumber',
        hidden: !isFinished.value,
        props: {
          disabled: true,
          class: isReturn.value ? 'w-full! wms-production-return-qty' : 'w-full!'
        }
      },
      {
        key: 'inventoryUnitId',
        label: '库存单位',
        type: 'select',
        options: unitOptions(),
        props: { filterable: true, disabled }
      },
      {
        key: 'requestedQuantity',
        label: '申请数量',
        type: 'inputNumber',
        hidden: isFinished.value,
        props: {
          precision: 4,
          controls: false,
          class: isReturn.value ? 'w-full! wms-production-return-qty' : 'w-full!',
          disabled,
          onChange: onRequestedQuantityChange
        }
      },
      {
        key: 'actualQuantity',
        label: config.value.quantityLabel,
        type: 'inputNumber',
        props: {
          precision: 4,
          controls: false,
          class: isReturn.value ? 'w-full! wms-production-return-qty' : 'w-full!',
          disabled,
          onChange: onActualQuantityChange
        }
      },
      {
        key: 'baseUnitId',
        label: '基本单位',
        type: 'select',
        options: unitOptions(),
        props: { filterable: true, disabled, onChange: syncQuantities }
      },
      {
        key: 'baseQuantity',
        label: '基本数量',
        type: 'inputNumber',
        props: { precision: 4, controls: false, class: 'w-full!', disabled }
      },
      { key: 'batchNo', label: '批号', type: 'input', props: { disabled } },
      {
        key: 'warehouseId',
        label: '仓库',
        type: 'select',
        options: tenantWarehouses.map((item) => ({ label: item.warehouseName, value: item.id })),
        props: {
          filterable: true,
          disabled: disabled || props.kind === 'finished_return',
          onChange: onLineWarehouseChange
        }
      },
      {
        key: 'binId',
        label: '仓位',
        type: 'select',
        options: bins.value
          .filter((item) => item.status === 'available')
          .map((item) => ({ label: `${item.binName} · ${item.binCode}`, value: item.id })),
        props: { filterable: true, clearable: true, disabled }
      },
      {
        key: 'sourceBatchId',
        label: '来源库存批次',
        type: 'input',
        hidden: isReturn.value || isFinished.value
      },
      {
        key: 'availableInventoryQuantity',
        label: '可用库存数量',
        type: 'inputNumber',
        props: { disabled: true, class: 'w-full!' }
      },
      {
        key: 'returnType',
        label: '退料类型',
        type: 'select',
        hidden: !isReturn.value,
        options: returnTypeOptions,
        props: { disabled }
      },
      {
        key: 'stockType',
        label: '库存类型',
        type: 'select',
        options: stockTypeOptions,
        props: { filterable: true, disabled }
      },
      {
        key: 'ownerType',
        label: '货主类型',
        type: 'select',
        options: ownerTypeOptions,
        props: { disabled, onChange: onOwnerTypeChange }
      },
      {
        key: 'ownerId',
        label: '货主',
        type: 'select',
        hidden: line?.ownerType === 'self',
        options: ownerOptions.map((item) => ({ label: item.name, value: item.id })),
        props: { filterable: true, disabled }
      },
      {
        key: 'stockStatus',
        label: '库存状态',
        type: 'select',
        options: stockStatusOptions,
        props: { disabled }
      },
      { key: 'keeperId', label: '仓管员', type: 'input' },
      { key: 'auxiliaryQuantity', label: '辅助数量', type: 'input' },
      { key: 'auxiliaryUnitId', label: '辅助单位', type: 'input' },
      { key: 'auxiliaryQuantity2', label: '辅助数量2', type: 'input' },
      { key: 'auxiliaryUnit2Id', label: '辅助单位2', type: 'input' },
      {
        key: 'productionDate',
        label: '生产日期',
        type: 'date',
        props: { valueFormat: 'YYYY-MM-DD', class: 'w-full!', disabled }
      },
      {
        key: 'expiryDate',
        label: '有效期至',
        type: 'date',
        props: { valueFormat: 'YYYY-MM-DD', class: 'w-full!', disabled }
      },
      { key: 'trackingNo', label: '跟踪号', type: 'input', props: { disabled } },
      {
        key: 'fulfilledQuantity',
        label: config.value.fulfilledLabel,
        type: 'inputNumber',
        props: { disabled: true, class: 'w-full!' }
      },
      {
        key: 'remainingQuantity',
        label: config.value.remainingLabel,
        type: 'inputNumber',
        props: { disabled: true, class: 'w-full!' }
      },
      { key: 'sourceDocument', label: '来源单据', type: 'input', props: { disabled } },
      { key: 'sourceLineNo', label: '源行号', type: 'input', props: { disabled } },
      {
        key: 'serialIds',
        label: '来源 SN',
        type: 'select',
        hidden: !isOutbound.value || !line?.material?.serialManagementEnabled,
        options: serials.value
          .filter((item) => item.status === 'in_stock')
          .map((item) => ({ label: item.serialNo, value: item.id })),
        props: { multiple: true, filterable: true, disabled }
      },
      {
        key: 'serialText',
        label: '入库 SN（每行一个）',
        type: 'input',
        hidden: isOutbound.value || !line?.material?.serialManagementEnabled,
        span: 24,
        props: { type: 'textarea', rows: 3, disabled }
      },
      {
        key: 'remark',
        label: '备注',
        type: 'input',
        span: 24,
        props: { type: 'textarea', rows: 2, maxlength: 500, showWordLimit: true, disabled }
      }
    ]
  })
  const lineRules = computed(() => ({
    inventoryUnitId: [{ required: true, message: '请选择库存单位', trigger: 'change' }],
    ...(isFinished.value
      ? { productionUnitId: [{ required: true, message: '请选择生产单位', trigger: 'change' }] }
      : {}),
    ...(!isFinished.value
      ? { requestedQuantity: [{ required: true, message: '请填写申请数量', trigger: 'change' }] }
      : {}),
    actualQuantity: [
      { required: true, message: `请填写${config.value.quantityLabel}`, trigger: 'change' }
    ],
    stockType: [{ required: true, message: '请选择库存类型', trigger: 'change' }]
  }))
  const lineViewData = computed(() => editLine.value as DraftLine)
  const lineViewItems = computed<ArtDescriptionItem<DraftLine>[]>(() => [
    {
      key: 'materialId',
      label: '物料编码',
      value: (line: DraftLine) => line.material?.materialCode
    },
    {
      key: 'materialName',
      label: '物料描述',
      value: (line: DraftLine) => line.material?.description || line.material?.materialName
    },
    {
      key: 'specificationModel',
      label: '规格型号',
      value: (line: DraftLine) => line.material?.specificationModel
    },
    {
      key: 'projectId',
      label: '项目名称',
      value: (line: DraftLine) => projectName(line.projectId)
    },
    {
      key: 'projectCode',
      label: '项目编码',
      value: (line: DraftLine) =>
        projects.value.find((item) => item.id === line.projectId)?.projectCode
    },
    { key: 'constructionNo', label: '施工号' },
    {
      key: 'inventoryUnitId',
      label: '库存单位',
      value: (line: DraftLine) => unitName(line.inventoryUnitId)
    },
    ...(isFinished.value
      ? [
          {
            key: 'productionUnitId',
            label: '生产单位',
            value: (line: DraftLine) => unitName(line.productionUnitId)
          },
          { key: 'workOrderQuantity', label: '工单数量' }
        ]
      : [{ key: 'requestedQuantity', label: '申请数量' }]),
    { key: 'actualQuantity', label: config.value.quantityLabel },
    { key: 'baseUnitId', label: '基本单位', value: (line: DraftLine) => unitName(line.baseUnitId) },
    { key: 'baseQuantity', label: '基本数量' },
    { key: 'batchNo', label: '批号' },
    {
      key: 'warehouseId',
      label: '仓库',
      value: (line: DraftLine) => warehouseName(line.warehouseId)
    },
    {
      key: 'binId',
      label: '仓位',
      value: (line: DraftLine) => bins.value.find((item) => item.id === line.binId)?.binName
    },
    {
      key: 'returnType',
      label: '退料类型',
      value: (line: DraftLine) =>
        returnTypeOptions.find((item) => item.value === line.returnType)?.label || '—'
    },
    { key: 'stockType', label: '库存类型', dictCode: 'wmsInitialStockType' },
    {
      key: 'ownerType',
      label: '货主类型',
      value: (line: DraftLine) =>
        ownerTypeOptions.find((item) => item.value === line.ownerType)?.label || '—'
    },
    {
      key: 'ownerId',
      label: '货主',
      value: (line: DraftLine) =>
        line.ownerId
          ? [...suppliers.value, ...customers.value].find((item) => item.id === line.ownerId)?.name
          : '—'
    },
    {
      key: 'stockStatus',
      label: '库存状态',
      value: (line: DraftLine) =>
        stockStatusOptions.find((item) => item.value === line.stockStatus)?.label || '—'
    },
    { key: 'keeperId', label: '仓管员', value: (line: DraftLine) => employeeName(line.keeperId) },
    { key: 'auxiliaryQuantity', label: '辅助数量' },
    {
      key: 'auxiliaryUnitId',
      label: '辅助单位',
      value: (line: DraftLine) => unitName(line.auxiliaryUnitId)
    },
    { key: 'auxiliaryQuantity2', label: '辅助数量2' },
    {
      key: 'auxiliaryUnit2Id',
      label: '辅助单位2',
      value: (line: DraftLine) => unitName(line.auxiliaryUnit2Id)
    },
    { key: 'productionDate', label: '生产日期' },
    { key: 'expiryDate', label: '有效期至' },
    { key: 'trackingNo', label: '跟踪号' },
    { key: 'fulfilledQuantity', label: config.value.fulfilledLabel },
    {
      key: 'remainingQuantity',
      label: config.value.remainingLabel,
      value: (line: DraftLine) =>
        round(
          Math.max(
            0,
            Math.abs(Number(line.requestedQuantity)) - Math.abs(Number(line.fulfilledQuantity))
          )
        )
    },
    { key: 'sourceDocument', label: '来源单据' },
    { key: 'sourceLineNo', label: '源行号' },
    { key: 'remark', label: '备注' }
  ])
  function unitOptions() {
    return units.value.map((item) => ({
      label: `${item.unitName} · ${item.unitCode}`,
      value: item.id
    }))
  }
  function unitName(id: string | null | undefined): string {
    return units.value.find((item) => item.id === id)?.unitName ?? '—'
  }
  function projectName(id: string | null): string {
    return projects.value.find((item) => item.id === id)?.projectName ?? '—'
  }
  function warehouseName(id: string): string {
    return warehouses.value.find((item) => item.id === id)?.warehouseName ?? '—'
  }
  function employeeName(id: string | null): string {
    return employees.value.find((item) => item.id === id)?.employeeName ?? '—'
  }
  function round(value: number): number {
    return Math.round((value + Number.EPSILON) * 10000) / 10000
  }
  function conversionFactor(
    material: WmsMaterialOption | null | undefined,
    unitId: string
  ): number | null {
    if (!material || !unitId) return null
    if (unitId === material.baseUnitId) return 1
    const conversion = material.unitConversions?.find((item) => item.sourceUnitId === unitId)
    if (!conversion || conversion.sourceFactor <= 0 || conversion.baseFactor <= 0) return null
    return conversion.baseFactor / conversion.sourceFactor
  }
  function lineUnitConversionError(line: DraftLine): string {
    if (!line.material || !line.inventoryUnitId || !line.baseUnitId) return ''
    if (
      conversionFactor(line.material, line.inventoryUnitId) &&
      conversionFactor(line.material, line.baseUnitId)
    )
      return ''
    return `第 ${line.lineNo / 10} 行物料 ${line.material.materialCode} 缺少 ${unitName(line.inventoryUnitId)} 与 ${unitName(line.baseUnitId)} 的单位换算关系，请改用已配置的单位，或在 MDM 物料编码中补齐换算关系。`
  }
  function convertedQuantity(
    material: WmsMaterialOption | null | undefined,
    sourceUnitId: string,
    targetUnitId: string | null,
    quantity: number
  ): number | null {
    if (!targetUnitId) return null
    const sourceFactor = conversionFactor(material, sourceUnitId)
    const targetFactor = conversionFactor(material, targetUnitId)
    return sourceFactor && targetFactor ? round((quantity * sourceFactor) / targetFactor) : null
  }
  function syncQuantities(): void {
    const line = editLine.value
    if (!line) return
    const quantity = Number(line.actualQuantity || 0)
    line.baseQuantity = convertedQuantity(
      line.material,
      line.inventoryUnitId,
      line.baseUnitId,
      quantity
    )
    line.auxiliaryQuantity = convertedQuantity(
      line.material,
      line.inventoryUnitId,
      line.auxiliaryUnitId,
      quantity
    )
    line.auxiliaryQuantity2 = convertedQuantity(
      line.material,
      line.inventoryUnitId,
      line.auxiliaryUnit2Id,
      quantity
    )
    line.remainingQuantity = round(
      Math.max(
        0,
        Math.abs(Number(line.requestedQuantity)) - Math.abs(Number(line.fulfilledQuantity))
      )
    )
  }
  function onRequestedQuantityChange(value: number): void {
    if (!editLine.value) return
    const signed = isReturn.value ? -Math.abs(Number(value || 0)) : Math.abs(Number(value || 0))
    editLine.value.requestedQuantity = signed
    editLine.value.actualQuantity = signed
    syncQuantities()
  }
  function onActualQuantityChange(value: number): void {
    if (!editLine.value) return
    editLine.value.actualQuantity = isReturn.value
      ? -Math.abs(Number(value || 0))
      : Math.abs(Number(value || 0))
    if (isFinished.value) editLine.value.requestedQuantity = editLine.value.actualQuantity
    syncQuantities()
  }
  function renumber(): void {
    lines.value.forEach((line, index) => {
      line.lineNo = (index + 1) * 10
    })
  }
  function makeLine(material: WmsMaterialOption, quantity = 0): DraftLine {
    const signed = isReturn.value ? -Math.abs(quantity) : Math.abs(quantity)
    return {
      key: crypto.randomUUID(),
      lineNo: (lines.value.length + 1) * 10,
      materialId: material.id,
      material,
      workOrderId: form.workOrderId || null,
      projectId: form.projectId || null,
      constructionNo: isFinished.value
        ? workOrders.value.find((item) => item.id === form.workOrderId)?.constructionNo || null
        : null,
      inventoryUnitId: material.inventoryUnitId || '',
      productionUnitId: isFinished.value
        ? material.productionUnitId || material.inventoryUnitId || null
        : null,
      workOrderQuantity: isFinished.value
        ? Number(
            workOrders.value.find((item) => item.id === form.workOrderId)?.orderQuantity || 0
          ) * (isReturn.value ? -1 : 1)
        : null,
      requestedQuantity: signed,
      actualQuantity: signed,
      baseUnitId: material.baseUnitId || null,
      baseQuantity: convertedQuantity(
        material,
        material.inventoryUnitId || '',
        material.baseUnitId || null,
        signed
      ),
      batchNo: null,
      warehouseId: form.warehouseId,
      binId: null,
      sourceBatchId: null,
      packId: null,
      sourceLineId: null,
      returnType: isReturn.value ? 'good' : null,
      stockType: 'normal',
      ownerType: 'self',
      ownerId: null,
      stockStatus: 'available',
      keeperId: form.keeperId || null,
      auxiliaryUnitId: material.auxiliaryUnitId || null,
      auxiliaryQuantity: convertedQuantity(
        material,
        material.inventoryUnitId || '',
        material.auxiliaryUnitId || null,
        signed
      ),
      auxiliaryUnit2Id: material.auxiliaryUnit2Id || null,
      auxiliaryQuantity2: convertedQuantity(
        material,
        material.inventoryUnitId || '',
        material.auxiliaryUnit2Id || null,
        signed
      ),
      productionDate: null,
      expiryDate: null,
      trackingNo: null,
      fulfilledQuantity: 0,
      sourceDocument: form.workOrderId
        ? workOrders.value.find((item) => item.id === form.workOrderId)?.workOrderNo || null
        : null,
      sourceLineNo: null,
      remark: null,
      serialIds: [],
      serialNos: [],
      movementId: null,
      availableInventoryQuantity: 0,
      remainingQuantity: Math.abs(signed),
      serialText: ''
    }
  }
  function quantityCellClass({ column }: { column: { property?: string } }): string {
    return isReturn.value &&
      (column.property === 'requestedQuantity' ||
        column.property === 'actualQuantity' ||
        (isFinished.value && column.property === 'workOrderQuantity'))
      ? 'wms-production-negative-cell'
      : ''
  }
  function onLineSelectionChange(rows: DraftLine[]): void {
    selectedLineIndexes.value = rows
      .map((row) => lines.value.findIndex((item) => item.key === row.key))
      .filter((index) => index >= 0)
  }
  function copySelectedLine(): void {
    const source = lines.value[selectedLineIndexes.value[0]]
    if (!source) return
    lines.value.push({
      ...cloneDeep(source),
      id: undefined,
      key: crypto.randomUUID(),
      movementId: null,
      fulfilledQuantity: 0
    })
    renumber()
    selectedLineIndexes.value = []
  }
  function deleteSelectedLines(): void {
    const selected = new Set(selectedLineIndexes.value)
    lines.value = lines.value.filter((_, index) => !selected.has(index))
    selectedLineIndexes.value = []
    renumber()
  }
  function deleteLine(lineNo: number): void {
    lines.value = lines.value.filter((line) => line.lineNo !== lineNo)
    selectedLineIndexes.value = []
    renumber()
  }
  async function materialApi(params: DataSelectFetchParams) {
    if (isFinished.value) {
      const order = workOrders.value.find((item) => item.id === form.workOrderId)
      const material = order?.materialId
        ? (await fetchWmsProductionMaterialsByIds(form.tenantId, [order.materialId]))[0]
        : undefined
      const keyword = (params.keyword || '').trim().toLowerCase()
      const data =
        material &&
        (!keyword ||
          [material.materialCode, material.materialName, material.description].some((value) =>
            value?.toLowerCase().includes(keyword)
          ))
          ? [material]
          : []
      return { data, total: data.length }
    }
    return fetchWmsMaterialOptions(
      form.tenantId,
      params.keyword || '',
      params.page,
      params.pageSize
    )
  }
  function stockApi(params: DataSelectFetchParams) {
    return fetchWmsProductionStockPage({
      tenantId: form.tenantId,
      warehouseId: form.warehouseId || undefined,
      keyword: params.keyword,
      current: params.page,
      size: params.pageSize
    })
  }
  function inboundSourceApi(params: DataSelectFetchParams) {
    return fetchWmsFinishedInboundSourcePage({
      tenantId: form.tenantId,
      workOrderId: form.workOrderId || undefined,
      keyword: params.keyword,
      page: params.page,
      pageSize: params.pageSize
    })
  }
  function lineStockApi(params: DataSelectFetchParams) {
    return fetchWmsProductionStockPage({
      tenantId: form.tenantId,
      materialId: editLine.value?.materialId,
      warehouseId: editLine.value?.warehouseId || form.warehouseId || undefined,
      keyword: params.keyword,
      current: params.page,
      size: params.pageSize
    })
  }
  function addMaterialRows(_ids: unknown, rows: DataSelectRecord[]): void {
    const order = workOrders.value.find((item) => item.id === form.workOrderId)
    for (const row of rows) {
      const material = row as WmsMaterialOption
      if (isFinished.value && (!order || material.id !== order.materialId)) continue
      const line = makeLine(material)
      if (order) {
        line.workOrderId = order.id
        line.projectId = order.projectId
        line.constructionNo = order.constructionNo
        line.sourceDocument = order.workOrderNo
      }
      lines.value.push(line)
    }
    renumber()
    materialPickerIds.value = []
    materialPickerRows.value = []
  }
  async function addWorkOrderRows(_ids: unknown, rows: DataSelectRecord[]): Promise<void> {
    const orders = rows as WmsWorkOrderOption[]
    const materialIds = orders.flatMap((item) => (item.materialId ? [item.materialId] : []))
    const materials = await fetchWmsProductionMaterialsByIds(form.tenantId, [
      ...new Set(materialIds)
    ])
    const byId = new Map(materials.map((item) => [item.id, item]))
    let added = 0
    for (const order of orders) {
      const material = order.materialId ? byId.get(order.materialId) : undefined
      const remaining = Number(order.completedQuantity) - Number(order.warehousedQuantity)
      if (!material || remaining <= 0) continue
      const line = makeLine(material, Math.min(remaining, 1))
      line.workOrderId = order.id
      line.projectId = order.projectId
      line.constructionNo = order.constructionNo
      line.workOrderQuantity = Number(order.orderQuantity)
      line.sourceDocument = order.workOrderNo
      lines.value.push(line)
      added++
    }
    if (orders.length === 1) {
      form.workOrderId = orders[0].id
      form.projectId = orders[0].projectId || ''
      form.customerId =
        projects.value.find((item) => item.id === orders[0].projectId)?.customerId || ''
      packs.value = await fetchWmsPackOptions(orders[0].id)
    } else if (orders.length > 1) {
      form.workOrderId = ''
      form.projectId = ''
      form.customerId = ''
      packs.value = []
    }
    renumber()
    workOrderPickerIds.value = []
    workOrderPickerRows.value = []
    if (!added) ElMessage.warning('所选工单暂无已报工未入库的成品数量')
    else if (added < orders.length)
      ElMessage.warning(`已带入 ${added} 行；无可入库数量的工单已跳过`)
  }
  async function addPackRows(_ids: unknown, rows: DataSelectRecord[]): Promise<void> {
    const order = workOrders.value.find((item) => item.id === form.workOrderId)
    if (!order?.materialId) return
    const material = (await fetchWmsProductionMaterialsByIds(form.tenantId, [order.materialId]))[0]
    if (!material) return
    for (const row of rows) {
      const pack = row as WmsPackOption & { quantity: number }
      if (lines.value.some((item) => item.packId === pack.id)) continue
      const line = makeLine(material, Number(pack.quantity))
      line.workOrderId = order.id
      line.projectId = order.projectId
      line.constructionNo = order.constructionNo
      line.workOrderQuantity = Number(order.orderQuantity)
      line.packId = pack.id
      line.sourceDocument = pack.packNo
      lines.value.push(line)
    }
    renumber()
    packPickerIds.value = []
    packPickerRows.value = []
  }
  async function addInboundSourceRows(_ids: unknown, rows: DataSelectRecord[]): Promise<void> {
    const sources = rows as WmsFinishedInboundSourceOption[]
    if (!sources.length) return
    if (sources.some((item) => item.workOrderId !== sources[0].workOrderId)) {
      ElMessage.warning('一张完工退库单只能选择同一生产工单的入库明细')
      return
    }
    if (!form.warehouseId) {
      form.warehouseId = sources[0].warehouseId
      const warehouse = warehouses.value.find((item) => item.id === form.warehouseId)
      if (warehouse) {
        form.organizationId = warehouse.organizationId
        form.tenantId = warehouse.tenantId
      }
      workOrders.value = await fetchWmsWorkOrderOptions(form.warehouseId)
    }
    if (sources.some((item) => item.warehouseId !== form.warehouseId)) {
      ElMessage.warning('请选择与单据表头仓库一致的完工入库明细')
      return
    }
    const materials = await fetchWmsProductionMaterialsByIds(form.tenantId, [
      ...new Set(sources.map((item) => item.materialId))
    ])
    const byId = new Map(materials.map((item) => [item.id, item]))
    for (const source of sources) {
      const material = byId.get(source.materialId)
      if (!material || lines.value.some((item) => item.sourceLineId === source.id)) continue
      const line = makeLine(
        material,
        Math.min(Number(source.availableQuantity), Number(source.inboundQuantity), 1)
      )
      line.workOrderId = source.workOrderId
      line.projectId = source.projectId
      line.constructionNo = source.constructionNo
      line.inventoryUnitId = source.inventoryUnitId
      line.productionUnitId = source.productionUnitId
      line.workOrderQuantity =
        source.workOrderQuantity == null ? null : -Math.abs(Number(source.workOrderQuantity))
      line.warehouseId = source.warehouseId
      line.binId = source.binId
      line.sourceBatchId = source.sourceBatchId
      line.sourceLineId = source.id
      line.batchNo = source.batchNo
      line.stockType = source.stockType
      line.ownerType = source.ownerType
      line.ownerId = source.ownerId
      line.stockStatus = source.stockStatus
      line.availableInventoryQuantity = Number(source.availableQuantity)
      line.sourceDocument = source.documentNo
      line.sourceLineNo = String(source.lineNo)
      lines.value.push(line)
    }
    form.workOrderId = sources[0].workOrderId
    form.projectId = sources[0].projectId || ''
    form.customerId =
      projects.value.find((item) => item.id === sources[0].projectId)?.customerId || ''
    renumber()
    inboundSourceIds.value = []
    inboundSourceRows.value = []
  }
  function addBomRows(_ids: unknown, rows: DataSelectRecord[]): void {
    for (const row of rows) {
      const item = row as WmsProductionBomItem
      const line = makeLine(item.material, item.requiredQuantity)
      line.sourceDocument = item.workOrderNo
      line.sourceLineNo = item.sourceLineNo
      lines.value.push(line)
    }
    renumber()
    bomPickerIds.value = []
    bomPickerSelected.value = []
  }
  function addStockRows(_ids: unknown, rows: DataSelectRecord[]): void {
    for (const row of rows) {
      const stock = row as WmsProductionStockOption
      if (!stock.material) continue
      const material = { ...stock.material, id: stock.materialId } as WmsMaterialOption
      const line = makeLine(material, Math.min(stock.availableQuantity, 1))
      line.sourceBatchId = isReturn.value ? null : stock.id
      line.batchNo = stock.batchNo
      line.warehouseId = stock.warehouseId
      line.binId = stock.binId
      line.projectId = stock.projectId || form.projectId || null
      line.availableInventoryQuantity = stock.availableQuantity
      line.ownerType = stock.ownerType as DraftLine['ownerType']
      line.ownerId = stock.ownerId
      lines.value.push(line)
    }
    renumber()
    stockPickerIds.value = []
    stockPickerRows.value = []
  }
  function onProjectSelected(rows: DataSelectRecord[]): void {
    const project = rows[0] as WmsProductionProjectOption | undefined
    form.projectId = project?.id || ''
    form.customerId = project?.customerId || ''
  }
  function onLineProjectSelected(rows: DataSelectRecord[]): void {
    if (editLine.value)
      editLine.value.projectId = (rows[0] as WmsProductionProjectOption | undefined)?.id || null
  }
  function onApplicantChange(_id: unknown, rows: EmployeeIntegrationItem[]): void {
    const employee = rows[0]
    form.applicantId = employee?.id || ''
    form.departmentId = employee?.organizationId || ''
    selectedApplicant.value = rows
    employees.value = [...employees.value.filter((item) => item.id !== employee?.id), ...rows]
  }
  function onKeeperChange(_id: unknown, rows: EmployeeIntegrationItem[]): void {
    form.keeperId = rows[0]?.id || ''
    selectedKeeper.value = rows
    employees.value = [...employees.value.filter((item) => item.id !== rows[0]?.id), ...rows]
    lines.value.forEach((line) => {
      if (!line.keeperId) line.keeperId = form.keeperId || null
    })
  }
  function onLineKeeperChange(_id: unknown, rows: EmployeeIntegrationItem[]): void {
    if (editLine.value) editLine.value.keeperId = rows[0]?.id || null
    selectedLineKeeper.value = rows
    employees.value = [...employees.value.filter((item) => item.id !== rows[0]?.id), ...rows]
  }
  async function onLineBatchSelected(rows: DataSelectRecord[]): Promise<void> {
    const batch = rows[0] as WmsProductionStockOption | undefined
    if (!editLine.value) return
    editLine.value.sourceBatchId = batch?.id || null
    selectedLineBatch.value = rows
    if (!batch) return
    editLine.value.batchNo = batch.batchNo
    editLine.value.warehouseId = batch.warehouseId
    editLine.value.binId = batch.binId
    editLine.value.availableInventoryQuantity = batch.availableQuantity
    editLine.value.ownerType = batch.ownerType as DraftLine['ownerType']
    editLine.value.ownerId = batch.ownerId
    bins.value = await fetchWmsBins(batch.warehouseId)
    serials.value = await fetchWmsBatchSerials(batch.id)
  }
  function onOwnerTypeChange(): void {
    if (editLine.value) editLine.value.ownerId = null
  }
  async function onLineWarehouseChange(): Promise<void> {
    const line = editLine.value
    if (!line) return
    const warehouseId = line.warehouseId
    line.binId = null
    line.sourceBatchId = null
    const warehouseBins = warehouseId ? await fetchWmsBins(warehouseId) : []
    if (editLine.value === line && line.warehouseId === warehouseId) bins.value = warehouseBins
  }
  async function openLine(lineNo: number): Promise<void> {
    const source = lines.value.find((item) => item.lineNo === lineNo)
    if (!source) return
    editLine.value = cloneDeep(source)
    editLine.value.remainingQuantity = round(
      Math.max(0, Math.abs(source.requestedQuantity) - Math.abs(source.fulfilledQuantity))
    )
    editLine.value.serialText = source.serialNos.join('\n')
    bins.value = source.warehouseId ? await fetchWmsBins(source.warehouseId) : []
    serials.value = source.sourceBatchId ? await fetchWmsBatchSerials(source.sourceBatchId) : []
    selectedLineBatch.value = source.sourceBatchId
      ? [
          {
            id: source.sourceBatchId,
            batchLabel: source.batchNo || '未填写批号',
            batchNo: source.batchNo,
            warehouseId: source.warehouseId,
            binId: source.binId,
            availableQuantity: source.availableInventoryQuantity,
            ownerType: source.ownerType,
            ownerId: source.ownerId
          }
        ]
      : []
    selectedLineKeeper.value = employees.value.filter((item) => item.id === source.keeperId)
    await lineDialogRef.value?.handleOpen(undefined, {
      title: mode.value === 'view' ? '物料明细' : `编辑${config.value.detailLabel}`,
      showFooter: mode.value !== 'view',
      confirmText: '保存明细',
      onConfirm: async () => {
        if (!editLine.value) return false
        try {
          await lineFormRef.value?.validate()
        } catch {
          return false
        }
        const line = editLine.value
        const requested = Number(line.requestedQuantity)
        const actual = Number(line.actualQuantity)
        if (
          !Number.isFinite(requested) ||
          !Number.isFinite(actual) ||
          (isReturn.value ? requested >= 0 || actual >= 0 : requested <= 0 || actual <= 0)
        ) {
          ElMessage.warning(
            isReturn.value
              ? `${config.value.quantityLabel}须为负数`
              : `${config.value.quantityLabel}须大于零`
          )
          return false
        }
        if (Math.abs(actual) > Math.abs(requested)) {
          ElMessage.warning(`${config.value.quantityLabel}不能超过单据数量`)
          return false
        }
        if (
          !line.inventoryUnitId ||
          !line.warehouseId ||
          !line.stockType ||
          (line.ownerType !== 'self' && !line.ownerId)
        ) {
          ElMessage.warning('请填写库存单位、仓库、库存类型和货主信息')
          return false
        }
        const conversionError = lineUnitConversionError(line)
        if (conversionError) {
          ElMessage.warning(conversionError)
          return false
        }
        if (
          isOutbound.value &&
          line.sourceBatchId &&
          Math.abs(actual) > Number(line.availableInventoryQuantity)
        ) {
          ElMessage.warning(`${config.value.quantityLabel}超过可用库存`)
          return false
        }
        line.serialNos = isOutbound.value
          ? []
          : (line.serialText || '')
              .split(/\r?\n/)
              .map((item) => item.trim())
              .filter(Boolean)
        if (!isOutbound.value) line.serialIds = []
        const serialCount = isOutbound.value ? line.serialIds.length : line.serialNos.length
        if (line.material?.serialManagementEnabled && serialCount !== Math.abs(actual)) {
          ElMessage.warning(`SN 数量必须等于${config.value.quantityLabel}`)
          return false
        }
        syncQuantities()
        lines.value = lines.value.map((item) => (item.lineNo === lineNo ? cloneDeep(line) : item))
        return true
      }
    })
    await nextTick()
    lineFormRef.value?.clearValidate()
  }
  async function onDocumentTypeChange(): Promise<void> {
    const documentTypeId = form.documentTypeId
    const tenantId = form.tenantId
    const businessRows =
      documentTypeId && tenantId
        ? await fetchWmsProductionBusinessTypes(tenantId, documentTypeId)
        : []
    if (form.documentTypeId !== documentTypeId || form.tenantId !== tenantId) return
    businessTypes.value = businessRows
    form.businessTypeId =
      businessTypes.value.find((item) => item.isDefault)?.id || businessTypes.value[0]?.id || ''
    await nextTick()
    formRef.value?.clearValidate(['documentTypeId', 'businessTypeId'])
  }
  async function loadTenantOptions(tenantId: string): Promise<void> {
    const [unitRows, documentRows, projectRows, supplierRows, customerRows] = await Promise.all([
      fetchWmsUnitOptions(tenantId),
      fetchWmsProductionDocumentTypes(props.kind, tenantId),
      fetchWmsProductionProjects(tenantId),
      fetchWmsInitialOptions('mdm_supplier', tenantId),
      fetchWmsInitialOptions('mdm_customer', tenantId)
    ])
    if (form.tenantId !== tenantId) return
    units.value = unitRows
    documentTypes.value = documentRows
    projects.value = projectRows.map((item) => ({
      ...item,
      customerName: item.customer?.customerName || ''
    }))
    suppliers.value = supplierRows
    customers.value = customerRows
    if (!form.documentTypeId || !documentRows.some((item) => item.id === form.documentTypeId))
      form.documentTypeId =
        documentRows.find((item) => item.isDefault)?.id || documentRows[0]?.id || ''
    const documentTypeId = form.documentTypeId
    const businessRows = documentTypeId
      ? await fetchWmsProductionBusinessTypes(tenantId, documentTypeId)
      : []
    if (form.tenantId !== tenantId || form.documentTypeId !== documentTypeId) return
    businessTypes.value = businessRows
    if (
      !form.businessTypeId ||
      !businessTypes.value.some((item) => item.id === form.businessTypeId)
    )
      await onDocumentTypeChange()
  }
  async function loadOptions(): Promise<void> {
    optionError.value = false
    try {
      const [orgPage, warehouseRows, organizationResult] = await Promise.all([
        fetchWmsInventoryOrganizations({
          tenantId: effectiveTenantId.value || undefined,
          current: 1,
          size: 2000
        }),
        fetchWmsWarehouses(effectiveTenantId.value || undefined),
        fetchGetOrganizationOptionsTree({
          tenantId: effectiveTenantId.value || undefined,
          status: '1'
        })
      ])
      organizations.value = orgPage.data
      warehouses.value = warehouseRows
      organizationTree.value = organizationResult.data ?? []
      const initializedOrganizations = organizations.value.filter(
        (item) => item.initializationClosedAt
      )
      if (!form.organizationId && initializedOrganizations.length === 1)
        form.organizationId = initializedOrganizations[0].id
      if (!form.tenantId && form.organizationId)
        form.tenantId =
          organizations.value.find((item) => item.id === form.organizationId)?.tenantId || ''
      if (form.tenantId) await loadTenantOptions(form.tenantId)
      if (form.warehouseId) workOrders.value = await fetchWmsWorkOrderOptions(form.warehouseId)
      if (isFinished.value && form.workOrderId)
        packs.value = await fetchWmsPackOptions(form.workOrderId)
      if (!isFinished.value && form.workOrderId && form.tenantId)
        bomItems.value = await fetchWmsProductionBomItems(form.workOrderId, form.tenantId)
      const ids = [
        form.applicantId,
        form.keeperId,
        ...lines.value.map((line) => line.keeperId)
      ].filter((id): id is string => Boolean(id))
      if (ids.length && form.tenantId) {
        const fetchedEmployees = await fetchWmsProductionEmployeesByIds(form.tenantId, [
          ...new Set(ids)
        ])
        employees.value = fetchedEmployees
        selectedApplicant.value = fetchedEmployees.filter((item) => item.id === form.applicantId)
        selectedKeeper.value = fetchedEmployees.filter((item) => item.id === form.keeperId)
      }
    } catch {
      optionError.value = true
    }
  }
  async function onOrganizationChange(organizationId: string): Promise<void> {
    form.organizationId = organizationId
    const org = organizations.value.find((item) => item.id === organizationId)
    const tenantChanged = Boolean(org && org.tenantId !== form.tenantId)
    form.warehouseId = ''
    form.workOrderId = ''
    lines.value = []
    bomItems.value = []
    packs.value = []
    workOrders.value = []
    if (tenantChanged && org) {
      form.tenantId = org.tenantId
      form.projectId = ''
      form.customerId = ''
      form.documentTypeId = ''
      form.businessTypeId = ''
      form.applicantId = ''
      form.departmentId = ''
      form.keeperId = ''
      selectedApplicant.value = []
      selectedKeeper.value = []
      employees.value = []
      await loadTenantOptions(org.tenantId)
    }
    await nextTick()
    formRef.value?.clearValidate()
  }
  async function onHeaderWarehouseChange(warehouseId: string): Promise<void> {
    form.warehouseId = warehouseId
    formRef.value?.clearValidate('warehouseId')
    form.workOrderId = ''
    bomItems.value = []
    packs.value = []
    const warehouseWorkOrders = warehouseId ? await fetchWmsWorkOrderOptions(warehouseId) : []
    if (form.warehouseId !== warehouseId) return
    workOrders.value = warehouseWorkOrders
    if (isFinished.value) lines.value = []
    else
      lines.value.forEach((line) => {
        line.warehouseId = form.warehouseId
      })
  }
  async function onWorkOrderChange(): Promise<void> {
    const workOrderId = form.workOrderId
    const tenantId = form.tenantId
    const order = workOrders.value.find((item) => item.id === workOrderId)
    if (isFinished.value) lines.value = []
    form.projectId = order?.projectId || ''
    form.customerId = projects.value.find((item) => item.id === order?.projectId)?.customerId || ''
    const packRows = isFinished.value && order ? await fetchWmsPackOptions(order.id) : []
    const bomRows =
      !isFinished.value && workOrderId && tenantId
        ? await fetchWmsProductionBomItems(workOrderId, tenantId)
        : []
    if (form.workOrderId !== workOrderId || form.tenantId !== tenantId) return
    packs.value = packRows
    bomItems.value = bomRows
  }
  function onImportError(): void {
    ElMessage.error('导入失败，请检查 Excel 文件格式')
  }
  async function importLines(rows: Array<Record<string, unknown>>): Promise<void> {
    const source = rows
      .slice(0, 500)
      .map((row) => ({
        code: String(row['物料编码'] || row.materialCode || '').trim(),
        requested: Number(
          row['申请数量'] ?? row['入库数量'] ?? row.requestedQuantity ?? row.actualQuantity ?? 0
        ),
        actual: Number(
          row['实发数量'] ??
            row['入库数量'] ??
            row.actualQuantity ??
            row['申请数量'] ??
            row.requestedQuantity ??
            0
        ),
        batch: String(row['批号'] || row.batchNo || '').trim()
      }))
      .filter((item) => item.code)
    if (!source.length) {
      ElMessage.warning('导入文件缺少物料编码')
      return
    }
    try {
      const materials = await fetchWmsProductionMaterialsByCodes(form.tenantId, [
        ...new Set(source.map((item) => item.code))
      ])
      const byCode = new Map(materials.map((item) => [item.materialCode, item]))
      let imported = 0
      for (const item of source) {
        const material = byCode.get(item.code)
        if (!material || !Number.isFinite(item.requested) || !Number.isFinite(item.actual)) continue
        const line = makeLine(material, item.requested)
        line.actualQuantity = isReturn.value ? -Math.abs(item.actual) : Math.abs(item.actual)
        line.batchNo = item.batch || null
        lines.value.push(line)
        imported++
      }
      renumber()
      if (imported) ElMessage.success(`已导入 ${imported} 行，请核对数量、仓库和库存类型`)
      else ElMessage.warning('未找到当前租户匹配的物料')
    } catch {
      ElMessage.error('导入失败，请重试')
    }
  }
  async function save(): Promise<boolean> {
    if (optionError.value) return false
    try {
      await formRef.value?.validate()
    } catch {
      return false
    }
    if (
      !form.tenantId ||
      !form.organizationId ||
      !form.warehouseId ||
      !form.documentTypeId ||
      !form.businessTypeId
    ) {
      ElMessage.warning('请填写库存组织、仓库、单据类型和业务类型')
      return false
    }
    if (
      !organizations.value.find((item) => item.id === form.organizationId)?.initializationClosedAt
    ) {
      ElMessage.warning('库存组织尚未结束初始化，请先在“库存初始化”完成结束初始化后再保存单据')
      return false
    }
    if (
      isFinished.value &&
      lines.value.some((line) => !line.workOrderId || !line.productionUnitId)
    ) {
      ElMessage.warning('完工明细必须选择生产工单和生产单位')
      return false
    }
    if (!lines.value.length) {
      ElMessage.warning('请至少添加一行物料')
      return false
    }
    const conversionError = lines.value.map(lineUnitConversionError).find(Boolean)
    if (conversionError) {
      ElMessage.warning(conversionError)
      return false
    }
    const invalid = lines.value.find((line) => {
      const requested = Number(line.requestedQuantity)
      const actual = Number(line.actualQuantity)
      return (
        !line.materialId ||
        !line.inventoryUnitId ||
        !line.warehouseId ||
        !line.stockType ||
        !Number.isFinite(requested) ||
        !Number.isFinite(actual) ||
        (isReturn.value ? requested >= 0 || actual >= 0 : requested <= 0 || actual <= 0) ||
        Math.abs(actual) > Math.abs(requested) ||
        (props.kind === 'finished_return' && (!line.sourceLineId || !line.sourceBatchId)) ||
        (line.ownerType !== 'self' && !line.ownerId)
      )
    })
    if (invalid) {
      ElMessage.warning(`第 ${invalid.lineNo} 行未填写完整，或数量方向/范围不正确`)
      return false
    }
    const payload: WmsProductionMaterialInput = {
      id: mode.value === 'edit' ? form.id : undefined,
      saveAction: mode.value === 'copy' ? 'copy' : mode.value === 'edit' ? 'edit' : 'add',
      tenantId: form.tenantId,
      kind: props.kind,
      documentTypeId: form.documentTypeId,
      businessTypeId: form.businessTypeId,
      organizationId: form.organizationId,
      businessDate: form.businessDate,
      warehouseId: form.warehouseId,
      workOrderId: form.workOrderId || null,
      projectId: form.projectId || null,
      demandDate: form.demandDate || null,
      applicantId: form.applicantId || null,
      departmentId: form.departmentId || null,
      keeperId: form.keeperId || null,
      remark: normalizeNullableText(form.remark),
      lines: lines.value.map((line) => ({
        materialId: line.materialId,
        workOrderId: line.workOrderId,
        projectId: line.projectId,
        constructionNo: normalizeNullableText(line.constructionNo),
        inventoryUnitId: line.inventoryUnitId,
        productionUnitId: line.productionUnitId,
        workOrderQuantity: line.workOrderQuantity,
        requestedQuantity: Number(line.requestedQuantity),
        actualQuantity: Number(line.actualQuantity),
        baseUnitId: line.baseUnitId,
        baseQuantity: line.baseQuantity,
        batchNo: normalizeNullableText(line.batchNo),
        warehouseId: line.warehouseId,
        binId: line.binId,
        sourceBatchId: line.sourceBatchId,
        packId: line.packId,
        sourceLineId: line.sourceLineId,
        returnType: line.returnType,
        stockType: line.stockType,
        ownerType: line.ownerType,
        ownerId: line.ownerId,
        stockStatus: line.stockStatus,
        keeperId: line.keeperId,
        auxiliaryUnitId: line.auxiliaryUnitId,
        auxiliaryQuantity: line.auxiliaryQuantity,
        auxiliaryUnit2Id: line.auxiliaryUnit2Id,
        auxiliaryQuantity2: line.auxiliaryQuantity2,
        productionDate: line.productionDate,
        expiryDate: line.expiryDate,
        trackingNo: normalizeNullableText(line.trackingNo),
        sourceDocument: normalizeNullableText(line.sourceDocument),
        sourceLineNo: normalizeNullableText(line.sourceLineNo),
        remark: normalizeNullableText(line.remark),
        serialIds: line.serialIds,
        serialNos: line.serialNos
      }))
    }
    try {
      await saveWmsProductionMaterial(payload)
      emit('success')
      return true
    } catch {
      return false
    }
  }
  async function handleOpen(data: OpenData): Promise<void> {
    mode.value = data.mode
    importIntent.value = Boolean(data.importIntent)
    selectIntent.value = Boolean(data.selectIntent)
    await drawerRef.value?.handleOpen(data, {
      title:
        data.mode === 'create'
          ? `新增${title.value}`
          : data.mode === 'copy'
            ? `复制${title.value}`
            : data.mode === 'edit'
              ? `编辑${title.value}`
              : `${title.value}详情`,
      subtitle: '月度三位流水号自动生成',
      loading: true,
      loadingText: '正在加载单据资料…',
      showFooter: data.mode !== 'view',
      confirmText: data.mode === 'copy' ? '保存副本' : '保存',
      onConfirm: save
    })
    try {
      const source = data.documentId
        ? await fetchWmsProductionMaterialDocument(data.documentId)
        : undefined
      if (source && source.kind !== props.kind) throw new Error('单据类型不匹配')
      currentDocument.value = source ?? null
      Object.assign(form, {
        id: data.mode === 'edit' ? source?.id || '' : '',
        tenantId: source?.tenantId || effectiveTenantId.value || '',
        documentNo: data.mode === 'copy' ? '' : source?.documentNo || '',
        documentTypeId: source?.documentTypeId || '',
        businessTypeId: source?.businessTypeId || '',
        organizationId: source?.organizationId || '',
        businessDate: source?.businessDate || dayjs().format('YYYY-MM-DD'),
        warehouseId: source?.warehouseId || '',
        workOrderId: source?.workOrderId || '',
        projectId: source?.projectId || '',
        customerId: source?.customerId || '',
        demandDate: source?.demandDate || '',
        applicantId: source?.applicantId || '',
        departmentId: source?.departmentId || '',
        keeperId: source?.keeperId || '',
        status: data.mode === 'copy' ? 'draft' : source?.status || 'draft',
        materialStatus: data.mode === 'copy' ? 'pending' : source?.materialStatus || 'pending',
        remark: source?.remark || ''
      })
      lines.value =
        source?.lines.map((line) => ({
          ...cloneDeep(line),
          id: data.mode === 'copy' ? undefined : line.id,
          key: crypto.randomUUID(),
          movementId: data.mode === 'copy' ? null : line.movementId,
          fulfilledQuantity: data.mode === 'copy' ? 0 : line.fulfilledQuantity
        })) || []
      selectedApplicant.value = []
      selectedKeeper.value = []
      await loadOptions()
      await nextTick()
      formRef.value?.clearValidate()
      if (source) drawerRef.value?.setOptions({ subtitle: source.documentNo })
    } finally {
      drawerRef.value?.setLoading(false)
    }
  }
  defineExpose({ handleOpen })
</script>

<style scoped>
  .production-readonly-field {
    display: flex;
    gap: 8px;
    align-items: center;
    min-height: 36px;
    padding: 0 11px;
    color: var(--el-text-color-primary);
    background: var(--el-fill-color-light);
    border: 1px solid var(--el-border-color-light);
    border-radius: var(--el-border-radius-base);
  }

  .production-readonly-field > :first-child {
    color: var(--el-text-color-secondary);
  }

  .production-readonly-field.is-placeholder {
    color: var(--el-text-color-placeholder);
  }

  :deep(td.el-table__cell.wms-production-negative-cell) {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: var(--el-color-danger);
    background-color: var(--el-color-warning-light-9) !important;
  }

  :deep(.wms-production-return-qty .el-input__wrapper) {
    background-color: var(--el-color-warning-light-9);
  }

  :deep(.wms-production-return-qty .el-input__inner) {
    font-weight: 800;
    color: var(--el-color-danger);
  }
</style>
