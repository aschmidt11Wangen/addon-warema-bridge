const warema = require('./warema-wms-venetian-blinds');
const mqtt = require('mqtt')
const fs = require('fs')

console.log('🚀 Starting Warema Bridge - ol-iver fork v1.0.0');

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

// Function to get Home Assistant add-on options
function getAddOnOptions() {
    try {
        const optionsFile = '/data/options.json';
        if (fs.existsSync(optionsFile)) {
            const options = JSON.parse(fs.readFileSync(optionsFile, 'utf8'));
            console.log('📄 Using Home Assistant add-on options');
            return options;
        }
    } catch (err) {
        console.log('⚠️ Could not read add-on options:', err.message);
    }
    
    console.log('📄 Using environment variables');
    return {
        wms_key: process.env.WMS_KEY,
        wms_pan_id: process.env.WMS_PAN_ID,
        wms_channel: process.env.WMS_CHANNEL,
        wms_serial_port: process.env.WMS_SERIAL_PORT,
        ignored_devices: process.env.IGNORED_DEVICES,
        force_devices: process.env.FORCE_DEVICES
    };
}

const options = getAddOnOptions();
const ignoredDevices = options.ignored_devices ? options.ignored_devices.split(',') : []
const forceDevices = options.force_devices ? options.force_devices.split(',') : []

const settingsPar = {
    wmsChannel   : options.wms_channel || process.env.WMS_CHANNEL || 17,
    wmsKey       : options.wms_key || process.env.WMS_KEY || '00112233445566778899AABBCCDDEEFF',
    wmsPanid     : options.wms_pan_id || process.env.WMS_PAN_ID || 'FFFF',
    wmsSerialPort: options.wms_serial_port || process.env.WMS_SERIAL_PORT || '/dev/ttyUSB0',
  };

console.log('🔧 WMS Configuration:');
console.log('   Serial Port:', settingsPar.wmsSerialPort);
console.log('   Channel:', settingsPar.wmsChannel);
console.log('   PAN ID:', settingsPar.wmsPanid);
console.log('   Key:', settingsPar.wmsKey ? 'SET' : 'NOT SET');

var registered_shades = []
var shade_position = {}
var shade_state = {}

function registerDevice(element) {
  snr = String(element.snr).replace(/^0+/, '')
  console.log('Found device of type "' + element.typeStr + '" with type #' + element.type)
  console.log('Registering ' + snr)
  var topic = 'homeassistant/cover/' + snr + '/' + snr + '/config'
  var availability_topic = 'warema/' + snr + '/availability'

  var base_payload = {
    name: null,
    availability: [
      {topic: 'warema/bridge/state'},
      {topic: availability_topic}
    ],
    unique_id: snr
  }

  var base_device = {
    identifiers: snr,
    manufacturer: "Warema",
    name: snr
  }

  var model
  var payload
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
    // WMS WebControl Pro - while part of the network, we have no business to do with it.
    case 9:
      return
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
        state_topic: 'warema/' + snr + '/state',
        state_open: 'open',
        state_closed: 'closed',
        state_opening: 'opening',
        state_closing: 'closing',
        state_stopped: 'stopped',
        tilt_status_topic: 'warema/' + snr + '/tilt',
        set_position_topic: 'warema/' + snr + '/set_position',
        tilt_command_topic: 'warema/' + snr + '/set_tilt',
        tilt_closed_value: 100,
        tilt_opened_value: -100,
        tilt_min: -100,
        tilt_max: 100,
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
        state_topic: 'warema/' + snr + '/state',
        state_open: 'open',
        state_closed: 'closed',
        state_opening: 'opening',
        state_closing: 'closing',
        state_stopped: 'stopped',
        tilt_status_topic: 'warema/' + snr + '/tilt',
        set_position_topic: 'warema/' + snr + '/set_position',
        tilt_command_topic: 'warema/' + snr + '/set_tilt',
        tilt_closed_value: 100,
        tilt_opened_value: -100,
        tilt_min: -100,
        tilt_max: 100,
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
        state_topic: 'warema/' + snr + '/state',
        state_open: 'open',
        state_closed: 'closed',
        state_opening: 'opening',
        state_closing: 'closing',
        state_stopped: 'stopped',
        set_position_topic: 'warema/' + snr + '/set_position',
      }
      break;
    default:
      console.log('Unrecognized device type: ' + element.type)
      model = 'Unknown model ' + element.type
      return
  }

  if (ignoredDevices.includes(element.snr.toString())) {
    console.log('Ignoring device ' + snr + ' (type ' + element.type + ')')
  } else {
    if (!registered_shades.includes(snr)) {
      // Weather stations (type 6) self-broadcast their data via wms-vb-rcv-weather-broadcast.
      // Do NOT add them to the stick's blind list - they never respond to blindGetPos and
      // each attempt causes 6 retries × 500ms = ~3.5s of radio queue blockage per poll cycle.
      if (parseInt(element.type) !== 6) {
        console.log('Adding device ' + snr + ' (type ' + element.type + ') to warema stick')
        stickUsb.vnBlindAdd(parseInt(element.snr), element.snr.toString());
      } else {
        console.log('Skipping vnBlindAdd for weather station ' + snr + ' (type 6) - data comes via broadcast')
      }
      registered_shades.push(snr)
    }
    console.log('Publishing state of device ' + snr + ' (type ' + element.type + ') to Home Assistant')
    client.publish(availability_topic, 'online', {retain: true})
    client.publish(topic, JSON.stringify(payload), {retain: true})
  }
}

function registerDevices() {
  if (forceDevices && forceDevices.length) {
    forceDevices.forEach(element => {
      registerDevice({snr: element.split(':')[0], type: element.split(':')[1] ? element.split(':')[1] : 25 })
    })
  } else {
    console.log('Scanning...')
    stickUsb.scanDevices({autoAssignBlinds: false});
  }
}

function callback(err, msg) {
  if(err) {
    console.log('ERROR: ' + err);
  }
  if(msg) {
    switch (msg.topic) {
      case 'wms-vb-init-completion':
        console.log('Warema init completed')
        registerDevices()
        stickUsb.setPosUpdInterval(2000);  // Reduced from 10000ms for faster position/state feedback
        stickUsb.setWatchMovingBlindsInterval(1000)
        break;
      case 'wms-vb-rcv-weather-broadcast':
        if (registered_shades.includes(msg.payload.weather.snr)) {
          client.publish('warema/' + msg.payload.weather.snr + '/illuminance/state', msg.payload.weather.lumen.toString(), {retain: true})
          client.publish('warema/' + msg.payload.weather.snr + '/temperature/state', msg.payload.weather.temp.toString(), {retain: true})
          client.publish('warema/' + msg.payload.weather.snr + '/wind_speed/state', msg.payload.weather.wind.toString(), {retain: true})
          
          // Check if rain data exists and publish it
          if (msg.payload.weather.rain !== undefined) {
            client.publish('warema/' + msg.payload.weather.snr + '/rain/state', msg.payload.weather.rain.toString(), {retain: true})
          }
        } else {
          var availability_topic = 'warema/' + msg.payload.weather.snr + '/availability'
          var payload = {
            name: null,
            availability: [
              {topic: 'warema/bridge/state'},
              {topic: availability_topic}
            ],
            device: {
              identifiers: msg.payload.weather.snr,
              manufacturer: 'Warema',
              model: 'Weather Station',
              name: msg.payload.weather.snr
            },
            force_update: true
          }

          var illuminance_payload = {
            ...payload,
            state_topic: 'warema/' + msg.payload.weather.snr + '/illuminance/state',
            device_class: 'illuminance',
            unique_id: msg.payload.weather.snr + '_illuminance',
            unit_of_measurement: 'lx',
          }
          client.publish('homeassistant/sensor/' + msg.payload.weather.snr + '/illuminance/config', JSON.stringify(illuminance_payload), {retain: true})

          var temperature_payload = {
            ...payload,
            state_topic: 'warema/' + msg.payload.weather.snr + '/temperature/state',
            device_class: 'temperature',
            unique_id: msg.payload.weather.snr + '_temperature',
            unit_of_measurement: '°C',
          }
          client.publish('homeassistant/sensor/' + msg.payload.weather.snr + '/temperature/config', JSON.stringify(temperature_payload), {retain: true})

          var wind_payload = {
            ...payload,
            state_topic: 'warema/' + msg.payload.weather.snr + '/wind_speed/state',
            device_class: 'wind_speed',
            unique_id: msg.payload.weather.snr + '_wind_speed',
            unit_of_measurement: 'm/s',
          }
          client.publish('homeassistant/sensor/' + msg.payload.weather.snr + '/wind_speed/config', JSON.stringify(wind_payload), {retain: true})

          var rain_payload = {
            ...payload,
            state_topic: 'warema/' + msg.payload.weather.snr + '/rain/state',
            device_class: 'moisture',
            unique_id: msg.payload.weather.snr + '_rain',
            icon: 'mdi:weather-rainy',
            payload_on: 'true',
            payload_off: 'false'
          }
          client.publish('homeassistant/binary_sensor/' + msg.payload.weather.snr + '/rain/config', JSON.stringify(rain_payload), {retain: true})

          client.publish(availability_topic, 'online', {retain: true})
          registered_shades.push(msg.payload.weather.snr)
        }
        break;
      case 'wms-vb-blind-position-update':
        var snrKey = msg.payload.snr
        var newPos = msg.payload.position
        var oldPos = shade_position[snrKey] ? shade_position[snrKey].position : undefined
        var prevState = shade_state[snrKey]

        var newState
        if (newPos === 0) {
          newState = 'open'
        } else if (newPos === 100) {
          newState = 'closed'
        } else if (oldPos === undefined || oldPos === newPos) {
          // Position unchanged: if we were moving, mark as stopped; otherwise keep previous state
          if (prevState === 'opening' || prevState === 'closing') {
            newState = 'stopped'
          } else {
            newState = prevState || 'stopped'
          }
        } else {
          // Position changed: determine direction (0=open, 100=closed)
          newState = newPos > oldPos ? 'closing' : 'opening'
        }

        shade_state[snrKey] = newState
        shade_position[snrKey] = { position: newPos, angle: msg.payload.angle }

        client.publish('warema/' + snrKey + '/position', newPos.toString(), {retain: true})
        client.publish('warema/' + snrKey + '/tilt', msg.payload.angle.toString(), {retain: true})
        client.publish('warema/' + snrKey + '/state', newState, {retain: true})
        break;
      case 'wms-vb-scanned-devices':
        console.log('Scanned devices.')
        msg.payload.devices.forEach(element => registerDevice(element))
        console.log(stickUsb.vnBlindsList())
        break;
      default:
        console.log('UNKNOWN MESSAGE: ' + JSON.stringify(msg));
    }
  }
}

var stickUsb = null
var client = null

// Function to get MQTT credentials from Home Assistant Services API
async function getMQTTCredentials() {
    try {
        console.log('🔍 Attempting to get MQTT credentials from Home Assistant Services API...');
        
        const http = require('http');
        const supervisorToken = process.env.SUPERVISOR_TOKEN;
        
        if (!supervisorToken) {
            console.log('⚠️ No SUPERVISOR_TOKEN found, using default MQTT connection');
            return null;
        }
        
        const options = {
            hostname: 'supervisor',
            port: 80,
            path: '/services/mqtt',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${supervisorToken}`,
                'Content-Type': 'application/json'
            }
        };
        
        return new Promise((resolve) => {
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        if (response.result === 'ok' && response.data) {
                            console.log('✅ Got MQTT credentials from Services API');
                            return resolve({
                                host: response.data.host || 'core-mosquitto',
                                port: response.data.port || 1883,
                                username: response.data.username,
                                password: response.data.password
                            });
                        }
                    } catch (e) {
                        console.log('⚠️ Failed to parse Services API response:', e.message);
                    }
                    resolve(null);
                });
            });
            req.on('error', (err) => {
                console.log('⚠️ Services API request failed:', err.message);
                resolve(null);
            });
            req.end();
        });
    } catch (error) {
        console.log('⚠️ Error getting MQTT credentials:', error.message);
        return null;
    }
}

// Debug: Log all environment variables related to MQTT
console.log('🔍 Debugging MQTT environment variables:');
const mqttEnvVars = Object.keys(process.env).filter(key => key.includes('MQTT'));
if (mqttEnvVars.length === 0) {
    console.log('   No MQTT environment variables found');
} else {
    mqttEnvVars.forEach(key => {
        console.log(`   ${key}: ${key.includes('PASS') || key.includes('PASSWORD') ? 'SET' : process.env[key]}`);
    });
}

// Initialize MQTT connection
async function initializeMQTT() {
    console.log('🔌 Connecting to MQTT broker...');
    
    // Try to get MQTT credentials from Services API
    const mqttCreds = await getMQTTCredentials();
    
    const mqttConfig = mqttCreds || {
        host: 'core-mosquitto',
        port: 1883,
        username: 'homeassistant',  // Default HA MQTT add-on user
        password: undefined
    };

    console.log('🔌 MQTT Configuration:');
    console.log('   Host:', mqttConfig.host);
    console.log('   Port:', mqttConfig.port);
    console.log('   Username:', mqttConfig.username || 'NOT SET');
    console.log('   Password:', mqttConfig.password ? 'SET' : 'NOT SET');

    const mqttUrl = `mqtt://${mqttConfig.host}:${mqttConfig.port}`;

    // Create MQTT client
    client = mqtt.connect(mqttUrl, {
        username: mqttConfig.username,
        password: mqttConfig.password,
        will: {
            topic: 'warema/bridge/state',
            payload: 'offline',
            retain: true
        }
    });

    client.on('connect', function (connack) {
      console.log('✅ Connected to MQTT')
      client.subscribe('warema/#')
      client.subscribe('homeassistant/status')
      if (stickUsb == null) {
        console.log('🔌 Initializing WMS USB Stick...')
        stickUsb = new warema(settingsPar.wmsSerialPort,
          settingsPar.wmsChannel,
          settingsPar.wmsPanid,
          settingsPar.wmsKey,
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
      console.log('🔄 MQTT client reconnecting...');
    });

    client.on('message', function (topic, message) {
      var scope = topic.split('/')[0]
      if (scope == 'warema') {
        var device = parseInt(topic.split('/')[1])
        var command = topic.split('/')[2]
        switch (command) {
          case 'set':
            switch (message.toString()) {
              case 'CLOSE':
                console.log('📤 Sending CLOSE command to device: ' + device)
                shade_state[device] = 'closing'
                client.publish('warema/' + device + '/state', 'closing', {retain: true})
                stickUsb.vnBlindSetPosition(device, 100, 100)
                break;
              case 'OPEN':
                console.log('📤 Sending OPEN command to device: ' + device)
                shade_state[device] = 'opening'
                client.publish('warema/' + device + '/state', 'opening', {retain: true})
                stickUsb.vnBlindSetPosition(device, 0, -100)
                break;
              case 'STOP':
                console.log('📤 Sending STOP command to device: ' + device)
                shade_state[device] = 'stopped'
                client.publish('warema/' + device + '/state', 'stopped', {retain: true})
                stickUsb.vnBlindStop(device)
                break;
            }
            break;
          case 'set_position':
            console.log('📤 Sending set_position to "' + message + '" command to device:' + device)
            // Ensure we have position data, use default tilt if not available
            const currentAngle = shade_position[device] ? shade_position[device]['angle'] : 0
            const targetPos = parseInt(message)
            const currentPos = shade_position[device] ? shade_position[device]['position'] : undefined
            const movingState = (currentPos === undefined || targetPos === currentPos)
              ? 'opening'
              : (targetPos > currentPos ? 'closing' : 'opening')
            shade_state[device] = movingState
            client.publish('warema/' + device + '/state', movingState, {retain: true})
            stickUsb.vnBlindSetPosition(device, targetPos, parseInt(currentAngle))
            break;
          case 'set_tilt':
            console.log('📤 Sending set_tilt to "' + message + '" command to device:' + device)
            // Ensure we have position data, use current position or default if not available
            const currentPosition = shade_position[device] ? shade_position[device]['position'] : 50
            stickUsb.vnBlindSetPosition(device, parseInt(currentPosition), parseInt(message))
            break;
        }
      } else if (scope == 'homeassistant') {
        if (topic.split('/')[1] == 'status') {
          switch (message.toString()) {
            case 'online':
              console.log('🏠 Home Assistant is online now')
              registerDevices()
              break;
            default:
              console.log('🏠 Home Assistant is ' + message.toString() +' now')
          }
        }
      }
    })
    
    return client;
}

// Start MQTT connection
initializeMQTT().catch(error => {
    console.log('❌ Failed to initialize MQTT:', error.message);
    process.exit(1);
});
