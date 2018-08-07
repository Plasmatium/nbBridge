const axios = require('axios')
const WS = require('ws')
const {fkData, defkData} = require('./utils.js')

require('colors')

const fs = require('fs')
const path = require('path')

const confDir = path.join(__dirname, 'conf.json')
let {REMOTE_HWS_URL, LOCAL_HWS_URL} = JSON.parse(fs.readFileSync(confDir))
// REMOTE_HWS_URL = LOCAL_HWS_URL
const NBHOST = 'localhost:8888'

let wsClients = {}
let hws = {readyState: -1}
function reconnectHWS() {
  if (hws.readyState === 1) { return }
  console.log(`\n[${new Date().toLocaleString()}]`.grey,
              `********* reconnecting hws *********`.red)
  
  let currHeartBeatTimerId = -1
  hws = new WS(REMOTE_HWS_URL)
  hws.onmessage = async (event) => {
    // 远端高阶ws请求label，需自曝家门
    if (event.data === 'request label') {
      hws.send('nbserver')
      return
    }

    // hws 心跳机制, 服务器大概4.75min触发一次，这边定时5分钟
    // 收不到就关闭ws，触发close事件中的重连接
    if (event.data === 'hb') {
      clearTimeout(currHeartBeatTimerId)
      currHeartBeatTimerId = setTimeout(() => {
        hws.close()
      }, 5 * 60 * 1000)
      return
    }

    const data = JSON.parse(defkData(event.data).toString())
    switch (data.type) {
      case 'http':
        handleHttp(data)
        break

      case 'createWS':
        handleCreateWS(data)
        break

      case 'WSMessage':
        handleWSMessage(data)
        break
    }
  }
  hws.onclose = async (event) => {
    setTimeout(reconnectHWS, 5000)
  }
  hws.onerror = async (event) => {
    console.log('err: hws error'.red)
    console.log(String(event.message).red)
  }
}
reconnectHWS()

async function handleWSMessage (data) {
  // 浏览器发来的ws信息，转送到8888
  const {uuid} = data
  const ws = wsClients[uuid]
  ws && ws.readyState === 1 && ws.send(JSON.stringify(data))
}

async function handleCreateWS (data) {
  const {headers, originalUrl, uuid} = data
  const url = `ws://${NBHOST}` + originalUrl.replace('/.websocket', '')
  forgeAndModify(headers) // 伪造referer和host
  delete headers['sec-websocket-key']

  ws = new WS(url, {headers})
  ws.uuid = uuid
  ws.onmessage = async (event) => {
    console.log('nbserver ws send'.yellow.italic)
    const data = JSON.parse(event.data)
    data.type = 'WSMessage'
    data.uuid = uuid
    const buf = fkData(JSON.stringify(data))
    hws.readyState && hws.send(buf)
  }
  wsClients[uuid] = ws
}

async function handleHttp (data) {
  let {
    originalUrl,
    method,
    headers,
    body,
    uuid
  } = data
  forgeAndModify(headers) // 伪造referer和host

  let responseType = 'arraybuffer'
  const resp = await axios.request({
    url: `http://${NBHOST}` + originalUrl,
    headers,
    method,
    data: body,
    responseType,
    validateStatus: () => true,
  })

  body = resp.data
  headers = resp.headers
  status = resp.status

  const isText = /text|plain|json|xml|html|htm|css|js|javascript/.test(headers['content-type'])
  if (isText) {
    body = body.toString()
  } else if (body.length === 0) {
    body = '' // 返回是304，body直接改成0，否则会变成{type: "Buffer", data: [0]}
  } else {
    // 是图片或者font之类的
    body = body.toString('base64') // 对于图片之类的来说，字符串化对象，不如b64化，紧凑度更高，易压缩
  }

  console.log(`${method}: ${status} => ${originalUrl}`.green)
  const retData = {
    type: 'http',
    status,
    headers,
    body,
    uuid
  }
  const buf = fkData(JSON.stringify(retData))
  hws.send(buf)
}

function forgeAndModify(headers) {
  if (headers.host) {
    headers.host = 'localhost:8888'
  }
  if (headers.referer) {
    headers.referer = 'http://localhost:8888'
  }
  if (headers.origin) {
    headers.origin = 'http://localhost:8888'
  }

  delete headers["x-real-ip"]
  delete headers["x-forwarded-for"]
}