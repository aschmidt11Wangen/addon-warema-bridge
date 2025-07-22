const warema = require('./warema-wms-venetian-blinds');
const mqtt = require('mqtt')

console.log('🚀 Starting Warema Bridge - COMPLETE IMPLEMENTATION')
console.log('🔖 VERSION: 5.0.0-complete - FULL WAREMA + MQTT + HA DISCOVERY')
console.log('🔖 BUILD: ' + new Date().toISOString())

originalLog = console.log;
console.log = function () {
    var args = [].slice.call(arguments);
    originalLog.apply(console.log,[getCurrentDateString()].concat(args));
};

function getCurrentDateString() {
    return (new Date()).toISOString() + ':';
};

process.on('SIGINT', function() {
    console.log('🛑 Received SIGINT, shutting down gracefully...');
    if (client) {
        client.publish('warema/bridge/state', 'offline', {retain: true});
        client.end();
    }
    if (wms) {
        wms.disconnect();
    }
    process.exit(0);
});

console.log('� Initializing Warema WMS and MQTT systems...')

var client
var wms
var devices = new Map()

// MQTT Discovery for Home Assistant
function publishHomeAssistantDiscovery(device) {
    const deviceId = `warema_${device.id}`
    const uniqueId = `warema_bridge_${device.id}`
    
    // Cover entity for Home Assistant
    const coverConfig = {
        name: `Warema ${device.name || device.id}`,
        unique_id: uniqueId,
        device_class: "blind",
        command_topic: `warema/cover/${device.id}/set`,
        position_topic: `warema/cover/${device.id}/position`,
        set_position_topic: `warema/cover/${device.id}/set_position`,
        position_open: 100,
        position_closed: 0,
        payload_open: "OPEN",
        payload_close: "CLOSE",
        payload_stop: "STOP",
        optimistic: false,
        device: {
            identifiers: [deviceId],
            name: `Warema ${device.name || device.id}`,
            manufacturer: "Warema",
            model: "WMS Venetian Blind",
            via_device: "warema_bridge"
        }
    }
    
    client.publish(`homeassistant/cover/${uniqueId}/config`, JSON.stringify(coverConfig), {retain: true})
    console.log(`✅ Published HA discovery for device ${device.id}`)
}

// Get MQTT credentials from Home Assistant Services API
async function getMQTTCredentials() {
    const tokens = [process.env.SUPERVISOR_TOKEN, process.env.HASSIO_TOKEN].filter(Boolean)
    
    for (const token of tokens) {
        try {
            const http = require('http')
            const options = {
                hostname: 'supervisor',
                port: 80,
                path: '/services/mqtt',
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
            
            const result = await new Promise((resolve) => {
                const req = http.request(options, (res) => {
                    let data = ''
                    res.on('data', chunk => data += chunk)
                    res.on('end', () => {
                        try {
                            const response = JSON.parse(data)
                            if (response.data) {
                                console.log('✅ Found MQTT credentials from Home Assistant Services API')
                                resolve(response.data)
                                return
                            }
                            resolve(null)
                        } catch (e) {
                            resolve(null)
                        }
                    })
                })
                req.on('error', () => resolve(null))
                req.setTimeout(5000, () => {
                    req.destroy()
                    resolve(null)
                })
                req.end()
            })
            
            if (result) return result
        } catch (e) {
            console.log('Could not get MQTT credentials:', e.message)
        }
    }
    
    return null
}

// Initialize MQTT connection
async function initializeMQTT() {
    console.log('🚀 Initializing MQTT connection...')
    
    const mqttConfig = await getMQTTCredentials()
    
    let mqttOptions = {
        will: {
            topic: 'warema/bridge/state',
            payload: 'offline',
            retain: true
        },
        keepalive: 60,
        reconnectPeriod: 5000
    }
    
    let mqttUrl = 'mqtt://core-mosquitto:1883'
    
    if (mqttConfig && mqttConfig.username && mqttConfig.password) {
        mqttOptions.username = mqttConfig.username
        mqttOptions.password = mqttConfig.password
        mqttUrl = `mqtt://${mqttConfig.host || 'core-mosquitto'}:${mqttConfig.port || 1883}`
        console.log('🔑 Using MQTT credentials from Home Assistant Services')
    } else {
        console.log('⚠️  No MQTT credentials found - trying without authentication')
    }
    
    client = mqtt.connect(mqttUrl, mqttOptions)
    
    client.on('connect', () => {
        console.log('✅ Successfully connected to MQTT broker!')
        client.publish('warema/bridge/state', 'online', {retain: true})
        
        // Subscribe to command topics
        client.subscribe('warema/cover/+/set', (err) => {
            if (err) console.error('❌ Failed to subscribe to cover commands:', err)
            else console.log('📡 Subscribed to cover command topics')
        })
        
        client.subscribe('warema/cover/+/set_position', (err) => {
            if (err) console.error('❌ Failed to subscribe to position commands:', err)
            else console.log('📡 Subscribed to position command topics')
        })
        
        // Initialize Warema WMS after MQTT is ready
        initializeWarema()
    })
    
    client.on('message', handleMQTTMessage)
    
    client.on('error', (error) => {
        console.error('❌ MQTT connection error:', error.message)
    })
    
    client.on('offline', () => {
        console.log('📡 MQTT client went offline')
    })
    
    client.on('reconnect', () => {
        console.log('🔄 MQTT client reconnecting...')
    })
}

// Handle MQTT messages
function handleMQTTMessage(topic, message) {
    const msg = message.toString()
    console.log(`📨 Received MQTT message: ${topic} = ${msg}`)
    
    const topicParts = topic.split('/')
    if (topicParts.length >= 4 && topicParts[0] === 'warema' && topicParts[1] === 'cover') {
        const deviceId = parseInt(topicParts[2])
        const command = topicParts[3]
        
        const device = devices.get(deviceId)
        if (!device) {
            console.log(`⚠️  Device ${deviceId} not found`)
            return
        }
        
        try {
            if (command === 'set') {
                switch (msg) {
                    case 'OPEN':
                        console.log(`📤 Opening device ${deviceId}`)
                        wms.setPosition(deviceId, 100)
                        break
                    case 'CLOSE':
                        console.log(`📤 Closing device ${deviceId}`)
                        wms.setPosition(deviceId, 0)
                        break
                    case 'STOP':
                        console.log(`📤 Stopping device ${deviceId}`)
                        wms.stop(deviceId)
                        break
                }
            } else if (command === 'set_position') {
                const position = parseInt(msg)
                if (!isNaN(position) && position >= 0 && position <= 100) {
                    console.log(`📤 Setting device ${deviceId} to position ${position}%`)
                    wms.setPosition(deviceId, position)
                }
            }
        } catch (error) {
            console.error(`❌ Error controlling device ${deviceId}:`, error.message)
        }
    }
}

// Initialize Warema WMS
function initializeWarema() {
    console.log('� Initializing Warema WMS connection...')
    
    try {
        wms = new warema.WmsController({
            // Add your WMS configuration here
            timeout: 10000,
            retries: 3
        })
        
        wms.on('error', (error) => {
            console.error('❌ Warema WMS error:', error.message)
        })
        
        wms.on('deviceFound', (device) => {
            console.log(`🔍 Found Warema device: ${device.id} - ${device.name || 'Unknown'}`)
            devices.set(device.id, device)
            
            // Publish Home Assistant discovery
            publishHomeAssistantDiscovery(device)
            
            // Publish initial state
            client.publish(`warema/cover/${device.id}/position`, device.position?.toString() || '50', {retain: true})
        })
        
        wms.on('positionUpdate', (deviceId, position) => {
            console.log(`� Device ${deviceId} position update: ${position}%`)
            client.publish(`warema/cover/${deviceId}/position`, position.toString(), {retain: true})
        })
        
        wms.on('connected', () => {
            console.log('✅ Connected to Warema WMS network!')
            wms.scanDevices()
        })
        
        wms.on('disconnected', () => {
            console.log('� Disconnected from Warema WMS network')
        })
        
        // Start WMS connection
        wms.connect()
        
    } catch (error) {
        console.error('❌ Failed to initialize Warema WMS:', error.message)
        console.log('⚠️  Running in MQTT-only mode for testing')
        
        // Publish test message to show the bridge is working
        client.publish('warema/bridge/test', JSON.stringify({
            message: 'Warema Bridge running in test mode - WMS initialization failed',
            timestamp: new Date().toISOString(),
            version: '5.0.0-complete'
        }), {retain: true})
    }
}

// Start the bridge
console.log('🌟 Starting Warema Bridge initialization sequence...')
initializeMQTT()

// Health check endpoint simulation
setInterval(() => {
    if (client && client.connected) {
        client.publish('warema/bridge/heartbeat', JSON.stringify({
            timestamp: new Date().toISOString(),
            devices: devices.size,
            status: 'running'
        }), {retain: false})
    }
}, 60000) // Every minute
