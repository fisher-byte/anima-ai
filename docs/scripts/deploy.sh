#!/usr/bin/env bash
# 用法: ./docs/scripts/deploy.sh            仅代码部署
#       SYNC_ENV=1 ./docs/scripts/deploy.sh 同步 .env 指定键
set -euo pipefail

DEPLOY_SSH_HOST="${DEPLOY_SSH_HOST:-hk-relay}"
REMOTE_DIR="${REMOTE_DIR:-/opt/evocanvas}"
RELEASES_DIR="${RELEASES_DIR:-/opt/evocanvas-releases}"
BACKUPS_DIR="${BACKUPS_DIR:-/opt/evocanvas-backups}"
TS="$(date +%Y%m%d-%H%M%S)"
STAGE_DIR="${RELEASES_DIR}/stage-${TS}"
BACKUP_DIR="${BACKUPS_DIR}/app-${TS}"
LOCAL_ENV_FILE="${LOCAL_ENV_FILE:-.env}"
SYNC_KEYS="${SYNC_KEYS:-OPENROUTER_API_KEY OPENROUTER_MODEL AI_FREE_ONLY ACCESS_TOKEN ACCESS_TOKENS AUTH_DISABLED APP_COMMIT HOST}"
CLEAR_KEYS="SHARED_API_KEY ONBOARDING_API_KEY RENDERER_VITE_API_KEY BUILTIN_EMBED_API_KEY"
MANAGED_MODEL='dots-studio/dots-3-note-preview:free'

REPO_ROOT="$(git rev-parse --show-toplevel)"
export REPO_ROOT
cd "$REPO_ROOT"

echo "==> [1/6] 检查工作区与归档"
if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: 存在未提交/未跟踪文件，拒绝部署" >&2
  exit 1
fi
HEAD_SHA="$(git rev-parse HEAD)"
PKG_VERSION="$(node -p "require('./package.json').version")"
echo "    HEAD = ${HEAD_SHA}  version = ${PKG_VERSION}"

TAR_TMP="$(mktemp -t anima-deploy-XXXXXX.tar)"
PATCH_DIR=""
cleanup() { rm -f "$TAR_TMP"; [ -n "$PATCH_DIR" ] && rm -f "$PATCH_DIR/env.patch" && rmdir "$PATCH_DIR" || true; }
trap cleanup EXIT
git archive --format=tar HEAD > "$TAR_TMP"
BAD=$(tar -tf "$TAR_TMP" | grep -vE '^\.env\.example$' | grep -E '(^|/)\.env($|\.)|(^|/)data/|(^|/)\.aoci/|(^|/)\.git/|apikey|api_key' || true)
if [ -n "$BAD" ]; then
  echo "ERROR: 归档含禁止部署文件: $BAD" >&2
  exit 1
fi

if [ "${SYNC_ENV:-0}" = "1" ]; then
  if [ ! -f "$LOCAL_ENV_FILE" ]; then echo "ERROR: $LOCAL_ENV_FILE 不存在" >&2; exit 1; fi
  for key in $SYNC_KEYS; do
    if ! echo "$key" | grep -qE '^[A-Z_][A-Z0-9_]*$'; then
      echo "ERROR: 非法键名 $key" >&2; exit 1
    fi
  done
  PATCH_DIR="$(mktemp -d -t anima-env-XXXXXX)"
  chmod 700 "$PATCH_DIR"
  PATCH_FILE="$PATCH_DIR/env.patch"
  node -e "
    const fs=require('fs'),path=require('path')
    const dotenv=require(path.join(process.env.REPO_ROOT,'node_modules','dotenv'))
    const parsed=dotenv.parse(fs.readFileSync(process.argv[1],'utf8'))
    const keys=process.argv[2].split(' ').filter(Boolean)
    const clearKeys=process.argv[3].split(' ').filter(Boolean)
    const out={}
    for(const k of keys){
      let v=parsed[k]
      if(k==='OPENROUTER_API_KEY'&&v===undefined) v=parsed['openrouter_apikey']
      if(v!==undefined) out[k]=v
    }
    for(const k of clearKeys) out[k]=''
    fs.writeFileSync(process.argv[4],Object.entries(out).map(([k,v])=>k+'='+JSON.stringify(v)).join('\n')+'\n',{mode:0o600})
  " "$LOCAL_ENV_FILE" "$SYNC_KEYS" "$CLEAR_KEYS" "$PATCH_FILE"
  node -e "
    const fs=require('fs'),path=require('path')
    const dotenv=require(path.join(process.env.REPO_ROOT,'node_modules','dotenv'))
    const patch=dotenv.parse(fs.readFileSync(process.argv[1],'utf8'))
    const vals=Object.entries(patch)
      .filter(([k,v])=>/KEY|TOKEN|SECRET|PASS/i.test(k)&&v&&v.length>=8)
      .map(([,v])=>v)
    const tar=fs.readFileSync(process.argv[2])
    let leak=false
    for(const v of vals){ if(tar.includes(v)){leak=true;break} }
    process.exit(leak?1:0)
  " "$PATCH_FILE" "$TAR_TMP" || { echo "ERROR: 归档包含真实密钥值" >&2; exit 1; }
fi

echo "==> [2/6] 远端准备 + staging 构建（不触碰线上文件）"
ssh "$DEPLOY_SSH_HOST" "
  mkdir -p '$RELEASES_DIR' '$BACKUPS_DIR' &&
  chmod 700 '$RELEASES_DIR' '$BACKUPS_DIR' &&
  mkdir -p '$STAGE_DIR' '$BACKUP_DIR' &&
  chmod 700 '$STAGE_DIR' '$BACKUP_DIR' &&
  [ -d '$REMOTE_DIR' ] || { echo 'remote dir missing' >&2; exit 1; }
"
scp -q "$TAR_TMP" "$DEPLOY_SSH_HOST:${STAGE_DIR}/app.tar"
ssh "$DEPLOY_SSH_HOST" "cd '$STAGE_DIR' && tar -xf app.tar && rm -f app.tar"

ssh "$DEPLOY_SSH_HOST" "cd '$STAGE_DIR' &&
  ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --include=dev --no-audit --no-fund >/tmp/evocanvas-ci-${TS}.log 2>&1 &&
  npm run build >/tmp/evocanvas-build-${TS}.log 2>&1" || {
    echo "BUILD FAILED on staging，线上文件未触碰" >&2
    exit 1
  }

echo "==> [3/6] 环境合并预计算（先于任何线上变更完成并校验）"
if [ "${SYNC_ENV:-0}" = "1" ]; then
  scp -q "$PATCH_FILE" "$DEPLOY_SSH_HOST:${STAGE_DIR}/.env.patch"
  ssh "$DEPLOY_SSH_HOST" "REMOTE_DIR='$REMOTE_DIR' STAGE_DIR='$STAGE_DIR' MANAGED_MODEL='$MANAGED_MODEL' bash -s" <<'EOS'
set -euo pipefail
node -e '
  const fs=require("fs"),path=require("path")
  const dotenv=require(path.join(process.env.STAGE_DIR,"node_modules","dotenv"))
  const envPath=path.join(process.env.REMOTE_DIR,".env")
  const existing=fs.existsSync(envPath)?dotenv.parse(fs.readFileSync(envPath,"utf8")):{}
  const patch=dotenv.parse(fs.readFileSync(path.join(process.env.STAGE_DIR,".env.patch"),"utf8"))
  const merged={...existing,...patch,
    AI_FREE_ONLY:"true",
    OPENROUTER_MODEL:process.env.MANAGED_MODEL,
    AUTH_DISABLED:"false"}
  if(!merged.OPENROUTER_API_KEY){console.error("missing OPENROUTER_API_KEY");process.exit(1)}
  if(!merged.ACCESS_TOKEN&&!merged.ACCESS_TOKENS){console.error("missing access token allowlist");process.exit(1)}
  const tmp=path.join(process.env.STAGE_DIR,"env.merged")
  fs.writeFileSync(tmp,Object.entries(merged).map(([k,v])=>k+"="+JSON.stringify(v)).join("\n")+"\n",{mode:0o600})
'
rm -f "$STAGE_DIR/.env.patch"
EOS
else
  echo "    SYNC_ENV!=1，远端 .env 保持原值"
fi

echo "==> [4/6] 客户端产物密钥扫描（精确值进程内比对 + 模式兜底）"
ssh "$DEPLOY_SSH_HOST" "STAGE_DIR='$STAGE_DIR' bash -s" <<'EOS'
set -euo pipefail
cd "$STAGE_DIR"
node -e '
  const fs=require("fs"),path=require("path")
  const dotenv=require(path.join(process.env.STAGE_DIR,"node_modules","dotenv"))
  const mergedPath=path.join(process.env.STAGE_DIR,"env.merged")
  const known=fs.existsSync(mergedPath)?Object.entries(dotenv.parse(fs.readFileSync(mergedPath,"utf8")))
    .filter(([k,v])=>/KEY|TOKEN|SECRET|PASS/i.test(k)&&v&&v.length>=8).map(([,v])=>v):[]
  let hit=false
  const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){
    const p=path.join(d,e.name)
    if(e.isDirectory())walk(p)
    else if(/\.(js|html|css|map)$/.test(e.name)){
      const c=fs.readFileSync(p,"utf8")
      if(/sk-or-[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9]{20,}/.test(c)){hit=true;console.log("key-like string in",p)}
      for(const v of known){ if(c.includes(v)){hit=true;console.log("known secret value in",p);break} }
    }}}
  walk("dist")
  process.exit(hit?1:0)
'
EOS

echo "==> [5/6] 备份 + 切换 + env 激活 + 重启 + 健康校验（单事务，失败自动回滚）"
ssh "$DEPLOY_SSH_HOST" "REMOTE_DIR='$REMOTE_DIR' STAGE_DIR='$STAGE_DIR' BACKUP_DIR='$BACKUP_DIR' APP_COMMIT='$HEAD_SHA' EXPECT_VERSION='$PKG_VERSION' EXPECT_MODEL='$MANAGED_MODEL' bash -s" <<'EOS'
set -euo pipefail
ITEMS="src dist node_modules package.json package-lock.json tsconfig.json vite.config.ts shared scripts docs index.html electron"
cd "$REMOTE_DIR"

rollback() {
  cd "$REMOTE_DIR"
  for item in $ITEMS; do
    if [ -e "$BACKUP_DIR/$item" ]; then
      [ -e "$item" ] && mv "$item" "$BACKUP_DIR/failed-$item"
      mv "$BACKUP_DIR/$item" "$item"
    fi
  done
  [ -f "$BACKUP_DIR/env.bak" ] && cp -a "$BACKUP_DIR/env.bak" .env && chmod 600 .env
  node -e '
    const fs=require("fs"),cp=require("child_process"),path=require("path")
    const dotenv=require(path.join(process.env.REMOTE_DIR,"node_modules","dotenv"))
    const parsed=fs.existsSync(".env")?dotenv.parse(fs.readFileSync(".env","utf8")):{}
    cp.spawnSync("pm2",["restart","evocanvas","--update-env"],{env:{...process.env,...parsed,NODE_ENV:"production"},stdio:"pipe"})
  ' || true
  echo "ROLLBACK COMPLETE" >&2
}
trap rollback ERR

[ -f .env ] && cp -a .env "$BACKUP_DIR/env.bak" && chmod 600 "$BACKUP_DIR/env.bak"
for item in $ITEMS; do
  if [ -e "$item" ]; then mv "$item" "$BACKUP_DIR/"; fi
done

[ -d "$STAGE_DIR/dist" ] || { echo "stage dist missing" >&2; exit 1; }
[ -d "$STAGE_DIR/node_modules" ] || { echo "stage node_modules missing" >&2; exit 1; }
cd "$STAGE_DIR"
shopt -s dotglob
for item in *; do
  case "$item" in
    dist|node_modules|app.tar|env.merged|data|.aoci) continue ;;
    .env.example) cp -a "$item" "$REMOTE_DIR/" ;;
    .env|.env.*) continue ;;
    *) cp -a "$item" "$REMOTE_DIR/" ;;
  esac
done
mv "$STAGE_DIR/dist" "$REMOTE_DIR/dist"
mv "$STAGE_DIR/node_modules" "$REMOTE_DIR/node_modules"

if [ -f "$STAGE_DIR/env.merged" ]; then
  cd "$REMOTE_DIR"
  cp "$STAGE_DIR/env.merged" ".env.tmp.$$" && chmod 600 ".env.tmp.$$" && mv ".env.tmp.$$" .env
  rm -f "$STAGE_DIR/env.merged"
fi

cd "$REMOTE_DIR"
node -e '
  const fs=require("fs"),cp=require("child_process"),path=require("path"),http=require("http")
  const dotenv=require(path.join(process.env.REMOTE_DIR,"node_modules","dotenv"))
  const parsed=fs.existsSync(".env")?dotenv.parse(fs.readFileSync(".env","utf8")):{}
  const env={...process.env,...parsed,
    NODE_ENV:"production",HOST:"127.0.0.1",
    APP_COMMIT:process.env.APP_COMMIT,
    PORT:parsed.PORT||"3001",
    DATA_DIR:parsed.DATA_DIR||(process.cwd()+"/data")}
  const r=cp.spawnSync("pm2",["restart","evocanvas","--update-env"],{env,stdio:"pipe"})
  if(r.status!==0){console.error("pm2 restart failed");process.exit(1)}
  const port=Number(env.PORT)
  const deadline=Date.now()+45000
  const probe=()=>new Promise(res=>{
    http.get({host:"127.0.0.1",port,path:"/api/health"},resp=>{
      let d="";resp.on("data",c=>d+=c).on("end",()=>{try{res(JSON.parse(d))}catch{res(null)}})
    }).on("error",()=>res(null))
  })
  ;(async()=>{
    while(Date.now()<deadline){
      const j=await probe()
      if(j&&j.status==="ok"){
        const ok=j.commit===process.env.APP_COMMIT
          &&j.managed===true
          &&j.provider==="openrouter"
          &&j.model===process.env.EXPECT_MODEL
          &&j.version===process.env.EXPECT_VERSION
        if(ok){
          console.log("health ok:",JSON.stringify({version:j.version,commit:j.commit,managed:j.managed,provider:j.provider,model:j.model}))
          process.exit(0)
        }
        console.error("health mismatch:",JSON.stringify({version:j.version,commit:j.commit,managed:j.managed,provider:j.provider,model:j.model}))
        process.exit(2)
      }
      await new Promise(r=>setTimeout(r,1500))
    }
    console.error("health check timeout");process.exit(2)
  })()
'
trap - ERR
EOS

echo "==> [6/6] 完成 HEAD=${HEAD_SHA} stage=${STAGE_DIR} backup=${BACKUP_DIR}"
