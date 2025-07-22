const WmsVbStickUsb = require('./warema-wms-venetian-blinds');
const mqtt = require('mqtt')
const fs = require('fs')

console.log('🚀 Starting Warema Bridge - OL-IVER REFERENCE IMPLEMENTATION')
console.log('🔖 VERSION: 5.0.1-complete-oliverref')
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
    process.exit(0);
});

// Get configuration from Home Assistant add-on options
let config = {};
try {
    const options = JSON.parse(fs.readFileSync('/data/options.json', 'utf8'));
    config = {
        wmsChannel: options.wms_channel || 17,
        wmsKey: options.wms_key || '00112233445566778899AABBCCDDEEFF',
        wmsPanid: options.wms_panid || 'FFFF',
        wmsSerialPort: options.serial_device || '/dev/ttyUSB0',
        ignoredDevices: options.ignored_devices ? options.ignored_devices.split(',') : [],
        forceDevices: options.force_devices ? options.force_devices.split(',') : [],
        mqttServer: options.mqtt_server || 'core-mosquitto:1883',
        mqttUser: options.mqtt_user || '',
        mqttPassword: options.mqtt_password || ''
    };
} catch (err) {
    console.log('⚠️  Could not read options.json, using environment variables');
    config = {
        wmsChannel: process.env.WMS_CHANNEL || 17,
        wmsKey: process.env.WMS_KEY || '00112233445566778899AABBCCDDEEFF',
        wmsPanid: process.env.WMS_PANID || 'FFFF',
        wmsSerialPort: process.env.WMS_SERIAL_PORT || '/dev/ttyUSB0',
        ignoredDevices: process.env.IGNORED_DEVICES ? process.env.IGNORED_DEVICES.split(',') : [],
        forceDevices: process.env.FORCE_DEVICES ? process.env.FORCE_DEVICES.split(',') : [],
        mqttServer: process.env.MQTT_SERVER || 'core-mosquitto:1883',
        mqttUser: process.env.MQTT_USER || '',
        mqttPassword: process.env.MQTT_PASSWORD || ''
    };
}

console.log('🔧 Configuration:', {
    wmsChannel: config.wmsChannel,
    wmsPanid: config.wmsPanid,
    wmsKey: config.wmsKey ? 'SET' : 'NOT SET',
    wmsSerialPort: config.wmsSerialPort,
    mqttServer: config.mqttServer
});

var registered_shades = []
var shade_position = {}
var stickUsb = null
var client = null

function registerDevice(element) {
  const snr = String(element.snr).replace(/^0+/, '')
  console.log('Found device of type "' + element.typeStr + '" with type #' + element.type)
  console.log('Registering device ' + snr)
  
  const topic = 'homeassistant/cover/' + snr + '/' + snr + '/config'
  const availability_topic = 'warema/' + snr + '/availability'

  const base_payload = {
    name: `Warema ${snr}`,
    availability: [
      {topic: 'warema/bridge/state'},
      {topic: availability_topic}
    ],
    unique_id: snr
  }

  const base_device = {
    identifiers: snr,
    manufacturer: "Warema",
    name: snr
  }

  let model
  let payload
  
  switch (parseInt(element.type)) {
    case 6:
      model = 'Weather station'
      payload = {
        ...base_payload,
        device: {
          ...base_device,
          model: model
        }
      }
      break;
    case 20:
      model = 'Plug receiver'
      payload = {
        ...base_payload,
        device: {
          ...base_device,
          model: model
        },
        position_open: 0,
        position_closed: 100,
        command_topic: 'warema/' + snr + '/set',
        position_topic: 'warema/' + snr + '/position',
        tilt_status_topic: 'warema/' + snr + '/tilt',
        set_position_topic: 'warema/' + snr + '/set_position',
        tilt_command_topic: 'warema/' + snr + '/set_tilt',
        tilt_closed_value: 100,
        tilt_opened_value: -100,
        tilt_min: 100,
        tilt_max: -100,
      }
      break;
    case 21:
      model = 'Actuator UP'
      payload = {
        ...base_payload,
        device: {
          ...base_device,
          model: model
        },
        position_open: 0,
        position_closed: 100,
        command_topic: 'warema/' + snr + '/set',
        position_topic: 'warema/' + snr + '/position',
        tilt_status_topic: 'warema/' + snr + '/tilt',
        set_position_topic: 'warema/' + snr + '/set_position',
        tilt_command_topic: 'warema/' + snr + '/set_tilt',
        tilt_closed_value: 100,
        tilt_opened_value: -100,
        tilt_min: 100,
        tilt_max: -100,
      }
      break;
    case 25:
      model = 'Vertical awning'
      payload = {
        ...base_payload,
        device: {
          ...base_device,
          model: model
        },
        position_open: 0,
        position_closed: 100,
        command_topic: 'warema/' + snr + '/set',
        position_topic: 'warema/' + snr + '/position',
        set_position_topic: 'warema/' + snr + '/set_position',
      }
      break;
    default:
      console.log('Unrecognized device type: ' + element.type)
      model = 'Unknown model ' + element.type
      return
  }

  if (config.ignoredDevices.includes(element.snr.toString())) {
    console.log('Ignoring device ' + snr + ' (type ' + element.type + ')')
  } else {
    if (!registered_shades.includes(snr)) {
      console.log('Adding device ' + snr + ' (type ' + element.type + ') to warema stick')
      stickUsb.vnBlindAdd(parseInt(element.snr), element.snr.toString());
      registered_shades.push(snr)
    }
    console.log('Publishing state of device ' + snr + ' (type ' + element.type + ') to Home Assistant')
    client.publish(availability_topic, 'online', {retain: true})
    client.publish(topic, JSON.stringify(payload), {retain: true})
  }
}

function registerDevices() {
  if (config.forceDevices && config.forceDevices.length) {
    config.forceDevices.forEach(element => {
      registerDevice({snr: element.split(':')[0], type: element.split(':')[1] ? element.split(':')[1] : 25 })
    })
  } else {
    console.log('Scanning for WMS devices...')
    stickUsb.scanDevices({autoAssignBlinds: false});
  }
}

function callback(err, msg) {
  if(err) {
    console.log('❌ WMS ERROR: ' + err);
  }
  if(msg) {
    switch (msg.topic) {
      case 'wms-vb-init-completion':
        console.log('✅ Warema WMS initialization completed')
        registerDevices()
        stickUsb.setPosUpdInterval(10000);
        stickUsb.setWatchMovingBlindsInterval(1000)
        break;
      case 'wms-vb-rcv-weather-broadcast':
        if (registered_shades.includes(msg.payload.weather.snr)) {
          client.publish('warema/' + msg.payload.weather.snr + '/illuminance/state', msg.payload.weather.lumen.toString(), {retain: true})
          client.publish('warema/' + msg.payload.weather.snr + '/temperature/state', msg.payload.weather.temp.toString(), {retain: true})
          client.publish('warema/' + msg.payload.weather.snr + '/wind_speed/state', msg.payload.weather.wind.toString(), {retain: true})
        } else {
          console.log('Received weather update for unregistered device: ' + msg.payload.weather.snr)
        }
        break;
      case 'wms-vb-blind-position-update':
        client.publish('warema/' + msg.payload.snr + '/position', msg.payload.position.toString(), {retain: true})
        client.publish('warema/' + msg.payload.snr + '/tilt', msg.payload.angle.toString(), {retain: true})
        shade_position[msg.payload.snr] = {
          position: msg.payload.position,
          angle: msg.payload.angle
        }
        break;
      case 'wms-vb-scanned-devices':
        console.log('📡 Scanned devices completed')
        msg.payload.devices.forEach(element => registerDevice(element))
        console.log('📋 Registered blinds:', stickUsb.vnBlindsList())
        break;
      case 'wms-vb-network-params':
        console.log('🔑 WMS Network parameters detected:')
        console.log('   Channel:', msg.payload.channel)
        console.log('   PAN ID:', msg.payload.panId)
        console.log('   Key:', msg.payload.networkKey)
        break;
      default:
        console.log('🔍 WMS Message:', JSON.stringify(msg));
    }
  }
}

// MQTT Client
const mqttUrl = config.mqttServer.startsWith('mqtt://') ? config.mqttServer : `mqtt://${config.mqttServer}`;
client = mqtt.connect(mqttUrl, {
    username: config.mqttUser || undefined,
    password: config.mqttPassword || undefined,
    will: {
      topic: 'warema/bridge/state',
      payload: 'offline',
      retain: true
    }
  })

client.on('connect', function (connack) {
  console.log('✅ Connected to MQTT broker')
  client.subscribe('warema/#')
  client.subscribe('homeassistant/status')
  
  if (stickUsb == null) {
    console.log('🔌 Initializing WMS USB Stick...')
    console.log(`   Port: ${config.wmsSerialPort}`)
    console.log(`   Channel: ${config.wmsChannel}`)
    console.log(`   PAN ID: ${config.wmsPanid}`)
    console.log(`   Key: ${config.wmsKey ? 'SET' : 'NOT SET'}`)
    
    stickUsb = new WmsVbStickUsb(
      config.wmsSerialPort,
      config.wmsChannel,
      config.wmsPanid,
      config.wmsKey,
      {},
      callback
    );
  }
  client.publish('warema/bridge/state', 'online', {retain: true})
})

client.on('error', function (error) {
  console.log('❌ MQTT Error: ' + error.toString())
})

client.on('reconnect', () => {
  console.log('🔄 Reconnecting to MQTT');
});

client.on('message', function (topic, message) {
  const scope = topic.split('/')[0]
  if (scope == 'warema') {
    const device = parseInt(topic.split('/')[1])
    const command = topic.split('/')[2]
    switch (command) {
      case 'set':
        switch (message.toString()) {
          case 'CLOSE':
            console.log('📤 Sending CLOSE command to device: ' + device)
            stickUsb.vnBlindSetPosition(device, 100, 100)
            break;
          case 'OPEN':
            console.log('📤 Sending OPEN command to device: ' + device)
            stickUsb.vnBlindSetPosition(device, 0, -100)
            break;
          case 'STOP':
            console.log('📤 Sending STOP command to device: ' + device)
            stickUsb.vnBlindStop(device)
            break;
        }
        break;
      case 'set_position':
        const position = parseInt(message.toString())
        console.log('📤 Sending position ' + position + ' to device: ' + device)
        stickUsb.vnBlindSetPosition(device, position, -100)
        break;
      case 'set_tilt':
        const tilt = parseInt(message.toString())
        if (shade_position[device]) {
          console.log('📤 Sending tilt ' + tilt + ' to device: ' + device)
          stickUsb.vnBlindSetPosition(device, shade_position[device].position, tilt)
        }
        break;
    }
  }
  
  if (scope == 'homeassistant' && topic.split('/')[1] == 'status' && message.toString() == 'online') {
    console.log('🏠 Home Assistant came online, re-registering devices')
    setTimeout(registerDevices, 5000)
  }
})

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
                        wms.vnBlindSetPosition(deviceId, 0, -100) // Fully open
                        break
                    case 'CLOSE':
                        console.log(`📤 Closing device ${deviceId}`)
                        wms.vnBlindSetPosition(deviceId, 100, 100) // Fully closed
                        break
                    case 'STOP':
                        console.log(`📤 Stopping device ${deviceId}`)
                        wms.vnBlindStop(deviceId)
                        break
                }
            } else if (command === 'set_position') {
                const position = parseInt(msg)
                if (!isNaN(position) && position >= 0 && position <= 100) {
                    console.log(`📤 Setting device ${deviceId} to position ${position}%`)
                    wms.vnBlindSetPosition(deviceId, position, 0) // Set position with horizontal slats
                }
            }
        } catch (error) {
            console.error(`❌ Error controlling device ${deviceId}:`, error.message)
        }
    }
}

// Initialize Warema WMS
function initializeWarema() {
    console.log('🔌 Initializing Warema WMS connection...')
    
    try {
        // Read configuration from Home Assistant add-on options
        let config = {}
        try {
            const fs = require('fs')
            const optionsFile = process.env.HASSIO_OPTIONS || '/data/options.json'
            if (fs.existsSync(optionsFile)) {
                const optionsData = fs.readFileSync(optionsFile, 'utf8')
                config = JSON.parse(optionsData)
                console.log('📋 Loaded configuration:', JSON.stringify(config, null, 2))
            } else {
                console.log('⚠️  No options file found, using defaults')
            }
        } catch (e) {
            console.log('⚠️  Could not read configuration:', e.message)
        }
        
        // WMS Configuration with network parameters
        const wmsConfig = {
            device: config.serial_device || '/dev/ttyUSB0',
            baudRate: config.baud_rate || 38400,
            channel: config.wms_channel || 17,
            panid: config.wms_panid || 'FFFF',
            key: config.wms_key || '00112233445566778899AABBCCDDEEFF',
            timeout: 10000,
            retries: 3
        }
        
        console.log('🔧 WMS Configuration:', JSON.stringify({
            device: wmsConfig.device,
            baudRate: wmsConfig.baudRate,
            channel: wmsConfig.channel,
            panid: wmsConfig.panid,
            keyLength: wmsConfig.key.length,
            hasValidKey: wmsConfig.key.length === 32
        }, null, 2))
        
        // Create WMS controller with proper network parameters
        wms = new warema.WmsVbStickUsb(
            wmsConfig.device,
            wmsConfig.channel,
            wmsConfig.panid,
            wmsConfig.key,
            {}, // options
            handleWmsCallback
        )
        
        function handleWmsCallback(err, msg) {
            if (err) {
                console.error('❌ WMS Callback error:', err)
                return
            }
            
            if (msg && msg.topic) {
                console.log(`📨 WMS Message: ${msg.topic}`)
                
                switch (msg.topic) {
                    case 'wms-vb-init-completion':
                        console.log('✅ WMS initialization completed')
                        if (config.device_ids && config.device_ids.length > 0) {
                            // Add specific device IDs
                            config.device_ids.forEach(deviceId => {
                                const deviceName = `Device ${deviceId}`
                                wms.addVnBlind(deviceId, deviceName)
                                console.log(`🎯 Added device: ${deviceId} (${deviceName})`)
                            })
                        } else {
                            // Scan for devices
                            console.log('🔍 Scanning for WMS devices...')
                            wms.scanDevices({ autoAssignBlinds: true })
                        }
                        break
                        
                    case 'wms-vb-scanned-devices':
                        console.log(`🔍 Found ${msg.payload.devices.length} WMS devices`)
                        msg.payload.devices.forEach(device => {
                            console.log(`  - Device ${device.snr} (${device.snrHex}) - ${device.typeStr}`)
                            const deviceObj = {
                                id: device.snr,
                                name: `${device.typeStr.trim()} ${device.snr}`,
                                type: device.type
                            }
                            devices.set(device.snr, deviceObj)
                            publishHomeAssistantDiscovery(deviceObj)
                        })
                        break
                        
                    case 'wms-vb-blind-position-update':
                        const deviceId = msg.payload.snr
                        console.log(`📍 Device ${deviceId} position: ${msg.payload.position}%, angle: ${msg.payload.angle}%`)
                        client.publish(`warema/cover/${deviceId}/position`, msg.payload.position.toString(), {retain: true})
                        break
                        
                    case 'wms-vb-deviceFound':
                        const foundDevice = {
                            id: msg.payload.snr,
                            name: msg.payload.name || `Device ${msg.payload.snr}`,
                            type: msg.payload.type
                        }
                        console.log(`� Found device: ${foundDevice.id} - ${foundDevice.name}`)
                        devices.set(foundDevice.id, foundDevice)
                        publishHomeAssistantDiscovery(foundDevice)
                        break
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Failed to initialize Warema WMS:', error.message)
        console.log('⚠️  Running in MQTT-only mode for testing')
        
        // Publish test message to show the bridge is working
        client.publish('warema/bridge/test', JSON.stringify({
            message: 'Warema Bridge running in test mode - WMS initialization failed',
            timestamp: new Date().toISOString(),
            version: '5.0.0-complete',
            error: error.message
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
