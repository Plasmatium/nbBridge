from flask import Flask, request, Response
# from flask_cors import CORS
# from flask.ext.socketio import SocketIO, send, emit
from flask_socketio import SocketIO, send, emit
from pdb import set_trace
import requests
from http.cookies import SimpleCookie

from ws4py.client.threadedclient import WebSocketClient


class DummyClient(WebSocketClient):
  def opened(self):
    self.send("www.baidu.com")

  def closed(self, code, reason=None):
    print("Closed down", code, reason)

  def received_message(self, m):
    print(m)


app = Flask(__name__, static_url_path='/xxx')
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app)

sess = requests.Session()

# @app.route('/test', methods=['GET', 'POST', 'DELETE', 'PUT'])
# def deal2():
#   return Response(b'', 101, dict(request.headers))

# @app.route('/api/kernels/<path:path>', methods=['GET', 'POST', 'DELETE', 'PUT'])
# def deal(path):
#   set_trace()
#   resp = sess.request(
#     url='http://localhost:8888' + request.full_path,
#     method=request.method,
#     data=(request.form or request.data), headers=request.headers)
#   return Response(resp.content, resp.status_code, dict(resp.headers))
  
# @app.route('/api/kernels/<bypass_kernels:path>')
# def bypass(path):
#   set_trace()
#   return 0

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>', methods=['GET', 'POST', 'DELETE', 'PUT'])
def resp(path):
  headers = request.headers
  
  # rawCookies = headers['Cookie']
  # rawCookies = SimpleCookie(rawCookies)
  # cookies = requests.utils.cookiejar_from_dict({i.key:i.value for i in rawCookies.values()},
  #   cookiejar=None, overwrite=True)
  # sess.cookies = cookies

  method = request.method.lower()
  set_trace()
  resp = sess.request(url='http://localhost:8888' + request.full_path,
    method=method, data=(request.form or request.data), headers=headers) #, cookies=cookies)

  headers = resp.headers
  return Response(resp.content, resp.status_code, dict(resp.headers))

# @socketio.on('connect', namespace='/test')
# def connect():
#   print('connected')
#   send({'data': 'conected'})

# @socketio.on('message')
# def transfer(msg):
#   print('message')
#   set_trace()

# def recvThread():
#     while True:
#         socketio.sleep(4)
#         emit("response")


# app.run(port='8765', debug=True)
socketio.run(app, port='5678', debug=True, log_output=True)