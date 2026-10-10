import { stepConfig } from '@/hooks/use-step-config'
import { getPriorityConfig, getStatusConfig } from '@/lib/constants'
import type { WorkflowStatus } from '@/lib/api'

const flow = [
  { id: 's1', key: 'DELIVERED', name: 'Delivered', color: '#0ea5e9' },
  { id: 's2', key: 'IN_PROGRESS', name: 'On the job', color: '' },
] as unknown as WorkflowStatus[]

describe('stepConfig — one look for a step, custom steps included', () => {
  it('a custom step reads its own name and colour, not the built-in fallback', () => {
    const cfg = stepConfig('DELIVERED', flow)
    expect(cfg.label).toBe('Delivered')
    expect(cfg.hex).toBe('#0ea5e9')
  })

  it('a renamed built-in step keeps the built-in colour when the flow sets none', () => {
    const cfg = stepConfig('IN_PROGRESS', flow)
    expect(cfg.label).toBe('On the job')
    expect(cfg.hex).toBe(getStatusConfig('IN_PROGRESS').hex)
  })

  it('without a flow it is the built-in table', () => {
    expect(stepConfig('BLOCKED', null)).toEqual(getStatusConfig('BLOCKED'))
  })
})

describe('getPriorityConfig', () => {
  it('falls back to MEDIUM for an unknown priority', () => {
    expect(getPriorityConfig('nope').hex).toBe(getPriorityConfig('MEDIUM').hex)
  })
})
