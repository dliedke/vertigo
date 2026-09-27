import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('./dist/',import.meta.url));
const port=Number(process.env.PORT)||8080;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8','.zip':'application/zip'};
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    let path=resolve(root,'.'+pathname);
    if(path!==resolve(root)&&!path.startsWith(resolve(root)+sep)){res.writeHead(403);res.end('Acesso negado');return;}
    if((await stat(path)).isDirectory())path=resolve(path,'index.html');
    const data=await readFile(path);
    res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(data);
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Arquivo não encontrado');}
});
server.on('error',error=>{console.error('Não foi possível iniciar o servidor:',error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>{
  console.log(`VERTIGO está pronto. Abra http://localhost:${port}\nMantenha esta janela aberta enquanto joga. Ctrl+C para encerrar.`);
  if(process.argv.includes('--open')&&process.platform==='win32'){
    const child=spawn('cmd',['/c','start','',`http://localhost:${port}`],{stdio:'ignore',windowsHide:true});child.on('error',()=>{});child.unref();
  }
});
