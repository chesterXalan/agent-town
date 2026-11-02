export const OFFICE_DEPTS = ['north-west', 'north-east', 'east-north', 'east-south', 'west-north'] as const
export type OfficeDept = (typeof OFFICE_DEPTS)[number] | 'west-south'
export type OfficeJob = 'manager' | 'lead' | 'engineer' | 'reviewer' | 'qa' | 'fixer' | 'researcher' | 'colleague'
export type OfficeRank = 'senior' | 'mid' | 'junior' | 'guest'
export type OfficeStatus = 'thinking' | 'tool' | 'replying' | 'waiting' | 'done'
export function screenLangOf(agentType: string | null): 'go' | 'ts' | null {
  if (agentType?.includes('go-')) return 'go'
  if (agentType?.includes('ts-')) return 'ts'
  return null
}
