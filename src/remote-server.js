const WS = require('ws')
require('colors')

function toThousands(num) {
  return (num || 0).toString().replace(/(\d)(?=(?:\d{3})+$)/g, '$1,');
}

let totalTransfered = 0
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

    totalTransfered += event.data.length
  }
})

let lastTransfered = totalTransfered
function showSizeInfo () {
  if (lastTransfered === totalTransfered) { return }

  lastTransfered = totalTransfered
  const sizeData = toThousands(totalTransfered)
  console.log(`total transfered: ${totalTransfered} bytes`.red)
}

setInterval(showSizeInfo, 10000)
