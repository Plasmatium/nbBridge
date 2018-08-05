const WS = require('ws')
// const genUUID = require('uuid').v4
const axios = require('axios')

require('colors')

const hws = {}

const higherOrderWS = new WS.Server({port: 8086})
higherOrderWS.on('connection', function connection(ws) {
  console.log('HWS connected'.green)
  
  ws.send('request label') // 让链路建立者自曝家门
  ws.onmessage = async (event) => {
    // 远端高阶ws请求label，需自曝家门
    if (event.data === 'browser') {
      console.log('browser added'.blue)
      // const uuid = 'browser-' + genUUID()
      // hws[uuid] = ws
      hws.last_browser && hws.last_browser.close()
      hws.browser = ws
      hws.last_browser = ws
    } else if (event.data === 'nbserver') {
      console.log('nbserver established'.magenta)
      hws.nbserver = ws
    } else {
      // 普通通信message
      if (ws === hws.nbserver) {
        // nbserver -> browser
        hws.browser.send(event.data)
      } else if (ws === hws.browser) {
        // browser -> nbserver
        hws.nbserver.send(event.data)
      }
    }
  }
})