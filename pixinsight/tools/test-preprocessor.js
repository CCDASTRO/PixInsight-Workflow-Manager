"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','CCDASTROWorkflowManager.js'),'utf8');
// Syntax tests that discard # lines cannot catch misspelled PJSR directives.
const supported=new Set(['engine','feature-id','feature-info','define','undef','include','if','ifdef','ifndef','ifeq','ifneq','iflt','ifgt','iflteq','ifgteq','else','endif','error','warning','pragma']);
for(const line of source.split(/\r?\n/)){const m=line.match(/^\s*#([\w-]+)/);if(m)assert(supported.has(m[1]),'Unsupported PJSR directive: '+m[1]);}
const header=source.slice(source.indexOf('#define SOLVER_SETTINGS_MODULE'),source.indexOf('#include <pjsr/astrometry/AstrometricMetadata.js>'));
function version(build){let active=true,result;const stack=[];for(const line of header.split(/\r?\n/)){
 let m;if((m=line.match(/^#ifgteq __PI_BUILD__ (\d+)$/))){stack.push({parent:active,condition:build>=Number(m[1]),elseSeen:false});active=active&&build>=Number(m[1]);}
 else if(line==='#else'){assert(stack.length,'Unmatched else');const top=stack.at(-1);assert(!top.elseSeen,'Duplicate else');top.elseSeen=true;active=top.parent&&!top.condition;}
 else if(line==='#endif'){assert(stack.length,'Unmatched endif');active=stack.pop().parent;}
 else if(active&&(m=line.match(/^#define VERSION "([^"]+)"$/)))result=m[1];
 }assert.equal(stack.length,0);return result;}
for(const [build,expected] of [[1693,'6.4.2'],[1701,'6.4.2'],[1702,'6.5.0'],[1706,'6.5.0'],[1707,'6.6.0'],[1713,'6.6.0']])assert.equal(version(build),expected);
assert.match(source,/#define VERSION "1\.9\.3"/);
console.log('PASS PJSR directive syntax, balanced branches, and solver version build boundaries');
