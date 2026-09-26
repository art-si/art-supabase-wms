<template>
  <WmsPurchaseDocumentWorkspace kind="other_inbound" :permissions="permissions" />
</template>

<script setup lang="ts">
  import WmsPurchaseDocumentWorkspace from '@/components/business/wms-purchase-document-workspace/index.vue'
  import { WMS_OTHER_INBOUND_PERMISSIONS } from '../permissions'

  defineOptions({ name: 'WmsOtherInbound' })
  const permissions = WMS_OTHER_INBOUND_PERMISSIONS
</script>
