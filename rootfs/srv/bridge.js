#!/usr/bin/env node

// const warema = require('./warema-wms-venetian-blinds'); // TODO: Re-enable when package works
const mqtt = require('mqtt')

console.log('🚀 Starting Warema Bridge (MQTT-only mode for testing)...')
console.log('🔖 VERSION: 3.0.3-simple - MINIMAL CONFIG TEST')
console.log('🔖 BUILD: ' + new Date().toISOString())
console.log('🔖 IF YOU SEE WAREMA HARDWARE MESSAGES, THE CACHE IS NOT CLEARED!')

originalLog = console.log;
console.log = function () {
    var args = [].slice.call(arguments);
    originalLog.apply(console.log,[getCurrentDateString()].concat(args));
};

function getCurrentDateString() {
    return (new Date()).toISOString() + ':';
};

process.on('SIGINT', function() {
    process.exit(0);
});

console.log('📡 MQTT-only test mode - no Warema hardware initialization')
console.log('🔗 This version will connect to MQTT and show that the add-on works')

var client

// Simple MQTT connection test with proper authentication
async function testMqttConnection() {
  console.log('🚀 Testing MQTT connection...')
  
  // Try to get MQTT credentials from Home Assistant Services API
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

  // Get MQTT credentials
  const mqttConfig = await getMQTTCredentials()
  
  let mqttOptions = {
    will: {
      topic: 'warema/bridge/state',
      payload: 'offline',
      retain: true
    }
  }
  
  let mqttUrl = 'mqtt://core-mosquitto:1883'
  
  // Use credentials if available
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
    console.log('📝 Publishing test message...')
    
    client.publish('warema/bridge/state', 'online', {retain: true})
    client.publish('warema/test', JSON.stringify({
      message: 'Warema Bridge is running',
      timestamp: new Date().toISOString(),
      version: '3.0.3-simple'
    }), {retain: true})
    
    console.log('🎉 MQTT test successful! Add-on is working correctly.')
    console.log('📋 Next step: Add Warema hardware support back')
  })
  
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

// Start the test
testMqttConnection()
