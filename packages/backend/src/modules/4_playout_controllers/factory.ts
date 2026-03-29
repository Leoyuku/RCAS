/**
 * 设备驱动工厂
 *
 * 唯一允许出现设备品牌名（type 字符串）的地方。
 * 所有其他文件通过接口操作，不知道具体驱动类的存在。
 */

import type { DeviceConfig } from './interfaces/device-config'
import type { IBaseDriver } from './interfaces/device-drivers'
import { TricasterDriver } from './tricaster/tricaster-driver'

export function createDriver(config: DeviceConfig): IBaseDriver {
    switch (config.type) {
        case 'tricaster':
            return new TricasterDriver(config as import('./interfaces/device-config').SwitcherConfig)

        // 以下驱动待实现（P2）
        case 'bitcentral-precis':
            throw new Error('[DeviceFactory] BitcentralDriver not implemented yet')

        case 'newscaster':
            throw new Error('[DeviceFactory] NewscasterDriver not implemented yet')

        case 'viz-engine':
            throw new Error('[DeviceFactory] VizEngineDriver not implemented yet')

        case 'atem':
        case 'vmix':
            throw new Error(`[DeviceFactory] ${config.type} driver not implemented yet`)

        default:
            throw new Error(`[DeviceFactory] Unknown device type: ${(config as DeviceConfig).type}`)
    }
}
