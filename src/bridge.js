const express = require('express')
const axios = require('axios')
const bodyParser = require('body-parser')
const qs = require('qs')
const WS = require('ws')

const NBHOST = 'localhost:8888'

app = express()
app.use(bodyParser.json({
  limit: '1mb'
}))
app.use(bodyParser.urlencoded({
    extended:true
}))

require('express-ws')(app)

function applyHeaders(resp, res) {
  Object.entries(resp.headers).forEach(([key, val]) => {
    res.header(key, val)
  })
}

app.all('/*', async function (req, res, next) {
  const method = req.method.toLowerCase()
  const path = req.path
  console.log('%cmethod:'+method+' => '+path, 'color: #ff9900')
  if (req.path.includes('/.websocket')) {
    console.log('%c'+'comm on kernel', 'color: #ff9900')
    return next()
  }

  const headers = req.headers
  let data

  if (/application\/json/.test(headers.accept)) data = req.body
  else data = qs.stringify(req.body)

  let resp;
  headers.host = NBHOST
  // headers.referer = headers.referer ? headers.referer : 'http://localhost:8888' + req.originalUrl
  if (headers.referer)
    { headers.referer = headers.referer.replace(/:\d{4}/, ':8888') }
  headers.origin = 'http://localhost:8888'
  try {
    resp = await axios.request({
      url: `http://${NBHOST}` + req.originalUrl,
      headers,
      method,
      data,
      validateStatus: status => true,
    })
    applyHeaders(resp, res)
    res.send(resp.data)
  } catch (err) {
    console.log('%c method:'+method+' ==xxxxx==> '+path, 'color: #ff0099')
    console.log(`%c ${err.message}`, 'color: #ff0099')
  }
  next()
})

app.ws('/api/kernels/*', function(ws, req) {
  const headers = req.headers

  // headers.referer = headers.referer ? headers.referer : 'http://localhost:8888' + '/notebooks/src/main.ipynb'
  // headers.referer = headers.referer.replace(/:\d{4}/, ':8888')
  // headers.origin = 'http://localhost:8888'

  const url = `ws://${NBHOST}` + req.originalUrl.replace('/.websocket', '')
  delete req.headers['sec-websocket-key']
  const wsClient = new WS(url, {headers: req.headers})

  ws.on('message', (data) => {
    // 8765来的jsonData，要送往8888
    wsClient.readyState === 1 && wsClient.send(data)
  })

  wsClient.onmessage = (resp) => {
    // 8888来的数据，要送往8765
    ws.readyState === 1 && ws.send(resp.data)
  }

  Object.assign(global, {wsClient, ws})
})

app.listen(8765)