<template>
  <ArtDrawer
    @open="invalidateBins"
    @close="invalidateBins"
    ref="drawerRef"
    size="88%"
    :show-footer="mode !== 'view'"
  >
    <ArtEmptyState
      v-if="documentError"
      title="单据加载失败"
      :description="documentError"
      size="compact"
    >
      <ElButton type="primary" @click="reloadDocument">重新加载</ElButton>
    </ArtEmptyState>
    <div v-else class="initialization-document-stack min-w-0">
      <ArtEntitySummary
        :icon="isReturn ? 'ri:arrow-go-back-line' : 'ri:logout-box-r-line'"
        :eyebrow="isInitial ? 'OPENING SALES DOCUMENT' : 'SALES INVENTORY DOCUMENT'"
        :title="form.documentNo || `${mode === 'copy' ? '复制' : '新增'}${title}`"
        description="按单据表头、物料明细、税价和仓储信息依次填写。编号在保存时生成。"
      >
        <template #aside
          ><ElTag
            :type="
              form.status === 'approved'
                ? 'success'
                : form.status === 'submitted'
                  ? 'warning'
                  : 'info'
            "
            >{{ statusLabel }}</ElTag
          ></template
        >
      </ArtEntitySummary>
      <ElAlert v-if="optionError" type="warning" :closable="false" show-icon>
        {{
          mode === 'view'
            ? '基础资料加载失败，部分名称暂不可用，请重新加载。'
            : '基础资料加载失败，请重试后再保存。'
        }}<ElButton link type="primary" @click="loadOptions">重新加载</ElButton>
      </ElAlert>
      <ElAlert v-else type="info" :closable="false" show-icon>
        {{
          isInitial ? '业务日期不得晚于库存组织启用日期。' : ''
        }}物料价格、税额、折扣与辅助数量由系统核算；退货以负数入账。
      </ElAlert>
      <ElAlert v-if="importIntent" type="success" :closable="false" show-icon>
        先选择库存组织及客户，再在“物料明细”中点击“导入明细”；导入后请核对仓储和价格信息。
      </ElAlert>
      <ArtSectionCard
        title="单据表头"
        :subtitle="
          issueRequest
            ? '生产工单可参选；选择工单或项目后自动带入客户，仍可修改。'
            : '填写业务日期、库存组织及业务归属；记账日期由系统记录。'
        "
      >
        <ArtDescriptions v-if="mode === 'view'" :data="viewData" :items="viewItems" :columns="3" />
        <ArtForm
          v-else
          ref="formRef"
          v-model="form"
          :items="headerItems"
          :rules="headerRules"
          :span="8"
          :gutter="18"
          label-position="top"
          :show-reset="false"
          :show-submit="false"
        >
          <template #projectId>
            <ArtTableSingleSelect
              v-model="form.projectId"
              :data="projects"
              :columns="partyColumns"
              row-key="id"
              label-key="name"
              description-key="code"
              title="选择项目"
              clearable
              @change="onHeaderProjectChange"
            />
          </template>
          <template #workOrderId>
            <ArtTableSingleSelect
              v-model="form.workOrderId"
              :api-fn="workOrderApi"
              :selected-data="selectedWorkOrder"
              :columns="workOrderColumns"
              label-key="workOrderNo"
              title="参选生产工单"
              :disabled="!form.warehouseId"
              clearable
              @update:selected-data="onWorkOrderSelected"
            />
          </template>
          <template #constructionNo>
            <ArtTableSingleSelect
              :model-value="form.constructionNo || undefined"
              @update:model-value="form.constructionNo = String($event || '') || null"
              :api-fn="(params) => constructionApi(form.projectId, params)"
              :columns="constructionColumns"
              row-key="constructionNo"
              label-key="constructionNo"
              title="参选施工号"
              :disabled="!form.projectId"
              clearable
            />
          </template>
          <template #customerId>
            <ArtTableSingleSelect
              :model-value="form.customerId || undefined"
              :selected-data="selectedCustomer"
              :data="customers"
              :columns="partyColumns"
              row-key="id"
              label-key="name"
              description-key="code"
              title="选择客户"
              placeholder="从销售主数据选择"
              :disabled="!form.tenantId"
              clearable
              @update:model-value="form.customerId = String($event || '')"
              @update:selected-data="selectedCustomer = $event"
            />
          </template>
          <template #salespersonId>
            <ArtEmployeeSelect
              :model-value="form.salespersonId || undefined"
              :selected-data="selectedSalesperson"
              :tenant-id="form.tenantId || undefined"
              :title="issueRequest ? '选择申请人' : '选择销售员'"
              :disabled="!form.tenantId"
              @update:model-value="form.salespersonId = $event || null"
              @update:selected-data="onSalespersonSelected"
            />
          </template>
          <template #keeperId>
            <ArtEmployeeSelect
              :model-value="form.keeperId || undefined"
              :selected-data="selectedKeeper"
              :tenant-id="form.tenantId || undefined"
              title="选择仓管员"
              :disabled="!form.tenantId"
              @update:model-value="onHeaderKeeperChange"
              @update:selected-data="selectedKeeper = $event"
            />
          </template>
        </ArtForm>
      </ArtSectionCard>
      <ArtSectionCard
        :title="issueRequest ? '申请物料' : isReturn ? '退货明细' : '物料明细'"
        :subtitle="`共 ${lines.length} 行 · 数量 ${quantityTotal.toFixed(4)} · 价税合计 ${totalAmount.toFixed(2)} 元`"
        :empty="lines.length === 0"
        empty-title="尚未选择物料"
        empty-description="先选择库存组织，再从物料编码中添加明细。"
      >
        <template #actions>
          <div
            v-if="mode !== 'view' && form.tenantId"
            class="flex flex-wrap items-center justify-end gap-2 whitespace-nowrap lg:flex-nowrap"
          >
            <ArtButtonMore
              v-if="isDailySales && !issueRequest"
              :list="sourceActions"
              trigger="click"
              @click="openSourceChoice"
            >
              <template #trigger
                ><ElButton
                  :disabled="
                    !form.organizationId || (props.kind === 'outbound' && !form.warehouseId)
                  "
                  plain
                  >选单<ArtSvgIcon icon="ri:arrow-down-s-line" /></ElButton
              ></template>
            </ArtButtonMore>
            <ElButton
              v-if="usesStockPicker"
              type="primary"
              :disabled="!form.warehouseId"
              @click="openStockChoice"
            >
              <ArtSvgIcon icon="ri:add-line" />添加物料
            </ElButton>
            <ArtMaterialSelect
              v-if="!usesStockPicker"
              v-model:model-values="materialPickerIds"
              v-model:selected-data="materialPickerRows"
              class="w-auto! shrink-0"
              title="选择销售物料"
              subtitle="可按物料编码、名称和描述检索并多选。"
              search-placeholder="搜索物料编码或描述"
              label-key="name"
              multiple
              :categories="materialCategories"
              :api-fn="materialApi"
              @confirm="addMaterials"
            >
              <template #trigger="{ open }"
                ><ElButton type="primary" @click="open"
                  ><ArtSvgIcon icon="ri:add-line" />添加物料</ElButton
                ></template
              >
            </ArtMaterialSelect>
            <span
              v-auth="importPermission"
              class="shrink-0"
              :title="form.organizationId ? '' : '请先选择库存组织'"
            >
              <ArtExcelImport
                accept=".xlsx,.xls,.csv"
                :context-key="openData"
                :disabled="!form.organizationId || importing || parsing"
                :button-props="{ type: 'success', plain: true, loading: importing || parsing }"
                icon="ri:upload-2-line"
                @parsing-change="onImportParsing"
                @import-success="importLines"
                @import-error="onImportError"
                >导入明细</ArtExcelImport
              >
            </span>
          </div>
        </template>
        <ElScrollbar v-if="lines.length">
          <ArtTable
            ref="lineTableRef"
            class="wms-editable-line-table"
            :data="lines"
            :columns="lineColumns"
            :pagination="false"
            :cell-class-name="salesLineCellClassName"
            row-key="lineNo"
            table-layout="fixed"
          >
            <template #material="{ row }">
              <ArtMaterialSelect
                v-if="issueRequest && mode !== 'view'"
                v-model:model-values="materialPickerIds"
                v-model:selected-data="materialPickerRows"
                title="参选物料描述"
                label-key="description"
                multiple
                :categories="materialCategories"
                :api-fn="materialApi"
                @confirm="addMaterials"
              >
                <template #trigger="{ open }"
                  ><ElButton link type="primary" @click="open">{{
                    row.material?.description || row.material?.name || '参选物料描述'
                  }}</ElButton></template
                >
              </ArtMaterialSelect>
              <template v-else>
                <strong class="block truncate text-sm">{{
                  row.material?.description ||
                  row.material?.name ||
                  row.material?.code ||
                  '物料资料不可用'
                }}</strong>
                <small class="text-[var(--el-text-color-secondary)]">{{
                  row.material?.code || '—'
                }}</small>
              </template>
            </template>
            <template #returnType="{ row }">
              <ElSelect v-if="mode !== 'view'" v-model="row.returnType" placeholder="退货类型">
                <ElOption
                  v-for="option in returnTypes"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </ElSelect>
              <ArtDictDisplay
                v-else
                dict-code="wmsInitialSalesReturnType"
                :value="row.returnType"
                display="text"
              />
            </template>
            <template #projectId="{ row }">
              <ArtTableSingleSelect
                v-if="mode !== 'view'"
                :model-value="row.projectId || undefined"
                :selected-data="row.project ? [row.project] : []"
                :data="projects"
                :columns="partyColumns"
                row-key="id"
                label-key="name"
                description-key="code"
                title="选择销售项目"
                placeholder="选择项目"
                clearable
                @update:model-value="onInlineProjectChange(row, String($event || '') || null)"
                @update:selected-data="row.project = $event[0] || null"
              />
              <span v-else>{{ projectName(row.projectId) }}</span>
            </template>
            <template #constructionNo="{ row }">
              <ArtTableSingleSelect
                v-if="mode !== 'view'"
                :model-value="row.constructionNo || undefined"
                @update:model-value="row.constructionNo = String($event || '') || null"
                :api-fn="(params) => constructionApi(row.projectId, params)"
                :columns="constructionColumns"
                row-key="constructionNo"
                label-key="constructionNo"
                title="参选施工号"
                clearable
                :disabled="!row.projectId"
                placeholder="施工号"
              />
              <span v-else>{{ row.constructionNo || '—' }}</span>
            </template>
            <template #quantity="{ row }">
              <ElInputNumber
                v-if="mode !== 'view'"
                :model-value="Math.abs(Number(row.quantity || 0))"
                @update:model-value="row.quantity = Math.abs(Number($event || 0))"
                :min="0"
                :precision="4"
                :controls="false"
                class="w-full!"
                ><template v-if="usesCurrencyQuantities" #prefix>￥</template></ElInputNumber
              >
              <strong v-else :class="isReturn ? 'sales-return-quantity' : 'tabular-nums'">{{
                formatSalesValue(displayQuantity(Number(row.quantity)))
              }}</strong>
            </template>
            <template #inventoryUnitId="{ row }">
              <ElSelect
                v-if="mode !== 'view'"
                v-model="row.inventoryUnitId"
                filterable
                placeholder="库存单位"
                ><ElOption
                  v-for="unit in salesUnitOptions"
                  :key="unit.value"
                  :label="unit.label"
                  :value="unit.value"
              /></ElSelect>
              <span v-else>{{ unitName(row.inventoryUnitId) }}</span>
            </template>
            <template #baseUnitId="{ row }">
              <ElSelect
                v-if="mode !== 'view'"
                v-model="row.baseUnitId"
                filterable
                placeholder="基本单位"
              >
                <ElOption
                  v-for="unit in salesUnitOptions"
                  :key="unit.value"
                  :label="unit.label"
                  :value="unit.value"
                />
              </ElSelect>
              <span v-else>{{ unitName(row.baseUnitId) }}</span>
            </template>
            <template #baseQuantity="{ row }">
              <ElInputNumber
                v-if="issueRequest && mode !== 'view'"
                v-model="row.baseQuantity"
                :min="0"
                :precision="4"
                :controls="false"
                class="w-full!"
              />
              <template v-else>{{
                formatSalesValue(
                  mode === 'view' ? Math.abs(Number(row.baseQuantity || 0)) : baseQuantity(row)
                )
              }}</template></template
            >
            <template #auxiliaryUnitId="{ row }">{{ unitName(row.auxiliaryUnitId) }}</template>
            <template #auxiliaryQuantity="{ row }">{{
              mode === 'view'
                ? row.auxiliaryQuantity == null
                  ? '—'
                  : Math.abs(Number(row.auxiliaryQuantity))
                : auxQuantity(row, row.auxiliaryUnitId)
            }}</template>
            <template #auxiliaryUnit2Id="{ row }">{{ unitName(row.auxiliaryUnit2Id) }}</template>
            <template #auxiliaryQuantity2="{ row }">{{
              mode === 'view'
                ? row.auxiliaryQuantity2 == null
                  ? '—'
                  : Math.abs(Number(row.auxiliaryQuantity2))
                : auxQuantity(row, row.auxiliaryUnit2Id)
            }}</template>
            <template #unitPrice="{ row }"
              ><ElInputNumber
                v-if="mode !== 'view'"
                v-model="row.unitPrice"
                :min="0"
                :precision="4"
                :controls="false"
                class="w-full!"
                @change="updatePrice(row, 'untaxed')"
              /><span v-else>{{ Number(row.unitPrice).toFixed(4) }}</span></template
            >
            <template #taxInclusiveUnitPrice="{ row }"
              ><ElInputNumber
                v-if="mode !== 'view'"
                v-model="row.taxInclusiveUnitPrice"
                :min="0"
                :precision="4"
                :controls="false"
                class="w-full!"
                @change="updatePrice(row, 'taxed')"
              /><span v-else>{{ Number(row.taxInclusiveUnitPrice).toFixed(4) }}</span></template
            >
            <template #taxRate="{ row }"
              ><ElSelect
                v-if="mode !== 'view'"
                v-model="row.taxRate"
                @change="updatePrice(row, row.priceBasis)"
                ><ElOption
                  v-for="rate in taxRateOptions"
                  :key="rate.value"
                  :label="rate.label"
                  :value="rate.value" /></ElSelect
              ><span v-else>{{ row.taxRate }}%</span></template
            >
            <template #discountMethod="{ row }"
              ><ElSelect
                v-if="mode !== 'view'"
                v-model="row.discountMethod"
                @change="row.unitDiscountRate = 0"
                ><ElOption
                  v-for="option in wmsLineDiscountModeOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value" /></ElSelect
              ><span v-else>{{ row.discountMethod }}</span></template
            >
            <template #unitDiscountRate="{ row }"
              ><ElInputNumber
                v-if="mode !== 'view'"
                v-model="row.unitDiscountRate"
                :min="0"
                :max="1"
                :precision="4"
                :controls="false"
                :disabled="row.discountMethod === 'none'"
                class="w-full!"
              /><span v-else>{{ row.unitDiscountRate }}</span></template
            >
            <template #discountAmount="{ row }">{{
              lineFinancial(row).discount.toFixed(2)
            }}</template>
            <template #amount="{ row }">{{
              formatSalesValue(lineFinancial(row).amount, 2)
            }}</template>
            <template #taxAmount="{ row }">{{
              formatSalesValue(lineFinancial(row).tax, 2)
            }}</template>
            <template #totalAmount="{ row }">{{
              formatSalesValue(lineFinancial(row).total, 2)
            }}</template>
            <template #gift="{ row }"
              ><ElCheckbox v-if="mode !== 'view'" v-model="row.gift" aria-label="赠品" /><span
                v-else
                >{{ row.gift ? '✓' : '—' }}</span
              ></template
            >
            <template #batchNo="{ row }"
              ><ElInput v-if="mode !== 'view'" v-model="row.batchNo" placeholder="批号" /><span
                v-else
                >{{ row.batchNo || '—' }}</span
              ></template
            >
            <template #warehouseId="{ row }"
              ><ElSelect
                v-if="mode !== 'view'"
                v-model="row.warehouseId"
                filterable
                clearable
                placeholder="仓库"
                @change="onInlineWarehouseChange(row)"
                ><ElOption
                  v-for="warehouse in currentWarehouses"
                  :key="warehouse.id"
                  :label="`${warehouse.warehouseName} · ${warehouse.warehouseCode}`"
                  :value="warehouse.id" /></ElSelect
              ><span v-else>{{
                currentWarehouses.find((item) => item.id === row.warehouseId)?.warehouseName || '—'
              }}</span></template
            >
            <template #binId="{ row }"
              ><ElSelect
                v-if="mode !== 'view'"
                v-model="row.binId"
                filterable
                clearable
                :disabled="!row.warehouseId"
                placeholder="仓位"
                @visible-change="($event) => $event && loadInlineBins(row)"
                ><ElOption
                  v-for="bin in bins"
                  :key="bin.id"
                  :label="`${bin.binName} · ${bin.binCode}`"
                  :value="bin.id" /></ElSelect
              ><span v-else>{{
                row.bin?.binName || row.bin?.binCode || (row.binId ? '仓位资料不可用' : '—')
              }}</span></template
            >
            <template #stockType="{ row }"
              ><ElSelect v-if="mode !== 'view'" v-model="row.stockType"
                ><ElOption
                  v-for="option in stockTypes"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value" /></ElSelect
              ><span v-else>{{
                stockTypes.find((item) => item.value === row.stockType)?.label || row.stockType
              }}</span></template
            >
            <template #ownerType="{ row }"
              ><ElSelect
                v-if="mode !== 'view'"
                v-model="row.ownerType"
                @change="onInlineOwnerTypeChange(row)"
                ><ElOption
                  v-for="option in ownerTypes"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value" /></ElSelect
              ><span v-else>{{
                ownerTypes.find((item) => item.value === row.ownerType)?.label || row.ownerType
              }}</span></template
            >
            <template #ownerId="{ row }"
              ><ArtTableSingleSelect
                v-if="mode !== 'view' && row.ownerType !== 'self'"
                :model-value="row.ownerId || undefined"
                :data="row.ownerType === 'supplier' ? suppliers : customers"
                :columns="partyColumns"
                row-key="id"
                label-key="name"
                description-key="code"
                title="选择货主"
                @update:model-value="onInlineOwnerChange(row, String($event || '') || null)"
              /><span v-else>{{
                formatWmsOwnerName(row.ownerType, row.ownerId, suppliers, customers)
              }}</span></template
            >
            <template #stockStatus="{ row }"
              ><ElSelect v-if="mode !== 'view'" v-model="row.stockStatus"
                ><ElOption
                  v-for="option in stockStatuses"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value" /></ElSelect
              ><span v-else>{{
                stockStatuses.find((item) => item.value === row.stockStatus)?.label ||
                row.stockStatus
              }}</span></template
            >
            <template #keeperId="{ row }">
              <ArtEmployeeSelect
                v-if="mode !== 'view'"
                :model-value="row.keeperId || undefined"
                :tenant-id="form.tenantId || undefined"
                title="选择行仓管员"
                @update:model-value="row.keeperId = $event || null"
              />
              <ArtEmployeeSelect
                v-else
                :model-value="row.keeperId || undefined"
                :tenant-id="form.tenantId || undefined"
                disabled
              />
            </template>
            <template #productionDate="{ row }"
              ><ElDatePicker
                v-if="mode !== 'view'"
                v-model="row.productionDate"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="生产日期"
                class="w-full!"
              /><span v-else>{{ row.productionDate || '—' }}</span></template
            >
            <template #expiryDate="{ row }"
              ><ElDatePicker
                v-if="mode !== 'view'"
                v-model="row.expiryDate"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="有效期至"
                class="w-full!"
              /><span v-else>{{ row.expiryDate || '—' }}</span></template
            >
            <template #trackingNo="{ row }"
              ><ElInput v-if="mode !== 'view'" v-model="row.trackingNo" placeholder="跟踪号" /><span
                v-else
                >{{ row.trackingNo || '—' }}</span
              ></template
            >
            <template #sourceDocument="{ row }"
              ><ElInput
                v-if="mode !== 'view'"
                v-model="row.sourceDocument"
                placeholder="来源单据"
              /><span v-else>{{ row.sourceDocument || '—' }}</span></template
            >
            <template #sourceLineNo="{ row }"
              ><ElInput
                v-if="mode !== 'view'"
                v-model="row.sourceLineNo"
                placeholder="源行号"
              /><span v-else>{{ row.sourceLineNo || '—' }}</span></template
            >
            <template #remark="{ row }"
              ><ElInput v-if="mode !== 'view'" v-model="row.remark" placeholder="备注" /><span
                v-else
                >{{ row.remark || '—' }}</span
              ></template
            >
            <template #operation="{ row }">
              <ElButton
                v-if="row.material?.serialManagementEnabled"
                link
                type="primary"
                @click="openInlineSerials(row)"
                >序列号 {{ row.serialNos.length }}</ElButton
              >
              <ArtButtonMore
                v-if="mode !== 'view'"
                :list="lineMoreActions"
                trigger="click"
                @click="(item) => onLineMoreAction(item, row)"
              />
            </template>
          </ArtTable>
        </ElScrollbar>
      </ArtSectionCard>
    </div>
  </ArtDrawer>
  <SalesChoicePicker
    ref="choicePickerRef"
    :kind="choiceKind"
    :tenant-id="form.tenantId"
    :organization-id="form.organizationId"
    :warehouse-id="form.warehouseId"
    :exclude-document-id="form.id || undefined"
    @confirm="addChoices"
  />

  <ArtDialog ref="serialEntryDialogRef" size="sm" :show-footer="mode !== 'view'">
    <ArtExcelImport
      accept=".txt,.csv"
      :parse-excel="false"
      :button-props="{ link: true, type: 'primary' }"
      @file-change="importSerials"
      >导入序列号</ArtExcelImport
    >
    <ArtForm
      :model-value="serialEntryForm"
      @update:model-value="replaceReactiveModel(serialEntryForm, $event)"
      :items="serialEntryItems"
      :show-reset="false"
      :show-submit="false"
      label-position="top"
    />
  </ArtDialog>
  <ArtDialog ref="serialViewDialogRef" size="sm" :show-footer="false">
    <ArtEmptyState
      v-if="!serialList.length"
      size="compact"
      title="暂无序列号"
      description="录入或导入序列号后可在这里查看。"
    />
    <ElScrollbar
      v-else
      max-height="24rem"
      class="rounded-xl bg-[var(--el-fill-color-light)] font-mono text-sm whitespace-pre-wrap"
      ><div class="p-4">{{ serialList.join('\n') }}</div></ElScrollbar
    >
  </ArtDialog>
</template>

<script setup lang="ts">
  import { getMaterialCategoryIds } from '@/utils/business/material-category'
  import { issueRequestTypeLabels } from '@wms/views/shared/issue-request-types'
  import { readWmsDocumentImportRows } from '@/utils/wms/document-import'
  import { createImportReferenceLookup } from '@/utils/business/import-reference'
  import { formatWmsOwnerName } from '@/utils/wms/owner-display'
  import { replaceReactiveModel } from '@/utils/form/model'
  import { formatUnitDisplayName } from '@/utils/business/unit-display'
  import { isWmsBusinessTypeAvailable } from '@/utils/wms/business-type'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { fetchWmsConstructionOptions } from '@/api/wms-purchase-selection'
  import { useWarehouseBinOptions } from '@/hooks/core/useWarehouseBinOptions'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { parseSerialNumberText } from '@/utils/file/serial-number-text'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import dayjs from 'dayjs'
  import { cloneDeep } from 'lodash-es'
  import { ElMessage } from 'element-plus'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import { useUserStore } from '@/store/modules/user'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import ArtExcelImport from '@/components/core/forms/art-excel-import/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtButtonMore, {
    type ButtonMoreItem
  } from '@/components/core/forms/art-button-more/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import ArtMaterialSelect from '@/components/business/art-material-select/index.vue'
  import type {
    MaterialSelectCategory,
    MaterialSelectRecord
  } from '@/components/business/art-material-select/types'
  import ArtTableSingleSelect from '@/components/core/forms/art-data-select/table-single.vue'
  import { fetchWmsMaterialCategories } from '@/api/wms-material-category'
  import type {
    DataSelectRecord,
    DataSelectFetchParams
  } from '@/components/core/forms/art-data-select/types'
  import {
    fetchEmployeeReferencesByIds,
    type EmployeeIntegrationItem
  } from '@/api/integration/employees'
  import SalesChoicePicker from './sales-choice-picker.vue'
  import type { WmsSalesChoice, WmsSalesSourceKind } from '@wms/api'
  import { fetchEnabledOrganizationTree } from '@/api/system-manage'
  import type { ColumnOption } from '@/types'
  import {
    fetchWmsBins,
    createWmsIssueRequest,
    fetchWmsWorkOrderOptions,
    type WmsWorkOrderOption,
    fetchWmsInitialDocumentTypes,
    fetchWmsInitialMenuId,
    fetchWmsInitialMaterials,
    fetchWmsInitialOptions,
    fetchWmsInitialSalesDocument,
    fetchWmsInventoryOrganizations,
    fetchWmsUnitOptions,
    fetchWmsWarehouses,
    saveWmsInitialSalesDocument,
    type WmsBin,
    type WmsInitialMaterial,
    type WmsInitialSalesDocument,
    type WmsInitialSalesKind,
    type WmsInitialSalesLine,
    type WmsInitializationOption,
    type WmsInventoryOrganization,
    type WmsUnitOption,
    type WmsWarehouse
  } from '@wms/api'

  const wmsLineDiscountModeOptions = useDictionaryOptions('wmsLineDiscountMode')
  const requestTypeDictionary = useDictionaryOptions('wmsIssueReason')
  const requestTypeOptions = computed(() =>
    Object.entries(issueRequestTypeLabels).map(([value, label]) => ({
      value,
      label: requestTypeDictionary.find((option) => option.value === value)?.label || label
    }))
  )
  const taxRateDictionary = useDictionaryOptions('scmTaxRate', Number)
  const taxRateOptions = computed(() =>
    taxRateDictionary.filter((item) => Number.isFinite(item.value))
  )

  type OpenMode = 'create' | 'copy' | 'edit' | 'view'
  interface OpenData {
    tenantId?: string
    requestWorkOrderId?: string
    mode: OpenMode
    document?: WmsInitialSalesDocument
    documentId?: string
    importIntent?: boolean
  }
  const props = defineProps<{
    kind: WmsInitialSalesKind
    importPermission: string
    issueRequest?: boolean
  }>()
  const emit = defineEmits<{ success: [] }>()
  const userStore = useUserStore()
  const drawerRef = ref<ArtDrawerExpose<OpenData>>()
  const serialEntryDialogRef = ref<ArtDialogExpose>()
  const serialViewDialogRef = ref<ArtDialogExpose>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const lineTableRef = ref<InstanceType<typeof ArtTable>>()
  const mode = ref<OpenMode>('create')
  const importIntent = ref(false)
  const currentDocument = shallowRef<WmsInitialSalesDocument | null>(null)
  const optionError = ref(false)
  const documentError = ref('')
  const openData = shallowRef<OpenData>()
  let documentRequest = 0
  const importing = ref(false)
  const parsing = ref(false)
  const organizations = ref<WmsInventoryOrganization[]>([])
  const organizationTree = ref<Api.SystemManage.OrganizationListItem[]>([])
  const warehouses = ref<WmsWarehouse[]>([])
  const units = ref<WmsUnitOption[]>([])
  const documentTypes = ref<WmsInitializationOption[]>([])
  const businessTypes = ref<WmsInitializationOption[]>([])
  const businessMenuId = ref('')
  const customers = ref<WmsInitializationOption[]>([])
  const suppliers = ref<WmsInitializationOption[]>([])
  const projects = ref<WmsInitializationOption[]>([])
  const {
    options: bins,
    load: loadInlineBins,
    invalidate: invalidateBins
  } = useWarehouseBinOptions<WmsInitialSalesLine, WmsBin>(() => lines.value, fetchWmsBins)
  const lines = ref<WmsInitialSalesLine[]>([])
  const choicePickerRef = ref<InstanceType<typeof SalesChoicePicker>>()
  const choiceKind = ref<WmsSalesSourceKind>('stock')
  const isDailySales = computed(() => ['outbound', 'return', 'other_outbound'].includes(props.kind))
  const usesStockPicker = computed(
    () => props.issueRequest || ['outbound', 'other_outbound'].includes(props.kind)
  )
  const selectedWorkOrder = ref<WmsWorkOrderOption[]>([])
  const constructionColumns = [
    { prop: 'constructionNo', label: '施工号', minWidth: 160 },
    { prop: 'sectionName', label: '施工名称', minWidth: 220 }
  ]
  async function constructionApi(
    projectId: string | null | undefined,
    params: DataSelectFetchParams
  ) {
    if (!projectId || !form.value.tenantId) return { data: [], total: 0 }
    const data = await fetchWmsConstructionOptions(projectId, form.value.tenantId, params.keyword)
    return { data, total: data.length }
  }
  const workOrderColumns = [
    { prop: 'workOrderNo', label: '生产工单', minWidth: 180 },
    { prop: 'projectName', label: '项目名称', minWidth: 180 },
    { prop: 'constructionNo', label: '施工号', minWidth: 140 },
    { prop: 'materialCode', label: '物料编码', minWidth: 140 },
    { prop: 'materialDescription', label: '物料描述', minWidth: 200 },
    { prop: 'specificationModel', label: '规格型号', minWidth: 150 },
    { prop: 'drawingNo', label: '图号', minWidth: 130 },
    { prop: 'orderQuantity', label: '订单数量', minWidth: 130 }
  ]
  async function workOrderApi(params: DataSelectFetchParams) {
    if (!form.value.warehouseId) return { data: [], total: 0 }
    const data = (
      await fetchWmsWorkOrderOptions(form.value.warehouseId, params.keyword || '')
    ).filter(
      (row) =>
        row.tenantId === form.value.tenantId && row.organizationId === form.value.organizationId
    )
    return { data, total: data.length }
  }
  function onWorkOrderSelected(rows: WmsWorkOrderOption[]): void {
    selectedWorkOrder.value = rows
    const order = rows[0]
    if (!order) return
    form.value.projectId = order.projectId || undefined
    form.value.constructionNo = order.constructionNo || null
    onHeaderProjectChange()
    if (order.customerId) {
      form.value.customerId = order.customerId
      selectedCustomer.value = customers.value.filter((item) => item.id === order.customerId)
    }
  }
  const sourceActions = computed<ButtonMoreItem[]>(() =>
    (props.kind === 'other_outbound'
      ? [{ key: 'issue_request', label: '出库申请单', icon: 'ri:file-list-3-line' }]
      : props.kind === 'return'
        ? [
            { key: 'outbound', label: '销售出库单', icon: 'ri:inbox-unarchive-line' },
            { key: 'return_request', label: '销售退货单', icon: 'ri:arrow-go-back-line' }
          ]
        : [
            { key: 'sales_order', label: '销售订单', icon: 'ri:shopping-cart-line' },
            { key: 'shipping_notice', label: '发货通知单', icon: 'ri:truck-line' }
          ]
    ).map((item) => ({ ...item, auth: lineEditPermission.value }))
  )
  async function openSourceChoice(item: ButtonMoreItem): Promise<void> {
    if (
      !['sales_order', 'shipping_notice', 'outbound', 'return_request', 'issue_request'].includes(
        String(item.key)
      )
    )
      return
    choiceKind.value = item.key as WmsSalesSourceKind
    await nextTick()
    await choicePickerRef.value?.open()
  }
  async function openStockChoice(): Promise<void> {
    choiceKind.value = props.issueRequest
      ? 'request_stock'
      : props.kind === 'other_outbound'
        ? 'other_stock'
        : 'stock'
    await nextTick()
    await choicePickerRef.value?.open()
  }
  function addChoices(rows: WmsSalesChoice[]): void {
    if (rows.some((row) => row.material.tenantId !== form.value.tenantId)) {
      ElMessage.warning('来源租户已变更，请重新选单')
      return
    }
    const customerIds = new Set(rows.map((row) => row.customerId).filter(Boolean))
    if (
      customerIds.size > 1 ||
      (lines.value.length &&
        rows.some((row) => row.customerId && row.customerId !== form.value.customerId))
    ) {
      ElMessage.warning('请选择同一客户的来源明细')
      return
    }
    const customerId = rows.find((row) => row.customerId)?.customerId
    if (customerId) {
      form.value.customerId = customerId
      selectedCustomer.value = customers.value.filter((item) => item.id === customerId)
    }
    if (choiceKind.value === 'issue_request' && rows[0]?.usingDepartmentId)
      form.value.usingDepartmentId = rows[0].usingDepartmentId
    let added = 0
    for (const row of rows) {
      if (
        lines.value.some(
          (line) =>
            line.stockBatchId === row.line.stockBatchId &&
            line.sourceDocumentId === row.sourceDocumentId &&
            line.sourceLineId === row.sourceLineId
        )
      )
        continue
      const line = {
        ...makeLine(row.material),
        ...row.line,
        material: row.material,
        availableQuantity: row.availableQuantity,
        allocatedQuantity: row.allocatedQuantity,
        issuedQuantity: row.outboundQuantity,
        quantity: Math.min(
          row.deliverableQuantity,
          props.kind === 'return' ? row.deliverableQuantity : row.availableQuantity
        ),
        unitPrice: row.unitPrice,
        taxRate: row.taxRate,
        serialNos: props.kind === 'return' ? [...row.serialNos] : [],
        sourceDocument: row.documentNo,
        packNo: row.packNo,
        sourceLineNo: row.lineNo == null ? null : String(row.lineNo),
        sourceDocumentId: row.sourceDocumentId,
        sourceLineId: row.sourceLineId
      }
      updatePrice(line, 'untaxed')
      line.baseQuantity = baseQuantity(line)
      line.project = projects.value.find((project) => project.id === line.projectId) || null
      lines.value.push(line)
      added++
    }
    renumber()
    ElMessage.success(`已添加 ${added} 行，请核对本次数量与序列号`)
  }
  const selectableOrganizationTree = computed(() => {
    const selectableIds = new Set(
      organizations.value
        .filter(
          (item) =>
            item.enabledOn &&
            (isInitial.value ? !item.initializationClosedAt : item.initializationClosedAt)
        )
        .map((item) => item.id)
    )
    const decorate = (
      nodes: Api.SystemManage.OrganizationListItem[]
    ): Array<Api.SystemManage.OrganizationListItem & { disabled: boolean }> =>
      nodes.map((node) => ({
        ...node,
        disabled: !node.id || !selectableIds.has(node.id),
        children: node.children ? decorate(node.children) : undefined
      }))
    return decorate(organizationTree.value)
  })
  const permissionPrefix = computed(() =>
    props.issueRequest
      ? 'WmsIssueRequest'
      : {
          initial_outbound: 'WmsInitialSalesOutbound',
          initial_return: 'WmsInitialSalesReturn',
          outbound: 'WmsSalesOutbound',
          return: 'WmsSalesReturnDocument',
          other_outbound: 'WmsOtherOutbound',
          other_return: 'WmsOtherOutbound'
        }[props.kind]
  )
  const lineEditPermission = computed(
    () =>
      `${permissionPrefix.value}:${mode.value === 'create' ? 'Add' : mode.value === 'copy' ? 'Copy' : 'Edit'}`
  )
  const lineMoreActions = computed<ButtonMoreItem[]>(() => [
    {
      key: 'copy-line',
      label: '复制明细',
      icon: 'ri:file-copy-line',
      auth: lineEditPermission.value
    },
    {
      key: 'delete-line',
      label: '删除明细',
      icon: 'ri:delete-bin-line',
      color: 'var(--el-color-danger)',
      auth: lineEditPermission.value
    }
  ])
  const lineColumns = computed<ColumnOption<WmsInitialSalesLine>[]>(() => [
    { prop: 'lineNo', label: '行号', width: 68 },
    {
      prop: 'material',
      label: '物料描述',
      minWidth: 230,
      useSlot: true,
      required: mode.value !== 'view'
    },
    { prop: 'material.code', label: '物料编码', minWidth: 150 },
    { prop: 'material.specificationModel', label: '规格型号', minWidth: 160 },
    { prop: 'material.drawingNo', label: '图号', minWidth: 140 },
    { prop: 'material.brand', label: '品牌', minWidth: 130 },
    ...(isReturn.value
      ? [{ prop: 'returnType', label: '退货类型', minWidth: 110, useSlot: true }]
      : []),
    { prop: 'projectId', label: '项目名称', minWidth: 150, useSlot: true },
    { prop: 'constructionNo', label: '施工号', width: 150, useSlot: true },
    { prop: 'project.code', label: '项目编码', minWidth: 150 },
    {
      prop: 'quantity',
      label: props.issueRequest ? '申请数量' : '数量',
      width: 180,
      align: 'right',
      useSlot: true,
      required: mode.value !== 'view'
    },
    { prop: 'availableQuantity', label: '可用库存量', width: 130 },
    { prop: 'allocatedQuantity', label: '已分配量', width: 120 },
    ...(props.issueRequest
      ? [
          { prop: 'issuedQuantity', label: '累计出库数量', width: 140 },
          {
            prop: 'remainingQuantity',
            label: '未出库数量',
            width: 140,
            formatter: (row: WmsInitialSalesLine) =>
              Math.max(Math.abs(row.quantity) - (row.issuedQuantity || 0), 0)
          }
        ]
      : []),
    {
      prop: 'inventoryUnitId',
      label: '库存单位',
      width: 110,
      useSlot: true,
      required: mode.value !== 'view'
    },
    { prop: 'baseUnitId', label: '基本单位', width: 130, useSlot: true },
    { prop: 'baseQuantity', label: '基本数量', width: 110, align: 'right', useSlot: true },
    { prop: 'auxiliaryUnitId', label: '辅助单位', width: 110, useSlot: true },
    { prop: 'auxiliaryQuantity', label: '辅助数量', width: 110, useSlot: true },
    { prop: 'auxiliaryUnit2Id', label: '辅助单位2', width: 110, useSlot: true },
    { prop: 'auxiliaryQuantity2', label: '辅助数量2', width: 110, useSlot: true },
    { prop: 'unitPrice', label: '未税单价', width: 180, align: 'right', useSlot: true },
    { prop: 'taxInclusiveUnitPrice', label: '含税单价', width: 180, align: 'right', useSlot: true },
    {
      prop: 'taxRate',
      label: '税率',
      width: 100,
      align: 'right',
      useSlot: true,
      required: mode.value !== 'view',
      rules: {
        validator: ({ value }) =>
          Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100,
        message: '请选择有效税率'
      }
    },
    { prop: 'discountMethod', label: '折扣方式', width: 130, useSlot: true },
    { prop: 'unitDiscountRate', label: '单位折扣', width: 120, useSlot: true },
    { prop: 'discountAmount', label: '折扣额', width: 110, align: 'right', useSlot: true },
    { prop: 'amount', label: '金额', width: 110, align: 'right', useSlot: true },
    { prop: 'taxAmount', label: '税额(元)', width: 110, align: 'right', useSlot: true },
    { prop: 'totalAmount', label: '价税合计', width: 124, align: 'right', useSlot: true },
    { prop: 'gift', label: '赠品', width: 68, align: 'center', useSlot: true },
    { prop: 'batchNo', label: '批号', width: 145, useSlot: true },
    {
      prop: 'packNo',
      label: '包号',
      width: 145,
      formatter: (row: WmsInitialSalesLine) => row.packNo || row.stockBatch?.pack?.packNo || '—'
    },
    { prop: 'warehouseId', label: '仓库', width: 180, useSlot: true },
    { prop: 'binId', label: '仓位', width: 155, useSlot: true },
    {
      prop: 'stockType',
      label: '库存类型',
      width: 160,
      useSlot: true,
      required: mode.value !== 'view'
    },
    { prop: 'ownerType', label: '货主类型', width: 160, useSlot: true },
    { prop: 'ownerId', label: '货主', width: 170, useSlot: true },
    { prop: 'stockStatus', label: '库存状态', width: 160, useSlot: true },
    { prop: 'keeperId', label: '仓管员', width: 170, useSlot: true },
    { prop: 'productionDate', label: '生产日期', width: 190, useSlot: true },
    { prop: 'expiryDate', label: '有效期至', width: 190, useSlot: true },
    { prop: 'trackingNo', label: '跟踪号', width: 150, useSlot: true },
    { prop: 'sourceDocument', label: '来源单据', width: 150, useSlot: true },
    { prop: 'sourceLineNo', label: '源行号', width: 120, useSlot: true },
    { prop: 'remark', label: '备注', width: 180, useSlot: true },
    {
      prop: 'operation',
      label: '操作',
      width: 135,
      fixed: 'right',
      useSlot: true
    }
  ])
  const materialPickerIds = ref<string[]>([])
  const materialPickerRows = ref<MaterialSelectRecord[]>([])
  const materialCategories = ref<MaterialSelectCategory[]>([])
  const selectedCustomer = ref<DataSelectRecord[]>([])
  const selectedSalesperson = ref<EmployeeIntegrationItem[]>([])
  const selectedKeeper = ref<EmployeeIntegrationItem[]>([])
  const serialLine = ref<WmsInitialSalesLine>()
  const serialText = ref('')
  const serialEntryForm = reactive({ serialText: '' })
  const serialEntryItems: FormItem[] = [
    {
      key: 'serialText',
      label: '序列号',
      type: 'input',
      span: 24,
      props: {
        type: 'textarea',
        rows: 10,
        maxlength: undefined,
        showWordLimit: false,
        placeholder: '每行一个序列号；导入后核对，再保存到当前明细'
      }
    }
  ]
  const form = ref({
    requestType: 'consumables_outbound',
    workOrderId: undefined as string | undefined,
    constructionNo: null as string | null,
    usingDepartmentId: undefined as string | undefined,
    id: '',
    tenantId: '',
    organizationId: '',
    documentNo: '',
    documentTypeId: '',
    businessTypeId: '',
    businessDate: '',
    accountingDate: dayjs().format('YYYY-MM-DD'),
    customerId: '',
    projectId: undefined as string | undefined,
    warehouseId: undefined as string | undefined,
    salespersonId: null as string | null,
    salesDepartmentId: null as string | null,
    keeperId: null as string | null,
    status: 'draft' as WmsInitialSalesDocument['status'],
    isInitialization: true,
    remark: ''
  })
  void userStore.ensureDictLoaded('wmsInitialStockType')
  void userStore.ensureDictLoaded('wmsInitialStockCondition')
  void userStore.ensureDictLoaded('wmsInitialSalesReturnType')
  void userStore.ensureDictLoaded('mdmBusinessOwnerType')
  const stockTypes = computed(() => userStore.getDictMap['wmsInitialStockType'] ?? [])
  const stockStatuses = computed(() => userStore.getDictMap['wmsInitialStockCondition'] ?? [])
  const returnTypes = computed(() => userStore.getDictMap['wmsInitialSalesReturnType'] ?? [])
  const ownerTypes = computed(() => userStore.getDictMap['mdmBusinessOwnerType'] ?? [])
  const isReturn = computed(() => ['initial_return', 'return', 'other_return'].includes(props.kind))
  const usesCurrencyQuantities = computed(
    () => !props.issueRequest && ['return', 'other_outbound', 'other_return'].includes(props.kind)
  )
  const isInitial = computed(() => props.kind.startsWith('initial_'))
  const isOpeningReturn = computed(() => props.kind === 'initial_return')
  const title = computed(() =>
    props.issueRequest
      ? '出库申请单'
      : {
          initial_outbound: '期初销售出库单',
          initial_return: '期初销售退货单',
          outbound: '销售出库单',
          return: '销售退货单',
          other_outbound: '其他出库单',
          other_return: '其他出库退回单'
        }[props.kind]
  )
  const statusLabel = computed(
    () => ({ draft: '暂存', submitted: '已提交', approved: '已审核' })[form.value.status]
  )
  const documentTypeMenuName = computed(() =>
    props.issueRequest
      ? 'WmsIssueRequest'
      : {
          initial_outbound: 'WmsInitialSalesOutbound',
          initial_return: 'WmsInitialSalesReturn',
          outbound: 'WmsSalesOutbound',
          return: 'WmsSalesReturnDocument',
          other_outbound: 'WmsOtherOutbound',
          other_return: 'WmsOtherOutbound'
        }[props.kind]
  )
  const selectedOrganization = computed(() =>
    organizations.value.find((item) => item.id === form.value.organizationId)
  )
  const viewData = computed(() => ({
    documentNo: form.value.documentNo,
    organization:
      currentDocument.value?.organization?.organizationName ||
      selectedOrganization.value?.organizationName ||
      '—',
    organizationCode:
      currentDocument.value?.organization?.organizationCode ||
      selectedOrganization.value?.organizationCode ||
      '—',
    documentType:
      documentTypes.value.find((item) => item.id === form.value.documentTypeId)?.name ||
      title.value,
    businessType:
      businessTypes.value.find((item) => item.id === form.value.businessTypeId)?.name || '—',
    businessDate: form.value.businessDate,
    accountingDate: form.value.accountingDate,
    customer:
      currentDocument.value?.customer?.customerName ||
      customers.value.find((item) => item.id === form.value.customerId)?.name ||
      '—',
    usingDepartment: currentDocument.value?.usingDepartment?.organizationName || '—',
    salesDepartment:
      organizations.value.find((item) => item.id === form.value.salesDepartmentId)
        ?.organizationName || '—',
    salesperson:
      currentDocument.value?.salesperson?.employeeName ||
      (form.value.salespersonId ? '已指定' : '未指定'),
    keeper:
      currentDocument.value?.keeper?.employeeName || (form.value.keeperId ? '已指定' : '未指定'),
    project: projects.value.find((item) => item.id === form.value.projectId)?.name || '—',
    warehouse:
      warehouses.value.find((item) => item.id === form.value.warehouseId)?.warehouseName || '—',
    initialization: form.value.isInitialization ? '是' : '否',
    remark: form.value.remark || '—'
  }))
  const viewItems: ArtDescriptionItem<typeof viewData.value>[] = [
    { key: 'documentNo', label: '单据编号', field: 'documentNo', copyable: true },
    { key: 'organization', label: '库存组织', field: 'organization' },
    { key: 'organizationCode', label: '组织编码', field: 'organizationCode' },
    { key: 'documentType', label: '单据类型', field: 'documentType' },
    { key: 'businessType', label: '业务类型', field: 'businessType' },
    { key: 'businessDate', label: '业务日期', field: 'businessDate' },
    { key: 'accountingDate', label: '记账日期', field: 'accountingDate' },
    { key: 'customer', label: '客户', field: 'customer' },
    { key: 'usingDepartment', label: '领用部门', field: 'usingDepartment' },
    { key: 'project', label: '项目名称', field: 'project' },
    { key: 'warehouse', label: '仓库', field: 'warehouse' },
    { key: 'salesDepartment', label: '销售部门', field: 'salesDepartment' },
    { key: 'salesperson', label: '销售员', field: 'salesperson' },
    { key: 'keeper', label: '仓管员', field: 'keeper' },
    { key: 'initialization', label: '初始化单据', field: 'initialization' },
    { key: 'remark', label: '备注', field: 'remark', span: 3 }
  ]
  const currentWarehouses = computed(() =>
    warehouses.value.filter(
      (item) =>
        item.tenantId === form.value.tenantId &&
        item.organizationId === form.value.organizationId &&
        item.status === 'enabled' &&
        (!props.issueRequest || item.businessScopes.includes('picking'))
    )
  )
  const quantityTotal = computed(() =>
    lines.value.reduce((sum, item) => sum + displayQuantity(item.quantity), 0)
  )
  const totalAmount = computed(() =>
    lines.value.reduce((sum, item) => sum + lineFinancial(item).total, 0)
  )
  function salesLineCellClassName({ column }: { column: { property?: string } }): string {
    if (
      usesCurrencyQuantities.value &&
      ['quantity', 'baseQuantity', 'amount', 'taxAmount', 'totalAmount'].includes(
        column.property || ''
      )
    )
      return 'opening-return-value-cell'
    if (
      isOpeningReturn.value &&
      [
        'quantity',
        'baseQuantity',
        'auxiliaryQuantity',
        'auxiliaryQuantity2',
        'discountAmount',
        'amount',
        'totalAmount'
      ].includes(column.property || '')
    )
      return 'opening-return-value-cell'
    return isReturn.value && column.property === 'quantity' ? 'sales-return-quantity-cell' : ''
  }
  const salesUnitOptions = computed(() =>
    units.value.map((item) => ({
      label: `${formatUnitDisplayName(item.unitName)}`,
      value: item.id
    }))
  )
  const headerItems = computed<FormItem[]>(() => [
    {
      key: 'documentNo',
      label: props.issueRequest ? '申请单号' : '单据编号',
      type: 'input',
      props: { readonly: true, placeholder: '保存时按月度编号规则生成' }
    },
    {
      key: 'organizationId',
      label: '库存组织',
      type: 'treeSelect',
      options: selectableOrganizationTree.value,
      valueField: 'id',
      labelField: 'organizationName',
      childrenField: 'children',
      labelFn: (item) => `${item.organizationName ?? ''} · ${item.organizationCode ?? ''}`,
      props: {
        filterable: true,
        checkStrictly: true,
        defaultExpandAll: true,
        renderAfterExpand: false,
        disabled: mode.value === 'view',
        onChange: onOrganizationChange
      }
    },
    {
      key: 'documentTypeId',
      label: '单据类型',
      type: 'select',
      options: documentTypes.value.map((item) => ({ label: item.name, value: item.id })),
      props: { disabled: mode.value === 'view', onChange: onDocumentTypeChange }
    },
    {
      key: 'businessTypeId',
      label: '业务类型',
      type: 'select',
      options: businessTypes.value
        .filter((item) =>
          isWmsBusinessTypeAvailable(item, form.value.documentTypeId, businessMenuId.value)
        )
        .map((item) => ({ label: item.name, value: item.id })),
      props: { disabled: mode.value === 'view' }
    },
    {
      key: 'businessDate',
      label: props.issueRequest ? '申请日期' : '业务日期',
      type: 'date',
      props: { valueFormat: 'YYYY-MM-DD', disabled: mode.value === 'view', class: 'w-full!' }
    },
    {
      key: 'accountingDate',
      label: '记账日期',
      type: 'date',
      props: { valueFormat: 'YYYY-MM-DD', disabled: true, class: 'w-full!' }
    },
    ...(!isInitial.value
      ? ([
          { key: 'projectId', label: '项目名称', type: 'input' },
          {
            key: 'warehouseId',
            label: '仓库号',
            type: 'select',
            options: currentWarehouses.value.map((item) => ({
              label: `${item.warehouseName} · ${item.warehouseCode}`,
              value: item.id
            })),
            props: { clearable: true, onChange: onHeaderWarehouseChange }
          }
        ] as FormItem[])
      : []),
    { key: 'customerId', label: '客户', type: 'input', props: { disabled: mode.value === 'view' } },
    ...(!isInitial.value && ['other_outbound', 'other_return'].includes(props.kind)
      ? ([
          {
            key: 'usingDepartmentId',
            label: '领用部门',
            type: 'treeSelect',
            options: organizationTree.value,
            valueField: 'id',
            labelField: 'organizationName',
            childrenField: 'children',
            props: { clearable: true, filterable: true, checkStrictly: true }
          }
        ] as FormItem[])
      : []),
    ...(props.issueRequest
      ? ([
          {
            key: 'requestType',
            label: '申请类型',
            type: 'select',
            options: requestTypeOptions.value
          },
          { key: 'workOrderId', label: '生产工单', type: 'input' },
          { key: 'constructionNo', label: '施工号', type: 'input' }
        ] as FormItem[])
      : []),
    {
      key: 'salespersonId',
      label: props.issueRequest ? '申请人' : '销售员',
      type: 'input',
      props: { disabled: mode.value === 'view' }
    },
    {
      key: 'salesDepartmentId',
      label: '销售部门',
      type: 'treeSelect',
      options: organizationTree.value,
      valueField: 'id',
      labelField: 'organizationName',
      childrenField: 'children',
      props: {
        filterable: true,
        clearable: true,
        checkStrictly: true,
        renderAfterExpand: false,
        disabled: mode.value === 'view'
      }
    },
    { key: 'keeperId', label: '仓管员', type: 'input', props: { disabled: mode.value === 'view' } },
    {
      key: 'status',
      label: '单据状态',
      type: 'select',
      options: [{ label: statusLabel.value, value: form.value.status }],
      props: { disabled: true }
    },
    { key: 'isInitialization', label: '初始化单据', type: 'switch', props: { disabled: true } },
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
  const headerRules = computed(() => ({
    organizationId: [{ required: true, message: '请选择已启用的库存组织', trigger: 'change' }],
    documentTypeId: [{ required: true, message: '请选择单据类型', trigger: 'change' }],
    businessTypeId: [{ required: true, message: '请选择业务类型', trigger: 'change' }],
    businessDate: [{ required: true, message: '请选择业务日期', trigger: 'change' }],
    customerId: [
      {
        required: !props.issueRequest && !['other_outbound', 'other_return'].includes(props.kind),
        message: '请选择客户',
        trigger: 'change'
      }
    ],
    warehouseId: [{ required: props.issueRequest, message: '请选择仓库号', trigger: 'change' }]
  }))
  const partyColumns = [
    { prop: 'code', label: '编码', width: 150 },
    { prop: 'name', label: '名称', minWidth: 220 }
  ]
  function round(value: number, digits = 4): number {
    const factor = 10 ** digits
    return Math.round((value + Number.EPSILON) * factor) / factor
  }
  function displayQuantity(value: number): number {
    return isReturn.value && !isOpeningReturn.value
      ? -Math.abs(Number(value || 0))
      : Math.abs(Number(value || 0))
  }
  function unitName(id: string | null): string {
    return formatUnitDisplayName(units.value.find((item) => item.id === id)?.unitName, '') || '—'
  }
  function projectName(id: string | null): string {
    return projects.value.find((item) => item.id === id)?.name || '—'
  }
  function formatSalesValue(value: number, digits = 4): string {
    return usesCurrencyQuantities.value
      ? `￥${(isReturn.value ? -Math.abs(value) : value).toFixed(digits)}`
      : value.toFixed(digits)
  }
  function onHeaderProjectChange(): void {
    const project = projects.value.find((item) => item.id === form.value.projectId)
    if (project?.customerId) {
      form.value.customerId = project.customerId
      selectedCustomer.value = customers.value.filter((item) => item.id === project.customerId)
    }
  }
  function onHeaderWarehouseChange(): void {
    materialPickerIds.value = []
    materialPickerRows.value = []
  }
  function conversionFactor(
    material: WmsInitialMaterial | null | undefined,
    unitId: string | null
  ): number | null {
    if (!material || !unitId) return null
    if (unitId === material.baseUnitId) return 1
    const entry = material.unitConversions?.find((item) => item.sourceUnitId === unitId)
    return entry && entry.sourceFactor > 0 ? entry.baseFactor / entry.sourceFactor : null
  }
  function baseQuantity(line: WmsInitialSalesLine): number {
    const inventoryFactor = conversionFactor(line.material, line.inventoryUnitId)
    const baseFactor = conversionFactor(line.material, line.baseUnitId)
    return inventoryFactor && baseFactor
      ? round((Math.abs(Number(line.quantity || 0)) * inventoryFactor) / baseFactor)
      : 0
  }
  function auxQuantity(line: WmsInitialSalesLine, unitId: string | null): string {
    const inventoryFactor = conversionFactor(line.material, line.inventoryUnitId)
    const auxFactor = conversionFactor(line.material, unitId)
    return inventoryFactor && auxFactor
      ? round((Math.abs(Number(line.quantity || 0)) * inventoryFactor) / auxFactor).toString()
      : '—'
  }
  function lineFinancial(line: WmsInitialSalesLine): {
    discount: number
    amount: number
    tax: number
    total: number
  } {
    if (mode.value === 'view' && isOpeningReturn.value)
      return {
        discount: Math.abs(Number(line.discountAmount || 0)),
        amount: Math.abs(Number(line.amount || 0)),
        tax: Math.abs(Number(line.taxAmount || 0)),
        total: Math.abs(Number(line.totalAmount || 0))
      }
    if (line.gift) return { discount: 0, amount: 0, tax: 0, total: 0 }
    const quantity = displayQuantity(line.quantity)
    const rate = line.discountMethod === 'none' ? 0 : Number(line.unitDiscountRate || 0)
    const discount = round(quantity * Number(line.taxInclusiveUnitPrice || 0) * rate, 2)
    const amount = round(quantity * Number(line.unitPrice || 0) - discount, 2)
    const tax = round((quantity * Number(line.unitPrice || 0) * Number(line.taxRate || 0)) / 100, 2)
    return { discount, amount, tax, total: round(amount + tax, 2) }
  }
  function updatePrice(line: WmsInitialSalesLine, basis: 'untaxed' | 'taxed'): void {
    line.priceBasis = basis
    const factor = 1 + Number(line.taxRate || 0) / 100
    if (basis === 'taxed') line.unitPrice = round(Number(line.taxInclusiveUnitPrice || 0) / factor)
    else line.taxInclusiveUnitPrice = round(Number(line.unitPrice || 0) * factor)
  }
  function materialFromRow(row: DataSelectRecord): WmsInitialMaterial | null {
    if (typeof row.id !== 'string' || typeof row.code !== 'string' || typeof row.name !== 'string')
      return null
    return {
      id: row.id,
      tenantId: form.value.tenantId,
      code: row.code,
      name: row.name,
      description: typeof row.description === 'string' ? row.description : null,
      specificationModel:
        typeof row.specificationModel === 'string' ? row.specificationModel : null,
      inventoryUnitId: typeof row.inventoryUnitId === 'string' ? row.inventoryUnitId : null,
      baseUnitId: typeof row.baseUnitId === 'string' ? row.baseUnitId : null,
      auxiliaryUnitId: typeof row.auxiliaryUnitId === 'string' ? row.auxiliaryUnitId : null,
      auxiliaryUnit2Id: typeof row.auxiliaryUnit2Id === 'string' ? row.auxiliaryUnit2Id : null,
      unitConversions: Array.isArray(row.unitConversions) ? row.unitConversions : [],
      serialManagementEnabled: row.serialManagementEnabled === true
    }
  }
  function makeLine(material: WmsInitialMaterial): WmsInitialSalesLine {
    return {
      lineNo: (lines.value.length + 1) * 10,
      returnType: isReturn.value ? 'return' : null,
      materialId: material.id,
      material,
      projectId: form.value.projectId || null,
      constructionNo: null,
      gift: false,
      inventoryUnitId: material.inventoryUnitId || '',
      quantity: 0,
      baseUnitId: material.baseUnitId,
      baseQuantity: 0,
      unitPrice: 0,
      taxInclusiveUnitPrice: 0,
      priceBasis: 'untaxed',
      taxRate: 13,
      discountMethod: 'none',
      unitDiscountRate: 0,
      discountAmount: 0,
      amount: 0,
      taxAmount: 0,
      totalAmount: 0,
      batchNo: null,
      warehouseId: form.value.warehouseId || null,
      binId: null,
      stockType: 'normal',
      ownerType: 'self',
      ownerId: null,
      stockStatus: 'available',
      keeperId: form.value.keeperId,
      auxiliaryUnitId: material.auxiliaryUnitId,
      auxiliaryQuantity: null,
      auxiliaryUnit2Id: material.auxiliaryUnit2Id,
      auxiliaryQuantity2: null,
      productionDate: null,
      expiryDate: null,
      trackingNo: null,
      sourceDocument: null,
      sourceLineNo: null,
      remark: null,
      serialNos: []
    }
  }
  function renumber(): void {
    lines.value.forEach((line, index) => {
      line.lineNo = (index + 1) * 10
    })
  }
  function addMaterials(_ids: unknown, rows: DataSelectRecord[]): void {
    lines.value.push(
      ...rows
        .map(materialFromRow)
        .filter((row): row is WmsInitialMaterial => row !== null)
        .map(makeLine)
    )
    renumber()
    materialPickerIds.value = []
    materialPickerRows.value = []
  }
  function copyLine(index: number): void {
    lines.value.splice(index + 1, 0, cloneDeep(lines.value[index]))
    renumber()
  }
  function removeLine(index: number): void {
    lines.value.splice(index, 1)
    renumber()
  }
  function lineIndex(line: WmsInitialSalesLine): number {
    return lines.value.findIndex((item) => item.lineNo === line.lineNo)
  }
  function onLineMoreAction(item: ButtonMoreItem, line: WmsInitialSalesLine): void {
    const index = lineIndex(line)
    if (index < 0) return
    if (item.key === 'copy-line') copyLine(index)
    else if (item.key === 'delete-line') removeLine(index)
  }
  function onSalespersonSelected(rows: EmployeeIntegrationItem[]): void {
    selectedSalesperson.value = rows
    if (rows[0]?.organizationId) form.value.salesDepartmentId = rows[0].organizationId
  }
  function onInlineProjectChange(line: WmsInitialSalesLine, projectId: string | null): void {
    line.projectId = projectId
    line.constructionNo = null
  }
  function onHeaderKeeperChange(value: string | undefined): void {
    const previous = form.value.keeperId
    form.value.keeperId = value || null
    for (const line of lines.value) {
      if (!line.keeperId || line.keeperId === previous) line.keeperId = form.value.keeperId
    }
  }
  async function onInlineWarehouseChange(line: WmsInitialSalesLine): Promise<void> {
    line.binId = null
    await loadInlineBins(line)
  }

  function onInlineOwnerTypeChange(line: WmsInitialSalesLine): void {
    line.ownerId = null
  }
  function onInlineOwnerChange(line: WmsInitialSalesLine, ownerId: string | null): void {
    line.ownerId = ownerId
  }
  const serialList = computed(() => parseSerialNumberText(serialText.value))
  const serialEntryVisible = computed({
    get: () => false,
    set: (value: boolean) => {
      if (value) {
        serialEntryForm.serialText = serialText.value
        void serialEntryDialogRef.value?.handleOpen(undefined, {
          title: '录入序列号',
          showFooter: mode.value !== 'view',
          confirmText: '保存序列号',
          onConfirm: () => {
            serialText.value = serialEntryForm.serialText
            if (serialLine.value) serialLine.value.serialNos = serialList.value
            return true
          }
        })
      }
    }
  })
  const serialViewVisible = computed({
    get: () => false,
    set: (value: boolean) => {
      if (value) void serialViewDialogRef.value?.handleOpen(undefined, { title: '查看序列号' })
    }
  })
  async function importSerials(file: File): Promise<void> {
    try {
      const serials = parseSerialNumberText(await file.text())
      if (!serials.length) {
        ElMessage.warning('文件中没有可用的序列号，请检查文件内容后重试')
        return
      }
      serialEntryForm.serialText = serials.join('\n')
      ElMessage.success(`已导入 ${serials.length} 个序列号`)
    } catch (error) {
      notifyFriendlyError(error, '序列号文件读取失败，请重新选择文件')
    }
  }
  function openInlineSerials(line: WmsInitialSalesLine): void {
    serialLine.value = line
    serialText.value = line.serialNos.join('\n')
    serialEntryVisible.value = mode.value !== 'view'
    if (mode.value === 'view') serialViewVisible.value = true
  }
  async function materialApi(params: DataSelectFetchParams) {
    const result = await fetchWmsInitialMaterials({
      tenantId: form.value.tenantId,
      keyword: params.keyword || '',
      categoryIds: getMaterialCategoryIds(
        materialCategories.value,
        String(params.filters.categoryId || '')
      ),
      current: params.page,
      size: params.pageSize
    })
    return {
      ...result,
      data: result.data.map((material) => ({
        ...material,
        materialCode: material.code,
        materialName: material.name
      }))
    }
  }
  async function loadTenantOptions(tenantId: string): Promise<void> {
    const [
      unitRows,
      documentRows,
      businessRows,
      projectRows,
      supplierRows,
      customerRows,
      menuId,
      categories
    ] = await Promise.all([
      fetchWmsUnitOptions(tenantId),
      fetchWmsInitialDocumentTypes(tenantId, documentTypeMenuName.value),
      fetchWmsInitialOptions('mdm_business_type', tenantId),
      fetchWmsInitialOptions('mdm_project', tenantId),
      fetchWmsInitialOptions('mdm_supplier', tenantId),
      fetchWmsInitialOptions('mdm_customer', tenantId),
      fetchWmsInitialMenuId(documentTypeMenuName.value),
      fetchWmsMaterialCategories(tenantId)
    ])
    units.value = unitRows
    documentTypes.value =
      props.kind === 'other_return'
        ? documentRows.filter((item) => item.name.includes('退回'))
        : props.kind === 'other_outbound'
          ? documentRows.filter((item) => !item.name.includes('退回'))
          : documentRows
    businessTypes.value = businessRows
    businessMenuId.value = menuId
    projects.value = projectRows
    suppliers.value = supplierRows
    customers.value = customerRows
    materialCategories.value = categories
    if (!documentTypes.value.some((item) => item.id === form.value.documentTypeId))
      form.value.documentTypeId =
        documentTypes.value.find((item) => item.isDefault)?.id || documentTypes.value[0]?.id || ''
    onDocumentTypeChange()
  }
  function onDocumentTypeChange(): void {
    const available = businessTypes.value.filter((item) =>
      isWmsBusinessTypeAvailable(item, form.value.documentTypeId, businessMenuId.value)
    )
    if (!available.some((item) => item.id === form.value.businessTypeId))
      form.value.businessTypeId =
        available.find((item) => item.isDefault)?.id || available[0]?.id || ''
  }
  async function onOrganizationChange(): Promise<void> {
    const org = selectedOrganization.value
    form.value.tenantId = org?.tenantId || ''
    form.value.businessDate = isInitial.value
      ? org?.enabledOn
        ? (dayjs().isAfter(org.enabledOn, 'day')
            ? dayjs(org.enabledOn).subtract(1, 'day')
            : dayjs()
          ).format('YYYY-MM-DD')
        : ''
      : dayjs().format('YYYY-MM-DD')
    form.value.documentTypeId = ''
    form.value.businessTypeId = ''
    form.value.customerId = ''
    form.value.projectId = undefined
    form.value.warehouseId = undefined
    form.value.salespersonId = null
    form.value.salesDepartmentId = null
    form.value.usingDepartmentId = undefined
    form.value.workOrderId = undefined
    form.value.constructionNo = null
    selectedWorkOrder.value = []
    lines.value = []
    selectedCustomer.value = []
    selectedSalesperson.value = []
    if (form.value.tenantId) {
      const [organizationResult] = await Promise.all([
        fetchEnabledOrganizationTree({ tenantId: form.value.tenantId }),
        loadTenantOptions(form.value.tenantId)
      ])
      organizationTree.value = organizationResult.data ?? []
    }
  }
  async function loadOptions(): Promise<void> {
    optionError.value = false
    try {
      const [orgPage, warehouseRows, organizationResult] = await Promise.all([
        fetchWmsInventoryOrganizations({ current: 1, size: 2000 }),
        fetchWmsWarehouses(),
        fetchEnabledOrganizationTree({ tenantId: form.value.tenantId })
      ])
      organizations.value = orgPage.data
      warehouses.value = warehouseRows
      organizationTree.value = organizationResult.data ?? []
      let selectedDefaultOrganization = false
      if (mode.value === 'create' && !form.value.organizationId) {
        const defaultOrganization = organizations.value.find(
          (item) =>
            item.isDefault &&
            item.enabledOn &&
            (isInitial.value ? !item.initializationClosedAt : item.initializationClosedAt)
        )
        if (defaultOrganization) {
          form.value.organizationId = defaultOrganization.id
          await onOrganizationChange()
          selectedDefaultOrganization = true
        }
      }
      if (form.value.tenantId && !selectedDefaultOrganization)
        await loadTenantOptions(form.value.tenantId)
    } catch {
      optionError.value = true
    } finally {
      drawerRef.value?.setOptions({
        confirmDisabled:
          parsing.value || importing.value || optionError.value || Boolean(documentError.value)
      })
    }
  }
  function onImportError(): void {
    ElMessage.error('导入失败，请检查 Excel 文件格式')
  }
  function onImportParsing(value: boolean): void {
    parsing.value = value
    drawerRef.value?.setOptions({
      confirmDisabled:
        parsing.value || importing.value || optionError.value || Boolean(documentError.value)
    })
  }
  async function importLines(rows: Array<Record<string, unknown>>): Promise<void> {
    if (importing.value || mode.value === 'view' || !form.value.organizationId) return
    const request = documentRequest
    const tenantId = form.value.tenantId
    const organizationId = form.value.organizationId
    importing.value = true
    drawerRef.value?.setOptions({ confirmDisabled: true })
    try {
      const resolveMaterial = createImportReferenceLookup(async (code) => {
        const result = await fetchWmsInitialMaterials({
          tenantId,
          keyword: '',
          materialCode: code,
          current: 1,
          size: 20
        })
        return result.data.filter((item) => item.code === code)
      })
      const importedLines: typeof lines.value = []
      for (const { row, code, fileRow, amounts } of readWmsDocumentImportRows(rows)) {
        const material = await resolveMaterial(code, `第 ${fileRow} 行当前租户物料编码“${code}”`)
        if (request !== documentRequest) return
        const line = makeLine(material)
        line.quantity = amounts.quantity
        line.unitPrice = amounts.unitPrice
        line.taxRate = amounts.taxRate
        line.taxInclusiveUnitPrice = round(line.unitPrice * (1 + line.taxRate / 100))
        line.batchNo = String(row['批号'] || row.batchNo || '') || null
        importedLines.push(line)
      }
      if (request !== documentRequest) return
      if (form.value.tenantId !== tenantId || form.value.organizationId !== organizationId)
        throw new Error('库存组织已变更，请重新导入明细')
      lines.value.push(...importedLines)
      renumber()
      ElMessage.success(`已导入 ${importedLines.length} 行，请逐行核对仓储与价格信息`)
    } catch (error) {
      if (request !== documentRequest) return
      notifyFriendlyError(error, '导入物料读取失败，请检查网络后重新选择文件')
    } finally {
      if (request === documentRequest) {
        importing.value = false
        drawerRef.value?.setOptions({
          confirmDisabled:
            parsing.value || importing.value || optionError.value || Boolean(documentError.value)
        })
      }
    }
  }
  async function save(): Promise<boolean> {
    if (parsing.value || importing.value || optionError.value || documentError.value) return false
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (
        isInitial.value &&
        (!selectedOrganization.value?.enabledOn ||
          form.value.businessDate > selectedOrganization.value.enabledOn)
      ) {
        ElMessage.warning('业务日期不得晚于库存组织启用日期')
        return false
      }
      if (!lines.value.length) {
        ElMessage.warning('请至少添加一行物料')
        return false
      }
      const validation = await lineTableRef.value?.validate()
      if (!validation?.valid) {
        if (validation?.firstError) ElMessage.warning(validation.firstError.message)
        return false
      }
      const incomplete = lines.value.find((line) => Math.abs(Number(line.quantity)) <= 0)
      if (incomplete) {
        ElMessage.warning(`第 ${incomplete.lineNo} 行“数量”不能为零`)
        return false
      }
      for (const line of lines.value) {
        if (isInitial.value && line.material?.batchManagementEnabled && !line.batchNo?.trim()) {
          ElMessage.warning(`第 ${line.lineNo} 行批次管理物料请填写期初历史批次`)
          return false
        }
        if (
          !props.issueRequest &&
          !['other_outbound', 'other_return'].includes(props.kind) &&
          line.projectId &&
          !line.constructionNo?.trim()
        ) {
          ElMessage.warning(`第 ${line.lineNo} 行选择项目后请填写施工号`)
          return false
        }
        if (line.ownerType !== 'self' && !line.ownerId) {
          ElMessage.warning(`第 ${line.lineNo} 行请选择货主`)
          return false
        }
        const serials = line.serialNos
        if (
          line.material?.serialManagementEnabled &&
          (Math.abs(Number(line.quantity)) !== serials.length ||
            new Set(serials).size !== serials.length)
        ) {
          ElMessage.warning(`第 ${line.lineNo} 行序列号数量须与物料数量一致且不能重复`)
          return false
        }
        line.quantity = Math.abs(Number(line.quantity))
        line.baseQuantity = props.issueRequest
          ? Number(line.baseQuantity || baseQuantity(line))
          : baseQuantity(line)
        const money = lineFinancial(line)
        line.discountAmount = money.discount
        line.amount = money.amount
        line.taxAmount = money.tax
        line.totalAmount = money.total
      }
      if (props.issueRequest) {
        await createWmsIssueRequest({
          tenantId: form.value.tenantId,
          organizationId: form.value.organizationId,
          warehouseId: form.value.warehouseId || '',
          workOrderId: form.value.workOrderId || null,
          documentTypeId: form.value.documentTypeId,
          businessTypeId: form.value.businessTypeId,
          requestType: form.value.requestType,
          applicationDate: form.value.businessDate,
          projectId: form.value.projectId || null,
          constructionNo: form.value.constructionNo,
          customerId: form.value.customerId || null,
          applicantId: form.value.salespersonId,
          usingDepartmentId: form.value.usingDepartmentId || null,
          keeperId: form.value.keeperId,
          remark: normalizeNullableText(form.value.remark),
          lines: lines.value
        })
      } else
        await saveWmsInitialSalesDocument({
          id: mode.value === 'edit' ? form.value.id : undefined,
          tenantId: form.value.tenantId,
          organizationId: form.value.organizationId,
          kind: props.kind,
          documentTypeId: form.value.documentTypeId,
          businessTypeId: form.value.businessTypeId,
          businessDate: form.value.businessDate,
          customerId: form.value.customerId,
          usingDepartmentId: form.value.usingDepartmentId || null,
          projectId: form.value.projectId || null,
          warehouseId: form.value.warehouseId || null,
          salespersonId: form.value.salespersonId,
          salesDepartmentId: form.value.salesDepartmentId,
          keeperId: form.value.keeperId,
          isInitialization: isInitial.value,
          remark: normalizeNullableText(form.value.remark),
          lines: lines.value
        })
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, `${title.value}提交失败，请检查填写内容和网络后重试`)
      return false
    }
  }
  async function handleOpen(data: OpenData): Promise<void> {
    documentRequest += 1
    importing.value = false
    parsing.value = false
    openData.value = data
    documentError.value = ''
    mode.value = data.mode
    importIntent.value = Boolean(data.importIntent)
    await drawerRef.value?.handleOpen(data, {
      loading: true,
      loadingText: '正在加载单据资料…',
      showFooter: data.mode !== 'view',
      confirmText: data.mode === 'copy' ? '保存副本' : '保存',
      title:
        data.mode === 'create'
          ? `新增${title.value}`
          : data.mode === 'copy'
            ? `复制${title.value}`
            : data.mode === 'edit'
              ? `编辑${title.value}`
              : `${title.value}详情`,
      subtitle: data.document?.documentNo || '月度三位流水号自动生成',
      onConfirm: save,
      onClose: () => {
        documentRequest += 1
        importing.value = false
        parsing.value = false
        openData.value = undefined
      }
    })
    await reloadDocument()
  }
  async function reloadDocument(): Promise<void> {
    const data = openData.value
    if (!data) return
    const request = ++documentRequest
    documentError.value = ''
    drawerRef.value?.setLoading(true)
    drawerRef.value?.setOptions({ confirmDisabled: true })
    try {
      const source =
        data.document ??
        (data.documentId ? await fetchWmsInitialSalesDocument(data.documentId) : undefined)
      if (request !== documentRequest) return
      currentDocument.value = source ?? null
      Object.assign(form.value, {
        requestType: 'consumables_outbound',
        workOrderId: undefined,
        constructionNo: null,
        usingDepartmentId: source?.usingDepartmentId || undefined,
        id: data.mode === 'edit' ? source?.id || '' : '',
        tenantId: source?.tenantId || data.tenantId || '',
        organizationId: source?.organizationId || '',
        documentNo: data.mode === 'copy' ? '' : source?.documentNo || '',
        documentTypeId: source?.documentTypeId || '',
        businessTypeId: source?.businessTypeId || '',
        businessDate: source?.businessDate || '',
        accountingDate: source?.accountingDate || dayjs().format('YYYY-MM-DD'),
        customerId: source?.customerId || '',
        projectId: source?.projectId || undefined,
        warehouseId: source?.warehouseId || undefined,
        salespersonId: source?.salespersonId || null,
        salesDepartmentId: source?.salesDepartmentId || null,
        keeperId: source?.keeperId || null,
        status: data.mode === 'copy' ? 'draft' : source?.status || 'draft',
        isInitialization: isInitial.value,
        remark: source?.remark || ''
      })
      if (data.mode === 'copy' && source?.kind !== props.kind) {
        form.value.documentTypeId = ''
        form.value.businessTypeId = ''
      }
      lines.value = source ? cloneDeep(source.lines) : []
      if (data.mode !== 'view') {
        for (const line of lines.value) line.quantity = Math.abs(Number(line.quantity))
      }
      selectedCustomer.value = []
      selectedSalesperson.value = []
      selectedKeeper.value = []
      await loadOptions()
      if (request !== documentRequest) return
      if (props.issueRequest && !source) {
        const employeeId = userStore.getUserInfo.hrEmployeeId
        if (employeeId && userStore.getUserInfo.tenantId === form.value.tenantId)
          form.value.salespersonId = employeeId
        const allowed = currentWarehouses.value.filter((warehouse) =>
          warehouse.businessScopes.includes('picking')
        )
        if (allowed.length === 1) form.value.warehouseId = allowed[0].id
        if (data.requestWorkOrderId && form.value.warehouseId) {
          const order = (
            await fetchWmsWorkOrderOptions(form.value.warehouseId, data.requestWorkOrderId)
          ).find((row) => row.id === data.requestWorkOrderId)
          if (order) {
            form.value.workOrderId = order.id
            onWorkOrderSelected([order])
          }
        }
      }
      if (form.value.tenantId) {
        const employees = await fetchEmployeeReferencesByIds(
          form.value.tenantId,
          [form.value.salespersonId, form.value.keeperId].filter((id): id is string => Boolean(id))
        )
        if (request !== documentRequest) return
        selectedSalesperson.value = employees.filter((item) => item.id === form.value.salespersonId)
        selectedKeeper.value = employees.filter((item) => item.id === form.value.keeperId)
      }
      await nextTick()
      formRef.value?.clearValidate()
      drawerRef.value?.setOptions({ subtitle: source?.documentNo || '月度三位流水号自动生成' })
    } catch (error) {
      if (request !== documentRequest) return
      documentError.value = '请重新加载单据；如仍失败，请检查网络和当前单据的查看权限。'
      notifyFriendlyError(error, '单据加载失败，请重试')
    } finally {
      if (request === documentRequest) {
        drawerRef.value?.setLoading(false)
        drawerRef.value?.setOptions({
          confirmDisabled:
            parsing.value || importing.value || optionError.value || Boolean(documentError.value)
        })
      }
    }
  }
  defineExpose({ handleOpen, openSourceChoice })
</script>

<style scoped lang="scss">
  @use '@/assets/styles/core/mixin' as layout;

  .wms-editable-line-table {
    @include layout.fill-editable-table-cells;
  }

  .initialization-document-stack {
    display: grid;
    gap: 20px;
    align-content: start;
  }

  .sales-return-quantity {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: var(--el-color-danger);
  }

  :deep(td.el-table__cell.sales-return-quantity-cell) {
    background-color: var(--el-color-warning-light-9) !important;
  }

  :deep(td.el-table__cell.opening-return-value-cell),
  :deep(td.el-table__cell.opening-return-value-cell .el-input__inner) {
    color: var(--el-color-danger);
  }
</style>
