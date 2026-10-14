"use strict";
const fs=require("node:fs"),path=require("node:path"),{spawnSync}=require("node:child_process");
let failed=0,count=0;
for(const file of fs.readdirSync(__dirname).filter(f=>/^test-.*\.js$/.test(f)).sort()){
  ++count;
  const result=spawnSync(process.execPath,[path.join(__dirname,file)],{encoding:"utf8"});
  console.log(`${result.status===0?"PASS":"FAIL"} ${file}`);
  if(result.status!==0){++failed;console.error(result.error||result.stderr||result.stdout);}
}
console.log(`${count-failed}/${count} regression suites passed`);
process.exitCode=failed?1:0;
