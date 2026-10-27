import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../site/desktop-auth/index.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function page({token=null,search='?port=49152&challenge=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',blocked=false}={}) {
 const nodes=Object.fromEntries(['msg','err','ok','approve','signin'].map(id=>[id,{hidden:id!=='msg',textContent:'',onclick:null}]));
 const local=new Map(token?[['ct.landing.tokens',JSON.stringify(token)]]:[]), session=new Map();
 const location={pathname:'/desktop-auth/',search,href:''};
 const context={document:{getElementById:id=>nodes[id]},location,URLSearchParams,localStorage:{getItem:k=>local.get(k),removeItem:k=>local.delete(k)},sessionStorage:{setItem:(k,v)=>{if(blocked)throw Error('blocked');session.set(k,v);}}};
 vm.runInNewContext(script,context);return {nodes,location,session,local};
}
test('signed-out browser has working Google sign-in and no approval',()=>{const p=page();assert.equal(p.nodes.signin.hidden,false);assert.equal(p.nodes.approve.hidden,true);p.nodes.signin.onclick();assert.equal(p.location.href,'https://api.cinnetemple.com/v1/auth/google');assert.match(p.session.get('ct.resume'),/^\/desktop-auth\/\?port=/);});
test('existing session can switch Google account and clears old tokens',()=>{const p=page({token:{accessToken:'test'}});assert.equal(p.nodes.approve.hidden,false);assert.equal(p.nodes.signin.textContent,'Sign in with another Google account');p.nodes.signin.onclick();assert.equal(p.local.size,0);assert.equal(p.location.href,'https://api.cinnetemple.com/v1/auth/google');});
test('incomplete links expose no inactive buttons',()=>{const p=page({search:''});assert.equal(p.nodes.signin.hidden,true);assert.equal(p.nodes.approve.hidden,true);assert.match(p.nodes.msg.textContent,/incomplete/);});
test('malformed session returns to Google sign-in',()=>{const p=page({token:{}});assert.equal(p.nodes.approve.hidden,true);assert.equal(typeof p.nodes.signin.onclick,'function');});
test('blocked browser storage gives an actionable error',()=>{const p=page({blocked:true});p.nodes.signin.onclick();assert.equal(p.nodes.err.hidden,false);assert.match(p.nodes.err.textContent,/blocked sign-in storage/);assert.equal(p.location.href,'');});
test('stylesheet preserves the native hidden state',()=>{const css=readFileSync(new URL('../site/styles.css',import.meta.url),'utf8');assert.match(css,/\[hidden\]\s*\{\s*display:\s*none\s*!important;/);});
