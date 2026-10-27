import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const callback = readFileSync(new URL('../site/auth/callback/index.html', import.meta.url), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
for (const [resume, expected] of [['/wallet/', '/wallet/'], ['/wallet/?next=https://evil.test', '/'], ['/producer/register/', '/producer/register/'], ['/producer/', '/producer/'], ['/desktop-auth/?port=5000', '/desktop-auth/?port=5000'], ['//evil.test', '/'], ['/producer/../../evil', '/'], ['/desktop-auth.evil.test', '/']]) {
  test(`OAuth return path ${resume}`, () => {
    let destination;
    vm.runInNewContext(callback, { URLSearchParams, history:{replaceState(){}}, location:{hash:'#accessToken=a&refreshToken=r', pathname:'/auth/callback/', replace:v=>{destination=v}}, localStorage:{setItem(){}}, sessionStorage:{getItem:()=>resume,removeItem(){}} });
    assert.equal(destination, expected);
  });
}
const script = readFileSync(new URL('../site/producer/producer.js', import.meta.url), 'utf8');
function page({token, responses=[]}={}) {
  const nodes = new Map(); const calls=[];
  const node = () => ({hidden:false,textContent:'',disabled:false,value:'',children:[],append(...v){this.children.push(...v)},replaceChildren(){this.children=[]},querySelector(){return this.button ||= node()}});
  const get = id => {if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)};
  const local = new Map(token ? [['ct.landing.tokens', JSON.stringify(token)]] : []); const session=new Map();
  const storage = map => ({getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)});
  const location={hash:'',pathname:'/producer/register/',assign:v=>{location.destination=v},replace(){}};
  vm.runInNewContext(script,{document:{getElementById:get,createElement:node},URLSearchParams,URL,Intl,location,history:{replaceState(){}},localStorage:storage(local),sessionStorage:storage(session),fetch:async(url,options)=>{calls.push({url,options});return responses.shift() || {ok:false,status:500}},console});
  return {get,calls,session,local,location};
}
const settle = () => new Promise(resolve=>setImmediate(resolve));
test('Google registration starts a producer return path',()=>{const p=page();p.get('signin').onclick();assert.equal(p.session.get('ct.resume'),'/producer/register/');assert.equal(p.location.destination,'https://api.cinnetemple.com/v1/auth/google');assert.equal(p.calls.length,0)});
test('missing profile offers registration without creating it automatically',async()=>{const p=page({token:{accessToken:'test'},responses:[{ok:false,status:404}]});await settle();assert.equal(p.get('register').hidden,false);assert.equal(p.calls.length,1);assert.equal(p.calls[0].options.headers.Authorization,'Bearer test');assert.match(p.calls[0].url,/account\/dashboard$/)});
test('registration submits only the producer name',async()=>{const p=page();p.get('name').value=' Film House ';await p.get('register').onsubmit({preventDefault(){}});assert.deepEqual(JSON.parse(p.calls[0].options.body),{name:'Film House'})});
test('unauthorized session cannot show a producer dashboard',async()=>{const p=page({token:{accessToken:'expired'},responses:[{ok:false,status:401}]});await settle();assert.equal(p.get('dashboard').hidden,true);assert.equal(p.get('signin').hidden,false)});
