/** The request workflow accepts these codes; sys_dictionary owns their display labels. */
export const supportedIssueRequestTypes = [
  'damage_outbound',
  'consumables_outbound',
  'scrap_outbound',
  'welfare_use',
  'office_supplies_use',
  'labor_protection_use'
] as const
