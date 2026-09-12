import { createServer } from 'node:http';
import { invariant } from '../core/errors.mjs';
export async function startOAuthServer({port,onCallback,onSuccess=()=>{}}) {
  const preconnections=new Set();
  const server=createServer(async(req,res)=>{
    preconnections.delete(req.socket);
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Type','text/plain; charset=utf-8');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");
    try {
      const host=req.headers.host||'';
      invariant([`localhost:${port}`,`127.0.0.1:${port}`].includes(host),'INVALID_HOST','Invalid callback host');
      invariant(req.method==='GET','METHOD_NOT_ALLOWED','Only GET is supported');
      const url=new URL(req.url,'http://localhost');
      invariant(url.pathname==='/oauth/feishu/callback','NOT_FOUND','Not found');
      const code=url.searchParams.get('code'),state=url.searchParams.get('state');
      invariant(code&&state&&code.length<=8192&&state.length<=1024,'INVALID_CALLBACK','Missing or invalid OAuth code/state');
      const result=await onCallback(code,state);
      invariant(result?.success,'OAUTH_FAILED','Feishu did not confirm authorization');
      res.statusCode=200;res.end('飞书授权已保存到本机。可以关闭此页面并返回 MCP 客户端。');
      onSuccess(result);
    } catch(e) {
      res.statusCode=e.code==='NOT_FOUND'?404:400;
      // Never echo code, state, tokens, or upstream error payloads into HTML/logs.
      res.end(`授权未完成（${e.code||'OAUTH_FAILED'}）。请从客户端重新调用 kb_auth，并检查应用回调与权限配置。`);
    }
  });
  server.on('connection',socket=>{
    preconnections.add(socket);
    socket.once('close',()=>preconnections.delete(socket));
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return {close:()=>new Promise((resolve,reject)=>{
    server.close(e=>e?reject(e):resolve());
    // Browser TCP preconnections have no HTTP request for close() to drain.
    // Preserve active callbacks; only discard sockets that never sent a request.
    for(const socket of preconnections)socket.destroy();
  })};
}
