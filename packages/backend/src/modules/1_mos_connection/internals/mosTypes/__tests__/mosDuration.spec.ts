/* 测试重点:
解析 (create): 主要测试从 MOS 标准的时长字符串 HH:MM:SS 创建 mosDuration 对象。它会验证：
有效的字符串 (1:23:45) 能被正确解析为其代表的总秒数 (5025)。
无效的字符串 (asdf, 1:23:xx) 会按预期抛出错误。
字符串化 (stringify): 测试 stringify 方法能将内部的秒数正确格式化回 HH:MM:SS 字符串。
格式规范化: 一个非常重要的测试点是 toString('1:2:3') 会返回 1:02:03，这证明 stringify 方法会正确地用零来填充，以满足格式要求。另一个是 toString('1:65:23') 返回 2:05:23，这证明模块能正确处理分钟超过60的情况。
类型守卫 (is): 和其他类型一样，验证 is() 能正确识别 mosDuration 对象。 */

import { describe, expect, test } from '@jest/globals'
import { getMosTypes } from '../../mosTypes'

describe('MosDuration', () => {
	test('basic', () => {
		const mosTypes = getMosTypes(true)

		const mosDuration = mosTypes.mosDuration.create('1:23:45')
		expect(mosTypes.mosDuration.valueOf(mosDuration)).toBe(5025)
		expect(() => mosTypes.mosDuration.validate(mosDuration)).not.toThrow()

		expect(() => mosTypes.mosDuration.create('asdf')).toThrow(/Invalid input/)
		expect(() => mosTypes.mosDuration.create('1:23:xx')).toThrow(/Invalid input/)
		expect(() => mosTypes.mosDuration.create('0:00:00')).not.toThrow()
		// @ts-expect-error wrong input type
		expect(() => mosTypes.mosDuration.create([])).toThrow(/Invalid input/)

		// @ts-expect-error wrong input, but still:
		expect(mosTypes.mosDuration.valueOf(5025)).toBe(5025)
	})
	test('is', () => {
		const mosTypes = getMosTypes(true)

		const mosDuration = mosTypes.mosDuration.create('1:23:45')
		expect(mosTypes.mosDuration.is(mosDuration)).toBe(true)
		expect(mosTypes.mosString128.is(mosDuration)).toBe(false)
		expect(mosTypes.mosTime.is(mosDuration)).toBe(false)

		expect(mosTypes.mosDuration.is({})).toBe(false)
		expect(mosTypes.mosDuration.is(null)).toBe(false)
		expect(mosTypes.mosDuration.is('abc')).toBe(false)
		expect(mosTypes.mosDuration.is(123)).toBe(false)

		expect(mosTypes.mosDuration.is({ _mosDuration: 1234 })).toBe(true)
	})
	test('stringify', () => {
		const mosTypes = getMosTypes(true)

		const mosDuration = mosTypes.mosDuration.create('1:23:45')
		expect(mosTypes.mosDuration.stringify(mosDuration)).toBe('1:23:45')

		// @ts-expect-error wrong input, but still:
		expect(mosTypes.mosDuration.stringify('1:23:45')).toBe('1:23:45')
	})
	test('parse durations correctly', () => {
		const mosTypes = getMosTypes(true)
		function toValue(input: any) {
			return mosTypes.mosDuration.valueOf(mosTypes.mosDuration.create(input))
		}
		function toString(input: any) {
			return mosTypes.mosDuration.stringify(mosTypes.mosDuration.create(input))
		}
		expect(toValue('1:23:45')).toBe(5025)
		expect(toString(toValue('1:23:45'))).toBe('1:23:45')
		expect(toString('1:23:45')).toBe('1:23:45')
		expect(toString('1:2:3')).toBe('1:02:03')

		expect(toString('01:23:45')).toBe('1:23:45')
		expect(toString('2:05:23')).toBe('2:05:23')
		expect(toString('1:65:23')).toBe('2:05:23')
	})
})
