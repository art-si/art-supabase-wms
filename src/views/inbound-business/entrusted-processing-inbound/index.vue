<template>
  <WmsPurchaseDocumentWorkspace kind="entrusted_processing_inbound" :permissions="permissions" />
</template>

<script setup lang="ts">
  import WmsPurchaseDocumentWorkspace from '@/components/business/wms-purchase-document-workspace/index.vue'
  import { WMS_ENTRUSTED_PROCESSING_INBOUND_PERMISSIONS } from '../permissions'

  defineOptions({ name: 'WmsEntrustedProcessingInbound' })
  const permissions = WMS_ENTRUSTED_PROCESSING_INBOUND_PERMISSIONS
</script>
