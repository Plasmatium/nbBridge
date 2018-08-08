const WS = require('ws')
const fs = require('fs')
const path = require('path')
require('colors')

const confDir = path.join(__dirname, 'conf.json')
let {
  INTERNEL_PORT
} = JSON.parse(fs.readFileSync(confDir))

function toThousands(num) {
  return (num || 0).toString().replace(/(\d)(?=(?:\d{3})+$)/g, '$1,');
}

let totalTransfered = 0
const hws = {}

setInterval(() => {
  hws.nbserver && hws.nbserver.readyState === 1 && hws.nbserver.send('hb')
  hws.browser && hws.browser.readyState === 1 && hws.browser.send('hb')
}, 4.75 * 60 * 1000)

const higherOrderWS = new WS.Server({port: INTERNEL_PORT})
higherOrderWS.on('connection', function connection(ws) {
  console.log('HWS connected'.green)
  
  ws.send('request label') // 让链路建立者自曝家门
  ws.onmessage = async (event) => {
    // 远端高阶ws请求label，需自曝家门
    if (event.data === 'browser') {
      console.log('browser added'.blue)
      // 替换之前那个hws.browser，之前那个要关闭
      hws.last_browser && hws.last_browser.close()
      hws.browser = ws
      hws.last_browser = ws

    } else if (event.data === 'nbserver') {
      console.log('nbserver established'.magenta)
      // 替换之前那个hws.nbserver，之前那个要关闭
      hws.last_nbserver && hws.last_nbserver.close()
      hws.nbserver = ws
      hws.last_nbserver = ws
      
    } else {
      // 普通通信message
      if (ws === hws.nbserver) {
        // nbserver -> browser
        if (!hws.browser || hws.browser.readyState !== 1) {
          console.log('can not access hws - browser'.red)
          return
        }
        hws.browser.send(event.data)
      } else if (ws === hws.browser) {
        // browser -> nbserver
        if (!hws.nbserver || hws.nbserver.readyState !== 1) {
          console.log('can not access hws - nbserver'.red)
          return
        }
        hws.nbserver.send(event.data)
      }
    }

    totalTransfered += event.data.length
  }
  ws.onerror = async (event) => {
    console.log(`\n[${new Date().toLocaleString()}]`.grey,
    `serverside hws err: ${event.message}`.red)
  }
})

let lastTransfered = totalTransfered
function showSizeInfo () {
  if (lastTransfered === totalTransfered) { return }

  lastTransfered = totalTransfered
  const sizeData = toThousands(totalTransfered)
  const ts = `[${new Date().toLocaleString()}]`
  const info = `total transfered: ${sizeData} bytes`
  console.log(ts.grey, info.red)

  // 传输size写入磁盘
  fs.writeFileSync('transfer-size.log', [ts, info, '\n'].join(' '), {flag: 'a'})
}

setInterval(showSizeInfo, 10000)
