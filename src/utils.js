const crypto = require('crypto')
const zlib = require('zlib')

require('colors')

let _debug = true

const fs = require('fs')
const path = require('path')
const confDir = path.join(__dirname, 'conf.json')
const {
  KEY,
  IV,
  AGL
} = JSON.parse(fs.readFileSync(confDir))

function fkData (data) {
  const origLen = data.length
  data = zlib.gzipSync(data)

  const cipher = crypto.createCipheriv(AGL, KEY, IV)
  const crypted = cipher.update(data)
  const end = cipher.final()
  const buf = Buffer.concat([crypted, end])

  const zipLen = buf.length
  console.log(`compress ratio: ${(zipLen/origLen).toFixed(4)}`.cyan,
              `detail: ${zipLen} / ${origLen}`.magenta)
  return buf
}

function defkData (crypted) {
  const decipher = crypto.createDecipheriv(AGL, KEY, IV)
  const data = decipher.update(crypted)
  const end = decipher.final()
  const buf = Buffer.concat([data, end])

  return zlib.unzipSync(buf)
}

module.exports = {
  fkData,
  defkData,
}