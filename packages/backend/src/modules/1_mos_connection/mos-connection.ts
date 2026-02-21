/**
 * @file mos-connection.ts
 * @description MOS 连接层 (Layer 1) 的总入口。
 * 它负责管理 TCP 连接，处理 MOS 协议握手，并向外派发原始 XML 消息事件。
 */

import { EventEmitter } from 'events';
import * as net from 'net';

export interface MosConnectionConfig {
    mosId: string;
    ncsId: string;
    host: string;
    port: number;
}

export class MosConnection extends EventEmitter {
    private socket: net.Socket;
    private config: MosConnectionConfig;
    private isConnected: boolean = false;

    constructor(config: MosConnectionConfig) {
        super();
        this.config = config;
        this.socket = new net.Socket();
        this.setupSocket();
    }

    private setupSocket() {
        this.socket.on('connect', () => {
            console.log(`[MOS] Connected to ${this.config.host}:${this.config.port}`);
            this.isConnected = true;
            this.sendHeartbeat(); // Start heartbeat immediately
        });

        this.socket.on('data', (data) => {
            const xmlString = data.toString('utf16le'); // MOS typically uses UTF-16LE
            this.handleData(xmlString);
        });

        this.socket.on('error', (err) => {
            console.error(`[MOS] Socket error: ${err.message}`);
            this.isConnected = false;
        });

        this.socket.on('close', () => {
            console.log('[MOS] Connection closed');
            this.isConnected = false;
            // TODO: Implement reconnection logic
        });
    }

    public connect() {
        this.socket.connect(this.config.port, this.config.host);
    }

    private sendHeartbeat() {
        if (!this.isConnected) return;
        
        // Construct a basic heartbeat message (heartbeat)
        const heartbeatXml = `
            <mos>
                <mosID>${this.config.mosId}</mosID>
                <ncsID>${this.config.ncsId}</ncsID>
                <messageID>0</messageID>
                <heartbeat>
                    <time>${new Date().toISOString()}</time>
                </heartbeat>
            </mos>
        `;
        
        // TODO: Convert to proper encoding before sending
        // this.socket.write(heartbeatXml);
        
        setTimeout(() => this.sendHeartbeat(), 5000); // Send every 5 seconds
    }

    private handleData(xmlString: string) {
        // Simple regex to detect message type (for now)
        // In a real implementation, we would use a proper XML parser here or in the next layer.
        
        if (xmlString.includes('<roCreate>')) {
            this.emit('roCreate', xmlString);
        } else if (xmlString.includes('<roDelete>')) {
            this.emit('roDelete', xmlString);
        } else if (xmlString.includes('<heartbeat>')) {
            // Respond to heartbeat? Or just ignore.
        }
    }
}
