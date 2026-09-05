import { describe, expect, it } from 'vitest'
import { assetsHint, defaultWish } from './wish'

describe('defaultWish', () => {
  it('mirrors personas.default_wish by personality and relation', () => {
    expect(defaultWish({ relation: 'son', personality: 'greedy' }, '学区房、比特币')).toBe('把学区房、比特币都收入囊中，越值钱越好。')
    expect(defaultWish({ relation: 'daughter', personality: 'filial' }, '学区房')).toBe('留住有纪念意义的东西，让家不散。')
    expect(defaultWish({ relation: 'pet', personality: 'loyal' }, '遗产')).toBe('继承猫粮/狗粮基金、那张沙发，以及每天的抚摸配额。')
    expect(defaultWish({ relation: 'ai_twin', personality: 'mischief' }, '遗产')).toBe('替本尊把想说而没说的话说出来。')
    expect(defaultWish({ relation: 'ex_spouse', personality: 'lawyer' }, '遗产')).toBe('当年的共同财产没分清，现在要算总账。')
  })

  it('joins the two highest-value assets as the hint', () => {
    expect(assetsHint([
      { name: '存款', value: 80 },
      { name: '学区房', value: 520 },
      { name: '紫砂壶', value: 3 },
    ])).toBe('学区房、存款')
  })
})
