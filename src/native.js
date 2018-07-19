const express = require('express')
const axios = require('axios')
const bodyParser = require('body-parser')
const qs = require('qs')
const WS = require('ws')

const REMOTE_HWS_URL = 'ws://localhost:8086'
const NBHOST = 'localhost:8888'

let wsClient = {readyState: -1}
const hws = new WS(REMOTE_HWS_URL)
hws.onmessage = async (event) => {
  const data = JSON.parse(event.data)
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
    const data = JSON.parse(event.data)
    data.type = 'WSMessage'
    hws.send(JSON.stringify(data))
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
  console.log(`${method}: ${status} => ${originalUrl}`)
  const retData = {
    type: 'http',
    status,
    headers,
    body,
    uuid
  }
  hws.send(JSON.stringify(retData))
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
}