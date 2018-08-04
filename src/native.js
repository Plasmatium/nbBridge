const express = require('express')
const axios = require('axios')
const bodyParser = require('body-parser')
const qs = require('qs')
const WS = require('ws')
const {fkData, defkData} = require('./utils.js')

require('colors')

const fs = require('fs')
const path = require('path')

const confDir = path.join(__dirname, 'conf.json')
let {REMOTE_HWS_URL, LOCAL_HWS_URL} = JSON.parse(fs.readFileSync(confDir))
REMOTE_HWS_URL = LOCAL_HWS_URL
const NBHOST = 'localhost:8888'

let wsClient = {readyState: -1}
const hws = new WS(REMOTE_HWS_URL)

hws.onmessage = async (event) => {
  // 远端高阶ws请求label，需自曝家门
  if (event.data === 'request label') {
    hws.send('nbserver')
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

async function handleWSMessage (data) {
  // 浏览器发来的ws信息，转送到8888
  delete data['type']
  wsClient.readyState === 1 && wsClient.send(JSON.stringify(data))
}

async function handleCreateWS (data) {
  const {headers, originalUrl} = data
  const url = `ws://${NBHOST}` + originalUrl.replace('/.websocket', '')
  forgeAndModify(headers) // 伪造referer和host
  delete headers['sec-websocket-key']

  wsClient = new WS(url, {headers})
  wsClient.onmessage = async (event) => {
    console.log('nbserver ws send'.yellow.italic)
    const data = JSON.parse(event.data)
    data.type = 'WSMessage'
    const buf = fkData(JSON.stringify(data))
    hws.send(buf)
  }
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

  if (/text|application/.test(headers['content-type'])) {
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