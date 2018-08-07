const express = require('express')
const bodyParser = require('body-parser')
const qs = require('qs')
const WS = require('ws')
const genUUID = require('uuid').v4

const {fkData, defkData} = require('./utils.js')

const fs = require('fs')
const path = require('path')
const confDir = path.join(__dirname, 'conf.json')
let {
  REMOTE_HWS_URL,
  LOCAL_HWS_URL
} = JSON.parse(fs.readFileSync(confDir))
// REMOTE_HWS_URL = LOCAL_HWS_URL

require('colors')

const resPool = {} // 存放从hws返回的response的res对象
let wsBrowsers = {}

app = express()
app.use(bodyParser.json({
  limit: '1mb'
}))
app.use(bodyParser.urlencoded({ 
  extended: true
}))
require('express-ws')(app)

// functions
function applyHeaders(resp, res) {
  Object.entries(resp.headers).forEach(([key, val]) => {
    res.header(key, val)
  })
}

let hws = {readyState: -1}
function reconnectHWS () {
  if (hws.readyState === 1) { return }
  console.log(`\n[${new Date().toLocaleString()}]`.grey,
              `********* reconnecting hws *********`.red)

  hws = new WS(REMOTE_HWS_URL)
  hws.onmessage = async (event) => {
    // 远端高阶ws请求label，需自曝家门
    if (event.data === 'request label') {
      hws.send('browser')
      return
    }

    const data = JSON.parse(defkData(event.data).toString())
    // 以下是正常通讯message
    switch (data.type) {
      case 'http':
      handleHttp(data)
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


async function handleWSMessage(data) {
  const {uuid} = data
  const ws = wsBrowsers[uuid]
  ws && ws.readyState === 1 && ws.send(JSON.stringify(data))
}

async function handleHttp(data) {
  // 从native返回的http请求，解析出来后需要res给browser
  const {
    status,
    body,
    headers,
    uuid
  } = data
  const res = resPool[uuid]
  if (!res) return
  applyHeaders({ headers }, res)
  
  // 如果是非text类型的，那么过来的是b64，要转成buffer
  const isText = /text|plain|json|xml|html|htm|css|js|javascript/.test(headers['content-type'])
  const respData = isText || body === '' ? body : Buffer.from(body, 'base64')

  res.status(status).send(respData)
  setTimeout(() => delete resPool[uuid], 1000)
}

/**
 * 1. 获取到req的headers，originalUrl，method，body
 * 2. 通过originalUrl获取协议protocol是http还是ws
 * 3. 将headers，originalUrl，method，body，通过websocket传输
 */
app.all('/*', async function (req, res, next) {
  let { originalUrl, method, headers, body } = req
  // headers.referer = 'http://localhost:8765'
  console.log(`method: ${method} => ${originalUrl}`.yellow)
  if (originalUrl.includes('/.websocket')) {
    // 来自browser的建立websocket请求，转给下个中间件处理，这个中间件返回
    return next()
  }
  // 忽略 .js.map 和 .css.map文件，res返回403，中间件函数直接返回
  if (/(\.js|\.css)\.map/.test(originalUrl)) {
    return res.status(403).send('no map file')
  }

  // http请求，通过高阶hws发过去
  const uuid = genUUID()
  if (!/application\/json/.test(headers.accept)) {
    body = qs.stringify(body)
  }
  const data = { originalUrl, method, headers, body, uuid, type: 'http' }
  resPool[uuid] = res
  const buf = fkData(JSON.stringify(data))
  hws.readyState === 1 && hws.send(buf)
})

function dealWithWS(ws, req) {
  // 发送建立ws到8888的请求
  const uuid = genUUID()
  const data = JSON.stringify({
    type: 'createWS',
    headers: req.headers,
    originalUrl: req.originalUrl,
    uuid,
  })
  const buf = fkData(data)
  hws.readyState === 1 && hws.send(buf)
  
  ws.onmessage = async (event) => {
    // 浏览器发来的ws消息，打包送往远端，进一步送到8888
    // 8888的回信会被远端通过hws送回
    console.log('browser ws send'.green.italic)
    const data = JSON.parse(event.data)
    data.type = 'WSMessage'
    data.uuid = uuid
    const buf = fkData(JSON.stringify(data))
    hws.readyState === 1 && hws.send(buf)
  }
  wsBrowsers[uuid] = ws
}

function listenWS(path, func) {
  app.ws(path, func)
}
listenWS('/api/kernels/*', dealWithWS)
// terminal 无法运行，有待排查。不过在ipynb中使用：!instructions 非常方便
listenWS('/terminals/websocket/*', dealWithWS)

app.listen({port: 8080})