# NoteBook Bridge

## 背景

1. AWS用不起，各种GPU云都用不起
2. Mac Book不能运行`tensorflow-gpu`
3. GPU笔记本太重不想来回搬动，用起来没有Mac舒服，没有retina屏
4. 希望在任何地方能用自己的Mac Book连到GPU笔记本上的jupyter notebook

## 思路

在本地的mac上开一个服务，所有的请求（包括`http`和`websocket`），都用**hws** _（higher order websocket，高阶websocket）_传输到ECS服务器，然后ECS服务器通过**hws**转发到公司GPU笔记本。

## 如何安装及使用

> Mac本地运行一个nodejs服务`src/remote.js`，ECS运行一个nodejs转发服务`remote-server.js`，GPU笔记本也在本地运行一个nodejs服务`src/native.js`

### 安装

首先要有nodejs环境，直接去node官网下载安装即可。然后`git clone`，`npm i`，npm如果没速度，或许你需要[cnpm](http://npm.taobao.org/)

```bash
git clone https://github.com/Plasmatium/nbBridge
cnpm i
```

### 配置及使用

> 有两件东西需要配置，ECS的nginx.conf和传输两端的conf.json

#### `conf.json`

按照如下格式配置，密码和url根据自身情况更改：

```json
{
  "REMOTE_HWS_URL": "ws://your/ECS/websocket/path",
  "LOCAL_HWS_URL": "ws://your/native/websocket/path",
  "INTERNEL_PORT": "YOUR_INTERNEL_PORT",
  "KEY":  "pwd_with_16_char",
  "IV":   "iv__widh_16_char",
  "AGL":  "aes-128-cbc"
}
```

#### `nginx.conf`

按照如下格式配置，只是部分配置，其他部分具体请参照nginx文档。其中`YOUR_INTERNEL_HWS_SERVER`和上述`INTERNEL_PORT`相关，比如`INTERNEL_PORT`设为8765，那么`YOUR_INTERNEL_HWS_SERVER`设为http://localhost:8765

```nginx
# higher order websocket
location /your/ECS/websocket/path {
  proxy_pass YOUR_INTERNEL_HWS_SERVER;
  proxy_redirect off;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

  proxy_read_timeout 300s;

  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";

  error_log off;
  access_log off;
}
```

#### 启动两地服务

> 注：两端和ECS都需要放好`conf.json`

1. 在GPU本上首先启动服务：`node src/native.js`
2. 登陆ECS，启动nginx，启动node服务：`node src/remote-server.js`
3. Mac上启动node服务：`node src/remote.js`

## 转发流程

### http

> http请求相对websocket简单：Mac请求 -> ECS转发 -> GPU本响应 -> ECS转发回来 -> Mac浏览器收到响应并渲染页面

#### request

1. 在mac上，请求http，比如http://localhost:8080
2. 生成一个`uuid`，将上面请求的响应对象`res`存储在一个响应池中，key是`uuid`。
3. 将上述请求中的`headers`，`body`，`originalUrl`，以及上述`uuid`打包压缩加密为`sendData`。
4. 用**hws**发送`sendData`到ECS
5. ECS转发**hws**的内容到GPU笔记本上
6. GPU本解码解包，获取到`headers`，`body`，`originalUrl`，`uuid`，伪装`headers`成为本地请求，将`originalUrl`改成`jupyter notebook`的url，比如将`http://localhost:8080`改成`http://localhost:8888`，然后将`headers`，`body`发送到该url

#### response

1. GPU本收到上面第7步的request之后，以为是本地机器请求`jupyter notebook`，会发送响应`response`，包括`headers`，`status`，`body`
2. 将上述`headers`, `status`, `body`, 以及上面**request**中的`uuid`一起打包压缩加密为`respData`，用**hws**发送到ECS上
3. ECS转发respData到本地Mac电脑上
4. Mac解包解码，获得`headers`, `status`, `body`, `uuid`
5. 在**request**步骤1里创建的响应池中，通过`uuid`找到该请求的响应对象`res`
6. 用`res.status`和`res.send`，将上述第3步解码出来的`headers`, `status`, `body`发送到Mac上浏览器，一个完整的请求->响应链至此结束。

### websocket

> websocket相对复杂些，需要将上下行链路小心翼翼串起来，具体是上家websocket的`onmessage`里使用对的下家websocket的`send`

#### 建立websocket

1. Mac浏览器发出创建websocket请求到Mac本地`ws://localhost:8080，`含有`headers`, `originalUrl`
2. 生成`uuid`，连同上一步获得的`headers`, `originalUrl`一起打包压缩加密，通过**hws**发送到ECS
3. 用上述`uuid`，以及浏览器创建在本地的ws，存入到ws池中，`uuid`作为索引
4. ECS通过hws转发这个加密包到GPU本
5. GPU本解包解码获得`originalUrl`, `headers`, `uuid`
6. 通过上一步的`originalUrl`, `headers`，创建websocket，并用`uuid`作为索引存放在ws池里

#### ws通信

1. 浏览器发出ws的message，将`event.data`, 发出这个信息的`ws`对应的`uuid`一起打包压缩加密，通过**hws**发送到ECS
2. ECS用**hws**转发这个加密包到GPU本
3. GPU本解包解码，获得`event.data`和`uuid`, 通过`uuid`找到ws池中的ws对象，用该ws发送`event.data`到`jupyter notebook`服务器
4. `jupyter notebook`做出回应，会触发上述`uuid`对应的ws的`onmessage`方法。在此方法中，打包回应的`event.data`，连同`uuid`一起打包压缩加密，通过**hws**发往ECS
5. ECS上用**hws**转发该加密包到Mac上
6. Mac解码解包，获得`event.data`，`uuid`，通过该`uuid`找到ws池中对应的ws，用该ws发送`event.data`，浏览器将会收到数据并渲染（该ws即浏览器创建在Mac上的websocket）

## Flow示意图

![示意图](https://github.com/Plasmatium/nbBridge/raw/master/flow.png)