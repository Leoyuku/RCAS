/* 基本转换: 从 Date 对象创建，并验证 stringify（格式化为 MOS 标准字符串）和 valueOf（转换为 Unix 时间戳）的正确性。
类型守卫 is(): 与 mosString128 类似，确保能正确识别 mosTime 对象。
解析逻辑 (create from string/number): 这是最复杂的部分。测试了大量不同的输入格式：
无效输入 (undefined, abcd, {}, null) 应该抛出错误。
标准 Date 对象、Unix 时间戳 (number)、以及各种 JavaScript Date 的字符串输出。
MOS 特有的时间格式，包括有无毫秒（用 . 或 , 分隔）、有无时区、以及不同的时区偏移格式（Z, +05:00, -05:00 等）。
格式化逻辑 (stringify): 测试了将内部表示转换为 MOS 标准时间字符串的各种情况，确保输出的稳定性和正确性。
边界条件: 测试了午夜、跨年等时间点的处理，这些是时间处理逻辑中最容易出错的地方。代码中还留下了 @todo 注释，用于未来添加夏令时和闰年的测试，这表明原始开发者对代码质量有很高的要求。 */

import { getMosTypes } from '../../mosTypes'

describe('MosTime', () => {
	test('basic', () => {
		const mosTypes = getMosTypes(true)

		const date = new Date('2009-04-11T14:22:07Z')

		const mosTime = mosTypes.mosTime.create(date)
		expect(mosTypes.mosTime.stringify(mosTime)).toBe('2009-04-11T14:22:07,000')
		expect(mosTypes.mosTime.valueOf(mosTime)).toBe(date.getTime())
		expect(() => mosTypes.mosTime.validate(mosTime)).not.toThrow()
		// @ts-expect-error wrong input, but still:
		expect(mosTypes.mosTime.valueOf(123456)).toBe(123456)
	})
	test('is', () => {
		const mosTypes = getMosTypes(true)

		const mosString = mosTypes.mosString128.create('test test')
		expect(mosTypes.mosString128.is(mosString)).toBe(true)
		expect(mosTypes.mosDuration.is(mosString)).toBe(false)
		expect(mosTypes.mosTime.is(mosString)).toBe(false)

		expect(mosTypes.mosTime.is({})).toBe(false)
		expect(mosTypes.mosTime.is(null)).toBe(false)
		expect(mosTypes.mosTime.is('abc')).toBe(false)
		expect(mosTypes.mosTime.is(123)).toBe(false)
		expect(
			mosTypes.mosTime.is({
				_mosTime: 123,
			})
		).toBe(false)
		expect(
			mosTypes.mosTime.is({
				_mosTime: 123,
				_timezone: 'Z',
			})
		).toBe(false)
		expect(
			mosTypes.mosTime.is({
				_mosTime: 123,
				_timezoneOffset: 0,
			})
		).toBe(false)
	})
	test('parse time correctly', () => {
		const mosTypes = getMosTypes(true)
		function toTime(input: any) {
			return mosTypes.mosTime.valueOf(mosTypes.mosTime.create(input))
		}

		// test invalid date formats
		// @ts-ignore
		let date = new Date(undefined) // Invalid date
		expect(() => mosTypes.mosTime.create(date)).toThrow(/Invalid timestamp/)
		expect(() => mosTypes.mosTime.create('abcd')).toThrow(/Invalid timestamp/)
		
		// @ts-expect-error bad input
		expect(() => mosTypes.mosTime.create({})).toThrow(/Invalid input/)
		
		expect(() => mosTypes.mosTime.create(null)).toThrow(/Invalid input/)
		
		expect(() => mosTypes.mosTime.create(undefined)).toThrow(/Invalid input/)
		
		// @ts-expect-error bad input
		expect(() => mosTypes.mosTime.create(false)).toThrow(/Invalid input/)

		// test input format date, number and various strings
		date = new Date(2018, 1, 24, 23, 13, 52, 0) // local, zero-indexed month
		expect(toTime(date)).toBe(date.getTime())
		expect(toTime(date.getTime())).toBe(date.getTime())
		expect(toTime(date.toString())).toBe(date.getTime()) // locale time
		expect(toTime(date.toUTCString())).toBe(date.getTime()) // utc
		expect(toTime(123456789)).toBe(123456789)
		expect(Math.abs(toTime(Date.now()) - new Date().getTime())).toBeLessThan(10)

		expect(mosTypes.mosTime.valueOf(mosTypes.mosTime.create(mosTypes.mosTime.create(date)))).toBe(date.getTime())

		// mos-centric strings
		expect(toTime('2009-04-11T14:22:07Z')).toBe(new Date('2009-04-11T14:22:07Z').getTime())
		expect(toTime('2009-04-11T14:22:07')).toBe(new Date('2009-04-11T14:22:07Z').getTime())
		expect(toTime('2009-04-11T14:22:07.123')).toBe(new Date('2009-04-11T14:22:07.123Z').getTime())
		expect(toTime('2009-04-11T14:22:07,123')).toBe(new Date('2009-04-11T14:22:07.123Z').getTime())
		expect(toTime('2009-04-11T14:22:07.123-05:00')).toBe(new Date('2009-04-11T14:22:07-05:00').getTime() + 123)
		expect(toTime('2009-04-11T14:22:07,123-05:00')).toBe(new Date('2009-04-11T14:22:07-05:00').getTime() + 123)
		expect(toTime('2009-04-11T14:22:07Z')).toBe(new Date('2009-04-11T14:22:07Z').getTime())
		expect(toTime('2009-04-11T14:22:07Z')).toBe(new Date('2009-04-11T14:22:07Z').getTime())
		expect(toTime('2009-04-11T14:22:07+5:00')).toBe(new Date('2009-04-11T14:22:07+05:00').getTime())
		expect(toTime('2009-04-11T14:22:07+5:30')).toBe(new Date('2009-04-11T14:22:07+05:30').getTime())
		expect(toTime('2009-04-11T14:22:07+5:5')).toBe(new Date('2009-04-11T14:22:07+05:05').getTime())
		expect(toTime('Sun Feb 25 2018 08:59:08 GMT+0100 (CET)')).toBe(new Date('2018-02-25T08:59:08+01:00').getTime())
	})
	test('format time strings correctly', () => {
		const mosTypes = getMosTypes(true)
		function toStr(input: any) {
			return mosTypes.mosTime.stringify(mosTypes.mosTime.create(input))
		}

		const date = new Date(Date.UTC(2018, 1, 24, 23, 13, 52, 0)) // utc, zero-indexed month
		expect(toStr(date)).toBe('2018-02-24T23:13:52,000')
		expect(toStr(1519514032000)).toBe('2018-02-24T23:13:52,000') // date.getTime()
		// expect(toStr('Sun Feb 25 2018 00:13:52 GMT+0100 (W. Europe Standard Time)')).toBe('2018-02-25T00:13:52,000+01:00') // date.toString() locale time
		expect(toStr('Sat, 24 Feb 2018 23:13:52 GMT')).toBe('2018-02-24T23:13:52,000') // date.toUTCString()
		expect(toStr('2018-02-24T23:13:52.000Z')).toBe('2018-02-24T23:13:52,000Z') // date.toISOString()

		// mos-centric strings
		// let localHours = 14
		// localHours += new Date().getTimezoneOffset() / 60
		// expect(toStr('2009-04-11T14:22:07')).toBe('2009-04-11T' + localHours + ':22:07,000Z')
		// expect(toStr('2009-04-11T14:22:07.123')).toBe('2009-04-11T' + localHours + ':22:07,123Z')
		// expect(toStr('2009-04-11T14:22:07,123')).toBe('2009-04-11T' + localHours + ':22:07,123Z')
		expect(toStr('2009-04-11T14:22:07Z')).toBe('2009-04-11T14:22:07,000Z')
		expect(toStr('2009-04-11T14:22:07.123Z')).toBe('2009-04-11T14:22:07,123Z')
		expect(toStr('2009-04-11T14:22:07,123Z')).toBe('2009-04-11T14:22:07,123Z')
		expect(toStr('2009-04-11T14:22:07,123-05:00')).toBe('2009-04-11T14:22:07,123-05:00')
		expect(toStr('2009-04-11T14:22:07.123-05:00')).toBe('2009-04-11T14:22:07,123-05:00')
		expect(toStr('2009-04-11T14:22:07Z')).toBe('2009-04-11T14:22:07,000Z')
		expect(toStr('2009-04-11T14:22:07+5:00')).toBe('2009-04-11T14:22:07,000+05:00')

		// @ts-expect-error wrong input format, but still:
		expect(mosTypes.mosTime.stringify('2009-04-11T14:22:07,000+05:00')).toBe('2009-04-11T14:22:07,000+05:00')
	})
	test('handles tricky (midnight, new year, summer time, leap year) corectly', () => {
		const mosTypes = getMosTypes(true)
		function toTime(input: any) {
			return mosTypes.mosTime.valueOf(mosTypes.mosTime.create(input))
		}
		function toStr(input: any) {
			return mosTypes.mosTime.stringify(mosTypes.mosTime.create(input))
		}

		const SEC = 1000
		const MIN = 60 * SEC
		const HOUR = MIN * 60
		// const DAY = HOUR * 24

		// @todo: double check all expectations

		// midnight
		let date = new Date(Date.UTC(2018, 1, 24, 23, 13, 52, 0)) // utc, zero-indexed month
		date.setTime(date.getTime() + 2 * HOUR)
		expect(toTime(date)).toBe(new Date(Date.UTC(2018, 1, 25, 1, 13, 52)).getTime()) // locale time
		expect(toTime(date.toString())).toBe(new Date(Date.UTC(2018, 1, 25, 1, 13, 52)).getTime()) // locale time
		expect(toTime(date.toUTCString())).toBe(new Date(Date.UTC(2018, 1, 25, 1, 13, 52)).getTime()) // locale time
		expect(toTime(date.toISOString())).toBe(new Date(Date.UTC(2018, 1, 25, 1, 13, 52)).getTime()) // locale time

		expect(toStr(date)).toBe('2018-02-25T01:13:52,000') // locale time
		expect(toStr(date.toUTCString())).toBe('2018-02-25T01:13:52,000') // locale time

		// @todo: how to test with local time/offsets?

		// new year
		date = new Date(Date.UTC(2018, 11, 31, 23, 13, 52, 0)) // utc, zero-indexed month
		date.setTime(date.getTime() + 2 * HOUR)
		expect(toTime(date)).toBe(new Date(Date.UTC(2019, 0, 1, 1, 13, 52)).getTime()) // locale time
		expect(toTime(date.toString())).toBe(new Date(Date.UTC(2019, 0, 1, 1, 13, 52)).getTime()) // locale time
		expect(toTime(date.toUTCString())).toBe(new Date(Date.UTC(2019, 0, 1, 1, 13, 52)).getTime()) // locale time
		expect(toTime(date.toISOString())).toBe(new Date(Date.UTC(2019, 0, 1, 1, 13, 52)).getTime()) // locale time

		expect(toStr(date)).toBe('2019-01-01T01:13:52,000') // locale time
		expect(toStr(date.toUTCString())).toBe('2019-01-01T01:13:52,000') // locale time

		// @todo: daylight savings spring

		// @todo: daylight savings fall

		// @todo: leap year
	})
})
