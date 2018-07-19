const httpProxy = require('http-proxy')

ps = httpProxy.createProxyServer({
  target: 'http://localhost:8888',
  ws: true,
})

// ps.on('proxyRes', function (proxyRes, req, res) {
//   proxyRes.on('end', function () {
//     console.log(proxyRes);
//     res.end();
//   });
// })

ps.listen(8765)